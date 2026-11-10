import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireTeamAuth } from "./team-auth";
import { activityEvidence, type BulkOperation, type BulkOutcome } from "@/lib/bulk-operation";
import type { Json } from "@/integrations/supabase/types";

/** Kinds whose interrupted runs can be checked against fresh Contacts and unlocked by the team. */
const RECONCILABLE = ["target-import","contact-import","contact-merge","contact-merge-undo"];
/** Every interrupted activity can be checked and unlocked; kinds without a saved-state reader record their last journaled outcomes for review. */
const canSelfRecover = (_kind: string) => true;

export const inspectBulkOperation = createServerFn({ method: "POST" }).middleware([requireTeamAuth])
  .inputValidator(input => z.object({ id:z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { journalClient } = await import("./bulk-journal.server");
    const db = await journalClient();
    const { data:op,error } = await db.from("bulk_operations").select("*").eq("id",data.id).single();
    if(error || !op || op.kind !== "relationship-change") throw new Error("This operation cannot be inspected as a relationship change.");
    const { inspectRelationshipState } = await import("./relationship-reconciliation.server");
    const { withDeadline } = await import("./request-deadline.server");
    const outcomes = await withDeadline("inspect relationship saved state",40_000,step => { step("reading Network and Prospecting without writes");return inspectRelationshipState(op.input as unknown as import("./relationship-levels.server").RelationshipInput); });
    const { error:saveError }=await db.from("bulk_operations").update({reconciliation:JSON.parse(JSON.stringify({at:new Date().toISOString(),outcomes,inspectionOnly:true,lockReleased:false})) as Json}).eq("id",op.id);
    if(saveError) throw new Error("Saved state was read but inspection evidence could not be recorded; the safety lock remains.");
    return { operationId:op.id,outcomes,active: Boolean(op.execution_token),status:op.status,inspectionOnly:true as const };
  });

/**
 * Self-service recovery for interrupted imports. Preview (apply=false) reads
 * fresh Contacts and explains per person what was saved; apply=true records
 * that evidence, closes the operation and releases only its own lock. It never
 * writes people records and never replays the import.
 */
export const reconcileImportOperation = createServerFn({ method: "POST" }).middleware([requireTeamAuth])
  .inputValidator(input => z.object({ id:z.string().uuid(), apply:z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { journalClient } = await import("./bulk-journal.server");
    const db = await journalClient();
    const { data:op,error } = await db.from("bulk_operations").select("*").eq("id",data.id).single();
    if(error || !op) throw new Error("Operation not found.");
    if(!canSelfRecover(op.kind)) throw new Error("Self-service recovery is unavailable for this activity.");
    if(op.status !== "uncertain") throw new Error("This operation is not waiting for reconciliation.");
    const quietMs = Date.now() - new Date(op.updated_at).getTime();
    if(quietMs < 120_000) throw new Error("This import stopped less than 2 minutes ago. Wait a moment so any in-flight save can finish, then check again.");
    const input = op.input as Record<string, unknown>;
    const { withDeadline } = await import("./request-deadline.server");
    const { operationStatus } = await import("@/lib/bulk-operation");
    let outcomes: BulkOutcome[];
    if (op.kind === "contact-merge" || op.kind === "contact-merge-undo") {
      const { mergeSavedState } = await import("./contact-merge.server");
      outcomes = await withDeadline("read merged contacts",40_000,step => { step("reading Contacts without writes"); return mergeSavedState(op.kind, input); });
    } else if (op.kind === "relationship-change") {
      const { inspectRelationshipState } = await import("./relationship-reconciliation.server");
      outcomes = await withDeadline("inspect relationship saved state",40_000,step => { step("reading Network and Prospecting without writes"); return inspectRelationshipState(input as unknown as import("./relationship-levels.server").RelationshipInput); });
    } else if (!RECONCILABLE.includes(op.kind)) {
      const prior = (op.outcomes || []) as unknown as BulkOutcome[];
      outcomes = prior.length ? prior.map(o => ["changed","moved","already_complete","duplicate"].includes(o.status) ? o : { ...o, status:"review", reason:`Stopped mid-save; check this record before re-running. ${o.reason || ""}`.trim() })
        : [{ key:"batch", label:op.summary || op.kind, status:"review", reason:"Stopped before any progress was recorded. Check the affected records, then re-run it from its page." }];
    } else {
      const rows = (op.kind === "target-import" ? input.targets : input.contacts) as Record<string,string>[] || [];
      const items = rows.map((r,i) => { const name = r.name || `${r.firstName || ""} ${r.lastName || ""}`.trim(); return { key:String(i), label:name || r.email, email:r.email, name, company:r.company }; });
      const { fetchSheetTab, TAB_NAMES } = await import("./sheets.server");
      const sheet = await withDeadline("read saved contacts",40_000,step => { step("reading Contacts without writes"); return fetchSheetTab(TAB_NAMES.contacts,true); });
      const h = (sheet[0] || []).map(x => x.trim().toLowerCase()), g = (r:string[],...k:string[]) => k.map(x=>r[h.indexOf(x)]||"").find(Boolean)||"";
      const saved = sheet.slice(1).map(r => ({ urid:g(r,"urid"), email:g(r,"email"), name:g(r,"name","full name") || `${g(r,"first name")} ${g(r,"last name")}`.trim(), company:g(r,"company","organization"), status:g(r,"relationship status") }));
      const { planImportReconciliation } = await import("@/lib/import-reconciliation");
      outcomes = planImportReconciliation(items,(op.outcomes || []) as unknown as BulkOutcome[],saved);
    }
    if(!data.apply) return { applied:false, outcomes };
    const status = operationStatus(outcomes);
    const saves = outcomes.filter(o=>o.status==="changed").length, missing = outcomes.filter(o=>o.status==="failed").length;
    const summary = `${op.kind}: reconciled — ${saves} saved once · ${missing} not saved · ${outcomes.length-saves-missing} review`;
    const attempts = [...((op.attempts || []) as unknown as BulkOperation["attempts"]), { at:new Date().toISOString(), status:`reconciled by ${context.teamEmail}`, outcomes }];
    const { data:updated,error:upErr } = await db.from("bulk_operations").update({ status, summary, outcomes:JSON.parse(JSON.stringify(outcomes)) as Json, attempts:JSON.parse(JSON.stringify(attempts)) as Json, execution_token:null, reconciliation:JSON.parse(JSON.stringify({ at:new Date().toISOString(), by:context.teamEmail, outcomes, lockReleased:true })) as Json, updated_at:new Date().toISOString() }).eq("id",op.id).eq("status","uncertain").eq("updated_at",op.updated_at).select("id");
    if(upErr || !updated?.length) throw new Error("The operation changed while checking; nothing was released. Refresh and check again.");
    const { error:lockErr } = await db.from("bulk_operation_locks").delete().eq("resource","shared-bulk-writes").eq("operation_id",op.id);
    if(lockErr) throw new Error("Results were recorded but the safety lock could not be released. Refresh and check again.");
    return { applied:true, outcomes };
  });

export const fetchBulkOperations = createServerFn({ method: "GET" }).middleware([requireTeamAuth]).handler(async () => {
  const { readOperations } = await import("./bulk-journal.server");
  return readOperations();
});

export const retryBulkOperation = createServerFn({ method: "POST" }).middleware([requireTeamAuth])
  .inputValidator(input => z.object({ id: z.string().uuid(), confirmed: z.literal(true) }).parse(input))
  .handler(async ({ data, context }) => {
    const { journalClient, runJournalOperation } = await import("./bulk-journal.server");
    const db = await journalClient();
    const { data: op, error } = await db.from("bulk_operations").select("*").eq("id",data.id).single();
    if (error || op.user_id !== context.userId) throw new Error("Only the teammate who started this operation can retry it.");
    if (op.status === "running" || op.status === "uncertain") throw new Error("This operation needs reconciliation; it cannot be safely replayed.");
    if (op.kind !== "relationship-change") throw new Error("This activity does not have a safe retry handler. Review or create a fix request instead.");
    const { changeRelationshipLevels } = await import("./relationship-levels.server");
    const input = op.input as unknown as import("./relationship-levels.server").RelationshipInput;
    return runJournalOperation({ id: op.id, kind: op.kind, page: op.page, input, actor: context, run: async journal => {
      journal.step("revalidating original destinations");
      const value = await changeRelationshipLevels(input, journal.prior, journal.checkpoint,{maxItems:5,maxMs:25_000});
      return { value, outcomes: value.outcomes };
    } });
  });

export const createActivityFixRequest = createServerFn({ method: "POST" }).middleware([requireTeamAuth])
  .inputValidator(input => z.object({ activityKey: z.string().min(1).max(250), operationId: z.string().uuid().optional(), title: z.string().min(1).max(200), description: z.string().max(12000), prompt: z.string().max(20000), page: z.string().max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    const { journalClient } = await import("./bulk-journal.server");
    const db = await journalClient();
    if(data.operationId) {
      const { data: operation,error }=await db.from("bulk_operations").select("id,page").eq("id",data.operationId).single();
      if(error||!operation||data.activityKey!==`operation:${operation.id}`) throw new Error("The linked activity could not be verified.");
      data.page=operation.page;
    }
    const { data: existing, error: readError } = await db.from("admin_requests").select("id").eq("activity_key",data.activityKey).maybeSingle();
    if (readError) throw new Error("Could not check the existing request.");
    if (existing) return { id: existing.id, existing: true };
    const { data: saved, error } = await db.from("admin_requests").insert({ kind: "fix", title: data.title, description: data.description, lovable_prompt: data.prompt, page: data.page, activity_key: data.activityKey, operation_id: data.operationId, requested_by: context.teamEmail, user_id: context.userId }).select("id").maybeSingle();
    if (error?.code === "23505") {
      const { data: linked } = await db.from("admin_requests").select("id").eq("activity_key",data.activityKey).single();
      return { id:linked?.id || "",existing:true };
    }
    if (error) throw new Error("Could not save the linked fix request.");
    return { id: saved?.id || "", existing: false };
  });
/** Read-only: who holds the shared write slot, so the progress window can offer unlock/retry in place. */
export const fetchBulkLockStatus = createServerFn({ method: "GET" }).middleware([requireTeamAuth]).handler(async () => {
  const { journalClient } = await import("./bulk-journal.server");
  const db = await journalClient();
  const { data:lock } = await db.from("bulk_operation_locks").select("operation_id,acquired_at").eq("resource","shared-bulk-writes").maybeSingle();
  if (!lock) return { locked:false as const };
  const { data:op } = await db.from("bulk_operations").select("id,kind,status,summary,actor,updated_at").eq("id",lock.operation_id).maybeSingle();
  const quietMs = op ? Date.now() - new Date(op.updated_at).getTime() : 0;
  return { locked:true as const, operationId:lock.operation_id, kind:op?.kind || "unknown", status:op?.status || "unknown", summary:op?.summary || "", actor:op?.actor || "", since:op?.updated_at || lock.acquired_at,
    canReconcile: !!op && op.status === "uncertain" && canSelfRecover(op.kind), waitMs: Math.max(0, 120_000 - quietMs) };
});

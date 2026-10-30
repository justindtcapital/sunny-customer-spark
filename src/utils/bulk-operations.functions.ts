import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireTeamAuth } from "./team-auth";
import { activityEvidence, type BulkOperation, type BulkOutcome } from "@/lib/bulk-operation";

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
    return { operationId:op.id,outcomes,active: Boolean(op.execution_token),status:op.status,inspectionOnly:true as const };
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
      const value = await changeRelationshipLevels(input, journal.prior, journal.checkpoint);
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
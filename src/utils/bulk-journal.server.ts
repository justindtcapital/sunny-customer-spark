import { createServerOnlyFn } from "@tanstack/react-start";
import type { Json } from "@/integrations/supabase/types";
import { canonicalValue, operationStatus, type BulkOperation, type BulkOutcome } from "@/lib/bulk-operation";

export interface JournalActor { userId: string; teamEmail: string }
export interface JournalRun {
  id: string; prior: BulkOutcome[];
  checkpoint: (outcomes: BulkOutcome[]) => Promise<void>;
  step: (name: string) => void;
}
const json = (v: unknown): Json => JSON.parse(JSON.stringify(v)) as Json;
export const journalClient = createServerOnlyFn(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
});
export const readOperations = createServerOnlyFn(async (): Promise<BulkOperation[]> => {
  const db = await journalClient();
  const { data, error } = await db.from("bulk_operations").select("id,actor,kind,page,status,summary,outcomes,attempts,created_at,updated_at").order("created_at", { ascending: false }).limit(300);
  if (error) throw new Error("Activity history is unavailable. Please refresh later.");
  return (data || []) as unknown as BulkOperation[];
});

export const runJournalOperation = createServerOnlyFn(async <T>(options: {
  id?: string; kind: string; page: string; input: unknown; actor: JournalActor;
  run: (journal: JournalRun) => Promise<{ value: T; outcomes: BulkOutcome[] }>;
}): Promise<{ value: T; operationId: string; outcomes: BulkOutcome[] }> => {
  const db = await journalClient(), id = options.id || crypto.randomUUID();
  let { data: existing, error: readError } = await db.from("bulk_operations").select("*").eq("id", id).maybeSingle();
  if (readError) throw new Error("Cannot start: activity journal is unavailable.");
  if (existing && (existing.user_id !== options.actor.userId || existing.kind !== options.kind || canonicalValue(existing.input) !== canonicalValue(options.input))) throw new Error("This operation does not match the original request.");
  if (existing?.status === "running" || existing?.status === "uncertain") throw new Error("This operation is still running or needs saved-state reconciliation. No writes were retried.");
  if (!existing) {
    const { error } = await db.from("bulk_operations").insert({ id, user_id: options.actor.userId, actor: options.actor.teamEmail, kind: options.kind, page: options.page, input: json(options.input) });
    if (error) throw new Error("Cannot start: activity journal could not be saved. No records were changed.");
  }
  const { data: claimed, error: claimError } = await db.rpc("claim_bulk_operation_lock", { p_resource: "shared-bulk-writes", p_operation_id: id });
  if (claimError || !claimed) {
    if (!existing) await db.from("bulk_operations").update({ status: "failed", summary: "Another bulk operation is running or awaiting reconciliation; no writes started." }).eq("id", id);
    throw new Error("Another bulk operation is running or awaiting reconciliation. No records were changed; refresh Admin for details.");
  }
  const previous = (existing?.outcomes || []) as unknown as BulkOutcome[];
  let outcomes = previous;
  let release = true;
  try {
    const { error } = await db.from("bulk_operations").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error("Cannot start: activity journal could not be updated.");
    const { withDeadline } = await import("./request-deadline.server");
    const result = await withDeadline(options.kind, 55_000, step => options.run({ id, prior: previous, step, checkpoint: async current => {
      outcomes = current;
      const { error } = await db.from("bulk_operations").update({ outcomes: json(current), updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error("Result checkpoint failed; saved-state reconciliation required.");
    } }));
    outcomes = result.outcomes;
    const status = operationStatus(outcomes), summary = `${options.kind}: ${outcomes.filter(o => ["changed","moved","already_complete","duplicate"].includes(o.status)).length} complete · ${outcomes.filter(o => !["changed","moved","already_complete","duplicate"].includes(o.status)).length} unresolved`;
    const attempts = [...((existing?.attempts || []) as unknown as BulkOperation["attempts"]), { at: new Date().toISOString(), status, outcomes }];
    const { error: finishError } = await db.from("bulk_operations").update({ status, summary, outcomes: json(outcomes), attempts: json(attempts), updated_at: new Date().toISOString() }).eq("id", id);
    release = status !== "uncertain";
    if (finishError) throw new Error("Result finalization failed; saved-state reconciliation required.");
    return { ...result, operationId: id };
  } catch (e) {
    // A request can time out while provider I/O is still active. Never expire its lock automatically.
    release = false;
    const attempts = [...((existing?.attempts || []) as unknown as BulkOperation["attempts"]), { at: new Date().toISOString(), status: "uncertain", outcomes }];
    const { error: failedJournal } = await db.from("bulk_operations").update({ status: "uncertain", summary: "Interrupted operation. Saved-state reconciliation required before further bulk writes.", outcomes: json(outcomes), attempts: json(attempts), updated_at: new Date().toISOString() }).eq("id", id);
    if(failedJournal) console.error("[bulk-journal] could not record interruption",id);
    console.error("[bulk-journal] operation interrupted", id, e instanceof Error ? e.message : "error");
    throw new Error(`The operation was interrupted. Open Admin to review operation ${id}; do not repeat the whole batch.`);
  } finally {
    if (release) {
      const { error } = await db.from("bulk_operation_locks").delete().eq("resource", "shared-bulk-writes").eq("operation_id", id);
      if(error) console.error("[bulk-journal] lock release requires reconciliation",id);
    }
  }
});

/** Non-replayable audit envelope for existing bulk tools; original return shape stays intact. */
export const auditBulk = createServerOnlyFn(async <T>(kind: string, input: unknown, actor: JournalActor, fn: () => Promise<T>): Promise<T> => {
  const r = await runJournalOperation({ kind, page: kind.includes("event") ? "/events" : "/crm", input, actor, run: async ({ step }) => {
    step("saving and recording bulk results");
    const value = await fn();
    const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const failed = Number(record.failed || 0);
    const outcomes: BulkOutcome[] = [{ key: "batch", label: kind, status: failed ? "review" : "changed", reason: Object.entries(record).filter(([,v]) => typeof v !== "object").map(([k,v]) => `${k}: ${String(v)}`).join(" · ") || "Completed" }];
    return { value, outcomes };
  } });
  return r.value;
});
import { createServerOnlyFn } from "@tanstack/react-start";
import { createRequestState } from "./request-state.server";

interface Execution { signal: AbortSignal; assertOwner: () => Promise<void>; }
const state = createRequestState(() => ({ execution: null as Execution | null, writes: 0, reads: 0 }));
export const setBulkExecution = createServerOnlyFn((execution: Execution | null) => { state().execution = execution; });
export const bulkExecutionSignal = createServerOnlyFn(() => state().execution?.signal);
export const assertBulkWrite = createServerOnlyFn(async () => {
  const execution = state().execution;
  if (execution) { execution.signal.throwIfAborted(); await execution.assertOwner(); execution.signal.throwIfAborted(); }
  else {
    const { journalClient } = await import("./bulk-journal.server");
    const db = await journalClient();
    const { data, error } = await db.from("bulk_operation_locks").select("operation_id").eq("resource","shared-bulk-writes").maybeSingle();
    if (error || data) throw new Error("Contact writes are paused while a bulk operation is active or awaiting reconciliation. Review Admin before retrying.");
  }
});
export const recordBulkRequest = createServerOnlyFn((read: boolean) => { if (read) state().reads++; else state().writes++; });
export const bulkRequestCounts = createServerOnlyFn(() => ({ reads:state().reads,writes:state().writes }));
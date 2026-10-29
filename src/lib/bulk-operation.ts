export type OutcomeStatus = "changed" | "moved" | "already_complete" | "duplicate" | "review" | "blocked" | "failed" | "uncertain";
export interface BulkOutcome {
  key: string;
  label: string;
  status: OutcomeStatus;
  reason: string;
  retryable?: boolean;
  from?: string;
  to?: string;
}
export interface BulkOperation {
  id: string; actor: string; kind: string; page: string; status: string; summary: string;
  outcomes: BulkOutcome[];
  attempts: { at: string; status: string; outcomes: BulkOutcome[] }[];
  created_at: string; updated_at: string;
}
export const completeOutcome = (o: BulkOutcome) => ["changed", "moved", "already_complete", "duplicate"].includes(o.status);
export function outcomeTotals(outcomes: BulkOutcome[]) {
  return {
    updated: outcomes.filter(o => o.status === "changed").length,
    moved: outcomes.filter(o => o.status === "moved").length,
    alreadyComplete: outcomes.filter(o => o.status === "already_complete").length,
    duplicates: outcomes.filter(o => o.status === "duplicate").length,
    skipped: outcomes.filter(o => ["review", "blocked", "failed", "uncertain"].includes(o.status)).length,
  };
}
export function operationStatus(outcomes: BulkOutcome[]): string {
  if (outcomes.some(o => o.status === "uncertain")) return "uncertain";
  const incomplete = outcomes.some(o => !completeOutcome(o));
  return incomplete ? (outcomes.some(completeOutcome) ? "partial" : "failed") : "succeeded";
}
/** Deterministic comparison ignores object key order, generated fields and array order. */
export function canonicalValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(canonicalValue).sort());
  if (value && typeof value === "object") return JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => [k, canonicalValue(v)]));
  return JSON.stringify(typeof value === "string" ? value.trim() : value) ?? "null";
}
export function snapshotEqual(a: string, b: string): boolean {
  try { return canonicalValue(JSON.parse(a)) === canonicalValue(JSON.parse(b)); } catch { return false; }
}
export function activityEvidence(operation: BulkOperation): string {
  return `${operation.kind} · ${operation.status}\nOperation: ${operation.id}\nPage: ${operation.page}\nWhen: ${operation.created_at}\n${operation.summary}\n` +
    operation.outcomes.slice(0, 80).map((o,i) => `Item ${i+1}: ${o.status} — ${o.reason}`).join("\n") +
    `\nAttempts: ${operation.attempts.length}\n` + operation.attempts.map(a => `${a.at} · ${a.status}`).join("\n");
}
import { completeOutcome, type BulkOutcome } from "./bulk-operation";
import { emailIdentities } from "./import-dedupe";

export interface ReconcileItem { key: string; label: string; email?: string; name?: string; company?: string }
export interface SavedRow { urid: string; email: string; name: string; company: string; status: string }

const n = (s?: string) => (s || "").trim().toLowerCase();

/**
 * Pure plan: for every requested item without a recorded final outcome, count
 * saved rows by email (or exact name+company). Exactly one = saved once; none =
 * not saved (safe to import again); more than one = duplicate needing review.
 * Never proposes writes to people records.
 */
export function planImportReconciliation(items: ReconcileItem[], recorded: BulkOutcome[], saved: SavedRow[]): BulkOutcome[] {
  return items.map(item => {
    const prior = recorded.find(o => o.key === item.key);
    if (prior && prior.status !== "uncertain" && prior.status !== "pending" && (completeOutcome(prior) || ["review", "blocked", "duplicate"].includes(prior.status))) return prior;
    const emails = emailIdentities(item.email);
    const hits = saved.filter(r => emails.length
      ? emailIdentities(r.email).some(e => emails.includes(e))
      : n(r.name) === n(item.name) && n(r.company) === n(item.company) && !!n(item.name));
    if (hits.length === 1) return { key: item.key, label: item.label, status: "changed", reason: `Saved once (${hits[0].status || "record"} ${hits[0].urid || "row"}). Verified on reconciliation.` };
    if (!hits.length) return { key: item.key, label: item.label, status: "failed", retryable: true, reason: "Not saved. Safe to import this person again — nothing will be duplicated." };
    return { key: item.key, label: item.label, status: "review", reason: `${hits.length} saved records share this identity; review in Network/Prospecting. Nothing was changed.` };
  });
}

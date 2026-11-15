/**
 * Pure planning for the one-time Asana → Venture Pulse PortCo/workstream import.
 * Venture Pulse values win; Asana only fills gaps. Dropped fields are archived, not lost.
 */
import { teamMemberFor } from "./user-ownership";

export const LEAD_INVESTORS = ["Scott", "Deepak", "Gregg", "Raman", "Daniel", "Omri", "Yair", "Radhika", "Chris", "Barrel", "Elana"] as const;

export const PROFILE_FIELDS = [
  "DTC Priority", "DTC Investment ($M)", "DTC Ownership", "Lead Investor", "Company Stage",
  "GTM Marketing/PMF", "Sales Maturity", "Help / Influence", "SageTap Status",
  "Sell With Dell - Maturity", "Dell Channel Aligned", "Last Pitch Reviewed", "Sales Momentum",
  "DTC - Sales Assist Activity",
] as const;

export const WORKSTREAM_FIELDS = [
  "Workstream Status", "Workstream Priority", "Sell-In Status", "GTM Strategy Category",
  "Dell Stakeholders", "Sell With Dell - Maturity", "DTC - Dell Leverage Opportunity",
  "DTC Dell Leverage Priority", "SageTap Status", "Available Credits", "Dell Services Aligned",
  "Dell Products Aligned", "Dell Targets",
] as const;

/** Never carried over, not even into the archive (user decision). */
export const DISCARDED_FIELDS = ["Next Steps"] as const;

export const WORKSTREAM_STATUSES = ["Complete", "Stalled", "Working to Complete", "Early Conversations", "No Success"] as const;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const key = (s: string) => clean(s).toLowerCase();

/** Canonical field name for an Asana label ("Lead Investor " → "Lead Investor"). */
export function canonicalField(name: string, allowed: readonly string[]): string | null {
  const k = key(name);
  return allowed.find((a) => key(a) === k) ?? null;
}

export function normalizeInvestor(raw: string): { value: string; known: boolean } {
  const v = clean(raw);
  if (!v) return { value: "", known: true };
  const hit = LEAD_INVESTORS.find((i) => i.toLowerCase() === v.toLowerCase());
  return hit ? { value: hit, known: true } : { value: v, known: false };
}

export function normalizeOwner(raw: string): { value: string; onTeam: boolean } {
  if (!clean(raw)) return { value: "", onTeam: true };
  const m = teamMemberFor(raw);
  return m ? { value: m.displayName, onTeam: true } : { value: clean(raw), onTeam: false };
}

/** Drops the retired "Dell Leverage - Sell Through" option; reports whether it was present. */
export function normalizeStatuses(raw: string): { value: string; dropped: string[] } {
  const parts = raw.split(",").map(clean).filter(Boolean);
  const keep: string[] = [], dropped: string[] = [];
  for (const p of parts) {
    const hit = WORKSTREAM_STATUSES.find((s) => s.toLowerCase() === p.toLowerCase());
    if (hit) keep.push(hit); else dropped.push(p);
  }
  return { value: keep.join(", "), dropped };
}

export interface SplitFields { kept: Record<string, string>; archived: Record<string, string> }

/** Split raw Asana fields into kept (canonical names) and archived; discarded fields vanish. */
export function splitFields(raw: Record<string, string>, allowed: readonly string[]): SplitFields {
  const kept: Record<string, string> = {}, archived: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!clean(value)) continue;
    if (DISCARDED_FIELDS.some((d) => key(d) === key(name))) continue;
    const c = canonicalField(name, allowed);
    if (c) kept[c] = clean(value); else archived[clean(name)] = clean(value);
  }
  return { kept, archived };
}

/** Venture Pulse wins wherever it has a value; Asana fills gaps. Returns conflicts for the preview. */
export function mergeVpWins(vp: Record<string, string>, asana: Record<string, string>) {
  const merged: Record<string, string> = { ...asana };
  const conflicts: { field: string; vp: string; asana: string }[] = [];
  for (const [f, v] of Object.entries(vp)) {
    if (!clean(v)) continue;
    if (asana[f] && clean(asana[f]) !== clean(v)) conflicts.push({ field: f, vp: clean(v), asana: clean(asana[f]) });
    merged[f] = clean(v);
  }
  return { merged, conflicts };
}

export interface DellPerson { urid: string; name: string }
export type DellMatch = { name: string; status: "linked"; urid: string } | { name: string; status: "new" } | { name: string; status: "ambiguous"; candidates: string[] };

/** Unique full-name match against Dell contacts only; otherwise new or review. */
export function matchDellTargets(raw: string, dell: DellPerson[]): DellMatch[] {
  return raw.split(/[,;\n]/).map(clean).filter(Boolean).map((name) => {
    const hits = dell.filter((p) => key(p.name) === key(name));
    if (hits.length === 1) return { name, status: "linked", urid: hits[0]!.urid };
    if (hits.length > 1) return { name, status: "ambiguous", candidates: hits.map((h) => h.urid) };
    return { name, status: "new" };
  });
}

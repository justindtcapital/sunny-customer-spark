/**
 * "Sell With Dell Status" (renamed from "Sell With Dell - Maturity"; the Workstreams and PortCo
 * Profiles sheet columns and values were rewritten once on 2026-11-23). Multi-choice, stored on
 * each workstream AND on the company profile, kept in sync: the company always holds every status
 * its workstreams hold, and may also hold company-wide statuses no workstream carries.
 * Browser-safe and pure: options, a read-time guard for old names/values, and the sync rules.
 */

export const SWD_STATUS_FIELD = "Sell With Dell Status";
export const LEGACY_SWD_FIELD = "Sell With Dell - Maturity";

/** Progress choices (same wording as Sell-In Status), then established "Existing - …" outcomes. */
export const SWD_STATUS_OPTIONS = [
  "1 - Engaged /Progressing",
  "2 - Engaged / Stalled",
  "3 - Trying to Engage",
  "Interested / Not Engaged",
  "Not Moving Forward",
  "Existing - Embedded in Dell Offering",
  "Existing - On Dell Paper / Revenue Generating",
  "Existing - Reference Architecture / Joint Solution",
  "Existing - Services Enabled / Dell Delivered",
] as const;

/** Old maturity choice → new status (lower-cased keys). */
const LEGACY_TO_STATUS: Record<string, string> = {
  "preliminary discussions": "3 - Trying to Engage",
  "formally engaged": "1 - Engaged /Progressing",
  "reference architecture / joint solution": "Existing - Reference Architecture / Joint Solution",
  "on dell paper / revenue generating": "Existing - On Dell Paper / Revenue Generating",
  "services enabled / dell delivered": "Existing - Services Enabled / Dell Delivered",
  "embedded in dell offering": "Existing - Embedded in Dell Offering",
  "none: field collaboration only": "Interested / Not Engaged",
};

const clean = (s: string) => (s || "").replace(/\s+/g, " ").trim();

/** Any stored value (one choice or a comma list) → new statuses; current or unknown values pass through. */
export function sellWithDellStatusFrom(raw: string): string {
  const parts = clean(raw).split(/\s*,\s*/).filter(Boolean).map((v) => LEGACY_TO_STATUS[v.toLowerCase()] ?? v);
  return [...new Set(parts)].join(", ");
}

/**
 * Guard for a parsed Workstreams tab: if the old column name or old values ever reappear (an
 * old backup pasted back, a stale cache), readers still see "Sell With Dell Status" with new values.
 */
export function normalizeSellWithDell<T extends { row: number; cells: Record<string, string> }>(
  headers: string[],
  items: T[],
): { headers: string[]; items: Array<T & { cells: Record<string, string> }> } {
  const legacyColumn = headers.indexOf(LEGACY_SWD_FIELD);
  const renamed = legacyColumn >= 0 && !headers.includes(SWD_STATUS_FIELD);
  const nextHeaders = renamed ? headers.map((h, i) => (i === legacyColumn ? SWD_STATUS_FIELD : h)) : headers;
  const nextItems = items.map((x): T & { cells: Record<string, string> } => {
    const cells = { ...x.cells };
    if (renamed) { cells[SWD_STATUS_FIELD] = cells[LEGACY_SWD_FIELD] ?? ""; delete cells[LEGACY_SWD_FIELD]; }
    if (cells[SWD_STATUS_FIELD]) cells[SWD_STATUS_FIELD] = sellWithDellStatusFrom(cells[SWD_STATUS_FIELD]);
    return { ...x, cells };
  });
  return { headers: nextHeaders, items: nextItems };
}

// ─── Company ↔ workstream sync ──────────────────────────────────────

const ORDER = new Map<string, number>(SWD_STATUS_OPTIONS.map((o, i) => [o.toLowerCase(), i]));
const listOf = (raw: string): string[] => {
  const v = sellWithDellStatusFrom(raw);
  return v ? v.split(/\s*,\s*/).map((x) => SWD_STATUS_OPTIONS.find((o) => o.toLowerCase() === x.toLowerCase()) ?? x) : [];
};
const ordered = (values: Iterable<string>): string => {
  const uniq = new Map<string, string>();
  for (const v of values) if (!uniq.has(v.toLowerCase())) uniq.set(v.toLowerCase(), v);
  return [...uniq.values()].sort((a, b) => (ORDER.get(a.toLowerCase()) ?? 99) - (ORDER.get(b.toLowerCase()) ?? 99)).join(", ");
};

/** Every status in any of the values, once, in option order (old names mapped). */
export function mergeStatuses(...values: string[]): string {
  return ordered(values.flatMap(listOf));
}

/** Statuses in `value` minus the `removed` ones. */
export function removeStatuses(value: string, removed: string[]): string {
  const drop = new Set(removed.map((r) => r.toLowerCase()));
  return ordered(listOf(value).filter((v) => !drop.has(v.toLowerCase())));
}

/** Statuses present in `before` but not in `after`. */
export function removedStatuses(before: string, after: string): string[] {
  const keep = new Set(listOf(after).map((v) => v.toLowerCase()));
  return listOf(before).filter((v) => !keep.has(v.toLowerCase()));
}

/**
 * The company's stored value after one of its workstreams changed from `before` to `after`.
 * Added statuses are added to the company; a removed status leaves the company only when no other
 * workstream of that company still carries it. Company-wide statuses stay untouched.
 */
export function companyStatusAfterWorkstreamEdit(input: { company: string; before: string; after: string; otherWorkstreams: string[] }): string {
  const stillCarried = mergeStatuses(input.after, ...input.otherWorkstreams);
  const dropped = removedStatuses(input.before, stillCarried);
  return mergeStatuses(removeStatuses(input.company, dropped), stillCarried);
}

/** What the company shows: its stored value plus anything its workstreams carry (repairs a missed sync). */
export function effectiveCompanyStatus(company: string, workstreams: string[]): string {
  return mergeStatuses(company, ...workstreams);
}

/**
 * A company-level edit from `before` (the effective value) to `after`: statuses removed on the
 * company are also removed from every workstream that carries them. Returns each workstream's new
 * value (index-aligned); unchanged workstreams return their value as-is.
 */
export function workstreamStatusesAfterCompanyEdit(before: string, after: string, workstreams: string[]): string[] {
  const dropped = removedStatuses(before, after);
  return workstreams.map((w) => (dropped.length && removedStatuses(w, removeStatuses(w, dropped)).length ? removeStatuses(w, dropped) : w));
}

/**
 * Apply one editor's change (from `original` to `value`, as lists or comma text) onto the current
 * value: statuses they added are added, ones they removed are removed, everything else is kept.
 * Unknown values pass through so the field's option check can refuse them.
 */
export function applyStatusEdit(current: string, original: string | string[], value: string | string[]): string {
  const text = (v: string | string[]) => (Array.isArray(v) ? v.join(", ") : v);
  const removed = removedStatuses(text(original), text(value));
  const added = listOf(text(value)).filter((v) => !listOf(text(original)).some((o) => o.toLowerCase() === v.toLowerCase()));
  return mergeStatuses(removeStatuses(current, removed), added.join(", "));
}

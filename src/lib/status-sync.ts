/**
 * Company ↔ workstream sync rules shared by the Dell status fields (Sell With Dell Status and
 * Sell-In Status). Pure and browser-safe. A company always holds every status its workstreams hold
 * and may also hold company-wide statuses no workstream carries. Values are comma lists in option order.
 */
export interface StatusSync {
  /** Every status in any of the values, once, in option order (old names mapped). */
  mergeStatuses(...values: string[]): string;
  /** Statuses in `value` minus the `removed` ones. */
  removeStatuses(value: string, removed: string[]): string;
  /** Statuses present in `before` but not in `after`. */
  removedStatuses(before: string, after: string): string[];
  /**
   * The company's stored value after one of its workstreams changed from `before` to `after`.
   * Added statuses are added to the company; a removed status leaves the company only when no other
   * workstream of that company still carries it. Company-wide statuses stay untouched.
   */
  companyStatusAfterWorkstreamEdit(input: { company: string; before: string; after: string; otherWorkstreams: string[] }): string;
  /** What the company shows: its stored value plus anything its workstreams carry (repairs a missed sync). */
  effectiveCompanyStatus(company: string, workstreams: string[]): string;
  /**
   * A company-level edit from `before` (the effective value) to `after`: statuses removed on the
   * company are also removed from every workstream that carries them. Returns each workstream's new
   * value (index-aligned); unchanged workstreams return their value as-is.
   */
  workstreamStatusesAfterCompanyEdit(before: string, after: string, workstreams: string[]): string[];
  /**
   * Apply one editor's change (from `original` to `value`, as lists or comma text) onto the current
   * value: statuses they added are added, ones they removed are removed, everything else is kept.
   * Unknown values pass through so the field's option check can refuse them.
   */
  applyStatusEdit(current: string, original: string | string[], value: string | string[]): string;
}

const clean = (s: string) => (s || "").replace(/\s+/g, " ").trim();

/** Build the sync rules for one status field. `normalize` maps old stored names to current ones. */
export function createStatusSync(options: readonly string[], normalize: (raw: string) => string = clean): StatusSync {
  const order = new Map<string, number>(options.map((o, i) => [o.toLowerCase(), i]));
  const listOf = (raw: string): string[] => {
    const v = clean(normalize(raw));
    return v ? v.split(/\s*,\s*/).filter(Boolean).map((x) => options.find((o) => o.toLowerCase() === x.toLowerCase()) ?? x) : [];
  };
  const ordered = (values: Iterable<string>): string => {
    const uniq = new Map<string, string>();
    for (const v of values) if (!uniq.has(v.toLowerCase())) uniq.set(v.toLowerCase(), v);
    return [...uniq.values()].sort((a, b) => (order.get(a.toLowerCase()) ?? 99) - (order.get(b.toLowerCase()) ?? 99)).join(", ");
  };
  const text = (v: string | string[]) => (Array.isArray(v) ? v.join(", ") : v);

  const mergeStatuses = (...values: string[]) => ordered(values.flatMap(listOf));
  const removeStatuses = (value: string, removed: string[]) => {
    const drop = new Set(removed.map((r) => r.toLowerCase()));
    return ordered(listOf(value).filter((v) => !drop.has(v.toLowerCase())));
  };
  const removedStatuses = (before: string, after: string) => {
    const keep = new Set(listOf(after).map((v) => v.toLowerCase()));
    return listOf(before).filter((v) => !keep.has(v.toLowerCase()));
  };

  return {
    mergeStatuses,
    removeStatuses,
    removedStatuses,
    companyStatusAfterWorkstreamEdit(input) {
      const stillCarried = mergeStatuses(input.after, ...input.otherWorkstreams);
      const dropped = removedStatuses(input.before, stillCarried);
      return mergeStatuses(removeStatuses(input.company, dropped), stillCarried);
    },
    effectiveCompanyStatus: (company, workstreams) => mergeStatuses(company, ...workstreams),
    workstreamStatusesAfterCompanyEdit(before, after, workstreams) {
      const dropped = removedStatuses(before, after);
      return workstreams.map((w) => (dropped.length && removedStatuses(w, removeStatuses(w, dropped)).length ? removeStatuses(w, dropped) : w));
    },
    applyStatusEdit(current, original, value) {
      const removed = removedStatuses(text(original), text(value));
      const added = listOf(text(value)).filter((v) => !listOf(text(original)).some((o) => o.toLowerCase() === v.toLowerCase()));
      return mergeStatuses(removeStatuses(current, removed), added.join(", "));
    },
  };
}

// ─── Shared stage wording (2026-11-24 rename) ────────────────────────

/**
 * Old pipeline wording → current wording, shared by Sell-In and Sell With Dell Status (lower-cased
 * keys). The sheets were rewritten once; this keeps old backups, change-log values and stale caches
 * reading as the current choices.
 */
export const LEGACY_PIPELINE_STATUS: Readonly<Record<string, string>> = {
  "1 - engaged /progressing": "Engaged / Progressing",
  "1 - engaged / progressing": "Engaged / Progressing",
  "2 - engaged / stalled": "Engaged / Stalled",
  "3 - trying to engage": "Working to Engage",
  "trying to engage": "Working to Engage",
  "interested / not engaged": "Interested",
};

/** Any stored value (one choice or a comma list) → current names via `renames`; en/em dashes read as "-"; unknown values pass through. */
export function renameStatuses(raw: string, renames: Readonly<Record<string, string>>): string {
  const parts = clean(raw).replace(/\s*[–—]\s*/g, " - ").split(/\s*,\s*/).filter(Boolean).map((v) => renames[v.toLowerCase()] ?? v);
  return [...new Set(parts)].join(", ");
}

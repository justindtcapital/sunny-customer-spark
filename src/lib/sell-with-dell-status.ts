/**
 * Workstream "Sell With Dell Status" (renamed from "Sell With Dell - Maturity").
 * Browser-safe and pure: the option list, the legacy-value mapping, and the one-time plan that
 * renames the Workstreams sheet column and rewrites legacy values in place.
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
  "Existing - DTC Partner",
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

/** Any stored value → the new status; values already on the new list (or unknown) pass through. */
export function sellWithDellStatusFrom(raw: string): string {
  const v = clean(raw);
  return LEGACY_TO_STATUS[v.toLowerCase()] ?? v;
}

export interface SwdCellRewrite { row: number; before: string; after: string }
export interface SwdMigration {
  /** 0-based column index of the old header, renamed in place. */
  column: number;
  cells: SwdCellRewrite[];
}

/**
 * Normalize a parsed Workstreams tab so every reader sees "Sell With Dell Status" with new values,
 * and return the one-time sheet rewrite still needed (null once the sheet is already migrated).
 */
export function normalizeSellWithDell<T extends { row: number; cells: Record<string, string> }>(
  headers: string[],
  items: T[],
): { headers: string[]; items: T[]; migration: SwdMigration | null } {
  const column = headers.indexOf(LEGACY_SWD_FIELD);
  if (column < 0 || headers.includes(SWD_STATUS_FIELD)) return { headers, items, migration: null };
  const nextHeaders = headers.map((h, i) => (i === column ? SWD_STATUS_FIELD : h));
  const cells: SwdCellRewrite[] = [];
  const nextItems = items.map((x) => {
    const { [LEGACY_SWD_FIELD]: legacy = "", ...rest } = x.cells;
    const after = sellWithDellStatusFrom(legacy);
    if (after !== legacy) cells.push({ row: x.row, before: legacy, after });
    return { ...x, cells: { ...rest, [SWD_STATUS_FIELD]: after } };
  });
  return { headers: nextHeaders, items: nextItems, migration: { column, cells } };
}

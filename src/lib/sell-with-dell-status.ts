/**
 * "Sell With Dell Status" (renamed from "Sell With Dell - Maturity"; the Workstreams and PortCo
 * Profiles sheet columns and values were rewritten once on 2026-11-23). Multi-choice, stored on
 * each workstream AND on the company profile, kept in sync: the company always holds every status
 * its workstreams hold, and may also hold company-wide statuses no workstream carries.
 * Browser-safe and pure: options, a read-time guard for old names/values, and the sync rules.
 */
import { createStatusSync } from "./status-sync";

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

// ─── Company ↔ workstream sync (shared rules in status-sync.ts) ─────

export const swdSync = createStatusSync(SWD_STATUS_OPTIONS, sellWithDellStatusFrom);
export const {
  mergeStatuses,
  removeStatuses,
  removedStatuses,
  companyStatusAfterWorkstreamEdit,
  effectiveCompanyStatus,
  workstreamStatusesAfterCompanyEdit,
  applyStatusEdit,
} = swdSync;

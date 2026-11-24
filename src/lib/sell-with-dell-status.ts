/**
 * "Sell With Dell Status" (renamed from "Sell With Dell - Maturity"; the Workstreams and PortCo
 * Profiles sheet columns and values were rewritten once on 2026-11-23). Multi-choice, stored on
 * each workstream AND on the company profile, kept in sync: the company always holds every status
 * its workstreams hold, and may also hold company-wide statuses no workstream carries.
 * Browser-safe and pure: options, a read-time guard for old names/values, and the sync rules.
 */
import { SELL_IN_FIELD, sellInStatusFrom } from "./sell-in-status";
import { LEGACY_PIPELINE_STATUS, createStatusSync, renameStatuses } from "./status-sync";

export const SWD_STATUS_FIELD = "Sell With Dell Status";
export const LEGACY_SWD_FIELD = "Sell With Dell - Maturity";

/** Stages (same wording as Sell-In Status), then established "Existing - …" outcomes. */
export const SWD_STATUS_OPTIONS = [
  "1 - Interested",
  "2 - Working to Engage",
  "3 - Engaged / Stalled",
  "4 - Engaged / Progressing",
  "5 - Existing - Reference Architecture / Joint Solution",
  "6 - Existing - On Dell Paper / Revenue Generating",
  "7 - Existing - Embedded in Dell Offering",
  "8 - Existing - Services Enabled / Dell Delivered",
] as const;

/** Old maturity choice or unnumbered status → numbered status (lower-cased keys). */
const LEGACY_TO_STATUS: Record<string, string> = {
  ...LEGACY_PIPELINE_STATUS,
  "preliminary discussions": "2 - Working to Engage",
  "formally engaged": "4 - Engaged / Progressing",
  "reference architecture / joint solution": "5 - Existing - Reference Architecture / Joint Solution",
  "existing - reference architecture / joint solution": "5 - Existing - Reference Architecture / Joint Solution",
  "on dell paper / revenue generating": "6 - Existing - On Dell Paper / Revenue Generating",
  "existing - on dell paper / revenue generating": "6 - Existing - On Dell Paper / Revenue Generating",
  "services enabled / dell delivered": "8 - Existing - Services Enabled / Dell Delivered",
  "existing - services enabled / dell delivered": "8 - Existing - Services Enabled / Dell Delivered",
  "embedded in dell offering": "7 - Existing - Embedded in Dell Offering",
  "existing - embedded in dell offering": "7 - Existing - Embedded in Dell Offering",
  "none: field collaboration only": "1 - Interested",
};

/** Any stored value (one choice or a comma list) → new statuses; current or unknown values pass through. */
export function sellWithDellStatusFrom(raw: string): string {
  return renameStatuses(raw, LEGACY_TO_STATUS);
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
    if (cells[SELL_IN_FIELD]) cells[SELL_IN_FIELD] = sellInStatusFrom(cells[SELL_IN_FIELD]);
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

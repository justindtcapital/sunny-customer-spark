/**
 * "Sell-In Status" — selling into Dell as a customer. One choice per workstream; the company
 * profile holds every status its workstreams hold (a company with several Dell workstreams can be
 * at several stages), kept in sync by the shared rules in status-sync.ts.
 * Stages first, then "Existing - …" account health once Dell is a current customer.
 */
import { LEGACY_PIPELINE_STATUS, createStatusSync, renameStatuses } from "./status-sync";

export const SELL_IN_FIELD = "Sell-In Status";

export const SELL_IN_OPTIONS = [
  "1 - Interested",
  "2 - Working to Engage",
  "3 - Engaged / Stalled",
  "4 - Engaged / Progressing",
  "5 - Existing - New",
  "6 - Existing - Static",
  "7 - Existing - Growing",
] as const;

/** Unnumbered "Existing - …" account health → numbered choices (lower-cased keys). */
const LEGACY_SELL_IN: Readonly<Record<string, string>> = {
  ...LEGACY_PIPELINE_STATUS,
  "existing - new": "5 - Existing - New",
  "existing - static": "6 - Existing - Static",
  "existing - growing": "7 - Existing - Growing",
};

/** Any stored Sell-In value → current names (old pipeline wording mapped; unknown values pass through). */
export const sellInStatusFrom = (raw: string): string => renameStatuses(raw, LEGACY_SELL_IN);

export const sellInSync = createStatusSync(SELL_IN_OPTIONS, sellInStatusFrom);

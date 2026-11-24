/**
 * "Sell-In Status" — selling into Dell as a customer. One choice per workstream; the company
 * profile holds every status its workstreams hold (a company with several Dell workstreams can be
 * at several stages), kept in sync by the shared rules in status-sync.ts.
 * Stages first, then "Existing - …" account health once Dell is a current customer.
 */
import { LEGACY_PIPELINE_STATUS, createStatusSync, renameStatuses } from "./status-sync";

export const SELL_IN_FIELD = "Sell-In Status";

export const SELL_IN_OPTIONS = [
  "Interested",
  "Working to Engage",
  "Engaged / Stalled",
  "Engaged / Progressing",
  "Existing - New",
  "Existing - Static",
  "Existing - Growing",
] as const;

/** Any stored Sell-In value → current names (old pipeline wording mapped; unknown values pass through). */
export const sellInStatusFrom = (raw: string): string => renameStatuses(raw, LEGACY_PIPELINE_STATUS);

export const sellInSync = createStatusSync(SELL_IN_OPTIONS, sellInStatusFrom);

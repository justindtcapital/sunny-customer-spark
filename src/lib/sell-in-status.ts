/**
 * "Sell-In Status" — selling into Dell as a customer. One choice per workstream; the company
 * profile holds every status its workstreams hold (a company with several Dell workstreams can be
 * at several stages), kept in sync by the shared rules in status-sync.ts.
 * Pipeline stages first, then "Existing - …" account health once Dell is a current customer.
 */
import { createStatusSync } from "./status-sync";

export const SELL_IN_FIELD = "Sell-In Status";

export const SELL_IN_OPTIONS = [
  "1 - Engaged /Progressing",
  "2 - Engaged / Stalled",
  "3 - Trying to Engage",
  "Interested / Not Engaged",
  "Not Moving Forward",
  "Existing - Growing",
  "Existing - Static",
  "Existing - Concerned",
] as const;

export const sellInSync = createStatusSync(SELL_IN_OPTIONS);

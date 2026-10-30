import type { BulkOutcome } from "./bulk-operation";

export const pendingCount = (outcomes: BulkOutcome[]) => outcomes.filter(o => o.status === "pending").length;

/**
 * Keeps resuming a saved bulk operation step by step until nothing is pending.
 * Stops when a step makes no progress twice in a row, when cancelled, or on error,
 * so a stuck item never causes an endless loop.
 */
export async function autoResume(opts: {
  outcomes: BulkOutcome[];
  step: () => Promise<{ outcomes: BulkOutcome[] }>;
  onProgress?: (outcomes: BulkOutcome[]) => void;
  shouldStop?: () => boolean;
  pauseMs?: number;
  maxSteps?: number;
}): Promise<{ outcomes: BulkOutcome[]; stalled: boolean }> {
  let outcomes = opts.outcomes, stalls = 0;
  for (let i = 0; i < (opts.maxSteps ?? 400) && pendingCount(outcomes) > 0; i++) {
    if (opts.shouldStop?.()) break;
    await new Promise(r => setTimeout(r, opts.pauseMs ?? 2000));
    const before = pendingCount(outcomes);
    outcomes = (await opts.step()).outcomes;
    opts.onProgress?.(outcomes);
    if (pendingCount(outcomes) >= before) { if (++stalls >= 2) return { outcomes, stalled: true }; } else stalls = 0;
  }
  return { outcomes, stalled: false };
}

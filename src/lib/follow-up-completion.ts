/**
 * Follow-up completion planning for My Actions (pure, browser-safe).
 *
 * Logging a note runs completeActionFn, which already resolves the follow-up's
 * activity row when given its id — so no second "close" write is sent then.
 */
export function completionPlan(x: { activityId?: string }, note: string, hasNextFollowUp: boolean) {
  const logAction = !!note.trim() || hasNextFollowUp;
  return { logAction, closeSeparately: !logAction || !x.activityId };
}

/** Drops matching follow-ups from a cached My Actions payload without refetching every tab. */
export function dropReminders<T extends { reminders?: R[] }, R extends { id: string; activityId?: string }>(
  data: T | undefined,
  match: (r: R) => boolean,
): T | undefined {
  if (!data?.reminders) return data;
  const reminders = data.reminders.filter((r) => !match(r));
  return reminders.length === data.reminders.length ? data : { ...data, reminders };
}

/** Puts a follow-up back into a cached My Actions payload (used by Undo). */
export function restoreReminder<T extends { reminders?: R[] }, R extends { id: string }>(data: T | undefined, x: R): T | undefined {
  if (!data?.reminders || data.reminders.some((r) => r.id === x.id)) return data;
  return { ...data, reminders: [...data.reminders, x] };
}

/** Undo reopens the row it closed; flagged contacts have nothing to reopen. */
export function canUndoCompletion(x: { activityId?: string; source?: string; email?: string; originalNote?: string; id: string }): boolean {
  return !!x.activityId || (x.source === "Network" && !!x.email && !!x.originalNote && !x.id.startsWith("flag:"));
}

/** Waits before each retry of a one-click completion (Google's per-minute limit clears in under a minute). */
export const COMPLETION_RETRY_DELAYS_MS = [2_000, 6_000, 15_000];

/**
 * Runs a save, retrying when it throws (rate limits, timeouts). A normal "false"
 * result — the row wasn't found — is returned at once, never retried.
 */
export async function withRetry<T>(run: () => Promise<T>, delays: number[] = COMPLETION_RETRY_DELAYS_MS, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await run(); }
    catch (e) {
      if (attempt >= delays.length) throw e;
      await wait(delays[attempt]!);
    }
  }
}

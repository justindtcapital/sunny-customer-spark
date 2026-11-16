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

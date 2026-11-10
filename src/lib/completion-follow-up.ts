export function completionFollowUp(enabled: boolean, date: string, note: string, today: string) {
  if (!enabled) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date || date <= today) {
    throw new Error("Choose a future follow-up date.");
  }
  return { date, note: note.trim().slice(0, 500) };
}
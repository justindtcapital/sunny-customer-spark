import { dateKey } from "./home-momentum";
export type ActionDateRange = { start: string; end: string } | null;
export function orderedDateRange(a: string, b: string): NonNullable<ActionDateRange> {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}
/** Calendar filter: the selected day(s) plus every earlier dated action, so nothing older drops out of view. */
export function inActionRange(due: string, range: ActionDateRange): boolean {
  if (!range) return true;
  const day = dateKey(due);
  return !!day && day <= range.end;
}
/** Short list date ("11/9"); `overdue` when it falls before today. */
export function actionDueLabel(due: string | undefined, today: string): { text: string; overdue: boolean } {
  const day = dateKey(due || "");
  if (!day) return { text: "—", overdue: false };
  return { text: `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`, overdue: !!today && day < today };
}
export function actionDayCounts(rows: { due: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) { const day = dateKey(row.due); if (day) counts.set(day, (counts.get(day) || 0) + 1); }
  return counts;
}
import { dateKey } from "./home-momentum";
export type ActionDateRange = { start: string; end: string } | null;
export function orderedDateRange(a: string, b: string): NonNullable<ActionDateRange> {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}
export function inActionRange(due: string, range: ActionDateRange): boolean {
  if (!range) return true;
  const day = dateKey(due);
  return !!day && day >= range.start && day <= range.end;
}
export function actionDayCounts(rows: { due: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) { const day = dateKey(row.due); if (day) counts.set(day, (counts.get(day) || 0) + 1); }
  return counts;
}
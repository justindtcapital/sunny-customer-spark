import { dateKey } from "@/lib/home-momentum";

/** "Do today": every open action due today plus incomplete ones from earlier days (oldest first). */
export function doToday<T extends { due: string }>(rows: T[], today: string): (T & { overdue: boolean })[] {
  return rows
    .map((r) => ({ r, key: dateKey(r.due) }))
    .filter(({ key }) => !!key && key <= today)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ r, key }) => ({ ...r, overdue: key < today }));
}

/** Upcoming events from today on, soonest first; declined events are not shown. */
export function upcomingEvents<T extends { start: string; end: string; dtcStatus?: string; status?: string }>(events: T[], today: string, limit = 8): T[] {
  return events
    .filter((e) => e.start && (e.end || e.start) >= today && !/declined/i.test(e.dtcStatus || e.status || ""))
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, limit);
}

/** Count of records added within the last `days` days, inclusive of today. */
export function addedWithin(rows: { dateAdded?: string }[], today: string, days = 30): number {
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const from = start.toISOString().slice(0, 10);
  return rows.filter((r) => { const k = dateKey(r.dateAdded); return !!k && k >= from && k <= today; }).length;
}

/** Open actions due on any day in [from, to] (inclusive), soonest first. */
export function dueInRange<T extends { due: string }>(rows: T[], from: string, to: string): T[] {
  return rows.map((r) => ({ r, key: dateKey(r.due) }))
    .filter(({ key }) => !!key && key >= from && key <= to)
    .sort((a, b) => a.key.localeCompare(b.key)).map(({ r }) => r);
}

/** Events that touch any day in [from, to] (inclusive); declined events are not shown. */
export function eventsInRange<T extends { start: string; end: string; dtcStatus?: string; status?: string }>(events: T[], from: string, to: string): T[] {
  return events
    .filter((e) => e.start && e.start <= to && (e.end || e.start) >= from && !/declined/i.test(e.dtcStatus || e.status || ""))
    .sort((a, b) => a.start.localeCompare(b.start));
}

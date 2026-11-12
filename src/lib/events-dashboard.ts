// Events dashboard: pure aggregation over Event Planner rows (no I/O).
import { PLANNER_CATEGORIES, canonicalSubcategory, type PlannerAttendee, type PlannerEvent } from "@/lib/event-planner";
import { canonicalOwnerName } from "@/lib/user-ownership";

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Event types in Events-page order (subcategories carry the tile colors). */
export const EVENT_TYPES = PLANNER_CATEGORIES.flatMap((c) => c.subcategories);

export function eventType(e: Pick<PlannerEvent, "subcategory">): string {
  const sub = canonicalSubcategory(e.subcategory || "").toLowerCase();
  return EVENT_TYPES.find((t) => t.name.toLowerCase() === sub)?.name ?? "Unassigned";
}

/** 0-11 month of the event's start in the given year, else null. */
export function eventMonth(e: Pick<PlannerEvent, "start">, year: number): number | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(e.start || "");
  if (!m || Number(m[1]) !== year) return null;
  return Number(m[2]) - 1;
}

export type MonthRow = { month: string; index: number; total: number } & Record<string, number | string>;

/** One row per month with a count per event type, for the stacked bar chart. */
export function monthlyByType(events: PlannerEvent[], year: number): MonthRow[] {
  const rows: MonthRow[] = MONTH_LABELS.map((month, index) => {
    const r: MonthRow = { month, index, total: 0 };
    for (const t of EVENT_TYPES) r[t.name] = 0;
    return r;
  });
  for (const e of events) {
    const m = eventMonth(e, year);
    if (m == null) continue;
    const t = eventType(e);
    rows[m][t] = (rows[m][t] as number) + 1;
    rows[m].total += 1;
  }
  return rows;
}

/** Events in the year, or in one month of it when month is set. */
export function eventsInScope(events: PlannerEvent[], year: number, month: number | null): PlannerEvent[] {
  return events.filter((e) => {
    const m = eventMonth(e, year);
    return m != null && (month == null || m === month);
  });
}

export interface Bar { label: string; value: number }

const sortBars = (map: Map<string, number>): Bar[] =>
  [...map].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

function tally(events: PlannerEvent[], keys: (e: PlannerEvent) => string[]): Bar[] {
  const map = new Map<string, number>();
  for (const e of events) for (const k of new Set(keys(e).map((v) => v.trim()).filter(Boolean))) map.set(k, (map.get(k) ?? 0) + 1);
  return sortBars(map);
}

/** City = first part of the location ("Austin, TX" → "Austin"); virtual events group together. */
export function eventCity(location: string): string {
  const first = (location || "").split(/[,·|\n]/)[0].trim();
  if (!first) return "";
  return /virtual|online|zoom|teams/i.test(first) ? "Virtual" : first;
}

export interface EventBreakdowns {
  attendeesPerEvent: Bar[];
  perPortco: Bar[];
  perDomain: Bar[];
  perCity: Bar[];
  perType: Bar[];
}

export function eventBreakdowns(scoped: PlannerEvent[], attendees: PlannerAttendee[]): EventBreakdowns {
  const byEvent = new Map<string, Set<string>>();
  for (const a of attendees) {
    const who = (a.email || a.name || "").trim().toLowerCase();
    if (!who) continue;
    if (!byEvent.has(a.eventUrid)) byEvent.set(a.eventUrid, new Set());
    byEvent.get(a.eventUrid)!.add(who);
  }
  const attendeesPerEvent = scoped
    .map((e) => ({ label: e.name, value: byEvent.get(e.urid)?.size ?? 0 }))
    .filter((b) => b.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  return {
    attendeesPerEvent,
    perPortco: tally(scoped, (e) => e.portcos),
    perDomain: tally(scoped, (e) => e.sectors),
    perCity: tally(scoped, (e) => [eventCity(e.location)]),
    perType: tally(scoped, (e) => [eventType(e)]),
  };
}

/** Years that have dated events, newest first (always includes the current year). */
export function eventYears(events: PlannerEvent[], current: number): number[] {
  const ys = new Set<number>([current]);
  for (const e of events) {
    const m = /^(\d{4})-/.exec(e.start || "");
    if (m) ys.add(Number(m[1]));
  }
  return [...ys].sort((a, b) => b - a);
}

/** Flat rows for charts built with V.I.C. (fields match CHART_DATASETS.events). */
export function eventChartRecords(events: PlannerEvent[], attendees: PlannerAttendee[]) {
  const byEvent = new Map<string, Set<string>>();
  for (const a of attendees) {
    const who = (a.email || a.name || "").trim().toLowerCase();
    if (!who) continue;
    if (!byEvent.has(a.eventUrid)) byEvent.set(a.eventUrid, new Set());
    byEvent.get(a.eventUrid)!.add(who);
  }
  return events.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.start || "")).map((e) => ({
    _date: e.start,
    month: e.start.slice(0, 7),
    year: e.start.slice(0, 4),
    type: eventType(e),
    category: e.category || "",
    city: eventCity(e.location),
    domain: e.sectors,
    portco: e.portcos,
    partner: e.partners,
    status: e.dtcStatus || e.status || "",
    owner: canonicalOwnerName(e.owner) || "",
    format: e.format || "",
    attendees: byEvent.get(e.urid)?.size ?? 0,
  }));
}

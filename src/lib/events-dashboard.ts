// Events dashboard: pure aggregation over Event Planner rows (no I/O).
import { PLANNER_CATEGORIES, canonicalSubcategory, plannerCategories, type PlannerAttendee, type PlannerEvent, type PlannerPartnerCategory, type PlannerSubcategory } from "@/lib/event-planner";
import { canonicalOwnerName } from "@/lib/user-ownership";

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Event types in Events-page order (subcategories carry the tile colors). */
export const EVENT_TYPES: PlannerSubcategory[] = PLANNER_CATEGORIES.flatMap((c) => c.subcategories);
/** Event types including partner categories added on the Events page (e.g. Vation Briefings). */
export function eventTypesFor(extras: PlannerPartnerCategory[] = []): PlannerSubcategory[] {
  return plannerCategories(extras).flatMap((c) => c.subcategories);
}

export function eventType(e: Pick<PlannerEvent, "subcategory">, types: PlannerSubcategory[] = EVENT_TYPES): string {
  const sub = canonicalSubcategory(e.subcategory || "").toLowerCase();
  return types.find((t) => t.name.toLowerCase() === sub)?.name ?? "Unassigned";
}

/** 0-11 month of the event's start in the given year, else null. */
export function eventMonth(e: Pick<PlannerEvent, "start">, year: number): number | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(e.start || "");
  if (!m || Number(m[1]) !== year) return null;
  return Number(m[2]) - 1;
}

export type MonthRow = { month: string; index: number; total: number } & Record<string, number | string>;

/** One row per month with a count per event type, for the stacked bar chart. */
export function monthlyByType(events: PlannerEvent[], year: number, types: PlannerSubcategory[] = EVENT_TYPES): MonthRow[] {
  const rows: MonthRow[] = MONTH_LABELS.map((month, index) => {
    const r: MonthRow = { month, index, total: 0 };
    for (const t of types) r[t.name] = 0;
    return r;
  });
  for (const e of events) {
    const m = eventMonth(e, year);
    if (m == null) continue;
    const t = eventType(e, types);
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

export function eventBreakdowns(scoped: PlannerEvent[], attendees: PlannerAttendee[], types: PlannerSubcategory[] = EVENT_TYPES): EventBreakdowns {
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
    perType: tally(scoped, (e) => [eventType(e, types)]),
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
export function eventChartRecords(events: PlannerEvent[], attendees: PlannerAttendee[], types: PlannerSubcategory[] = EVENT_TYPES) {
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
    type: eventType(e, types),
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

// ── Broad view: three categories × firm/pipeline status ─────────────
import { BRIEFINGS as _BRIEFINGS, DTC_LED as _DTC_LED, PARTNER_LED as _PARTNER_LED, dtcStatusOf as _dtcStatusOf } from "@/lib/event-planner";

/** The three dashboard categories (plus a grey bucket for anything uncategorised). */
export const BROAD_CATEGORIES = [
  { key: _DTC_LED, label: "DTC-led", color: "purple" },
  { key: _PARTNER_LED, label: "Partner-led", color: "rose" },
  { key: _BRIEFINGS, label: "Briefings", color: "blue" },
  { key: "Unassigned", label: "Uncategorised", color: "slate" },
] as const;

/** Dashboard status choices; Considering and Potential are pipeline (drawn faded). */
export const DASHBOARD_STATUSES = ["Completed", "Confirmed", "Considering", "Potential"] as const;
export const PIPELINE_STATUSES: readonly string[] = ["Considering", "Potential"];

export function broadCategory(e: Pick<PlannerEvent, "category">): string {
  return BROAD_CATEGORIES.find((c) => c.key === e.category)?.label ?? "Uncategorised";
}

export const pipelineKey = (label: string) => `${label} (pipeline)`;

/** One row per month: firm count per broad category plus a separate pipeline count. */
export function monthlyByBroad(events: PlannerEvent[], year: number, today = ""): MonthRow[] {
  const rows: MonthRow[] = MONTH_LABELS.map((month, index) => {
    const r: MonthRow = { month, index, total: 0 };
    for (const c of BROAD_CATEGORIES) { r[c.label] = 0; r[pipelineKey(c.label)] = 0; }
    return r;
  });
  for (const e of events) {
    const m = eventMonth(e, year);
    if (m == null) continue;
    const label = broadCategory(e);
    const k = PIPELINE_STATUSES.includes(_dtcStatusOf(e, today)) ? pipelineKey(label) : label;
    rows[m][k] = (rows[m][k] as number) + 1;
    rows[m].total += 1;
  }
  return rows;
}

/** Events per partner: the primary (first) partner tag, else "No partner". */
export function eventsPerPartner(events: PlannerEvent[]): Bar[] {
  return tally(events, (e) => [e.partners?.[0]?.trim() || "No partner"]);
}

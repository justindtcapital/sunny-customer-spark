import { dtcStatusOf, matchesCategoryTicks, normalizeSector, type PlannerEvent } from "./event-planner";
import { teamMemberFor } from "./user-ownership";
import type { AsanaEvent, PortfolioEvent } from "./types";

export type EventView = "planner" | "list" | "calendar" | "analytics";
export interface EventFilters {
  search: string; subcategories: string[]; sectors: string[]; statuses: string[];
  statusView: "Confirmed" | "Potential" | "Both"; portcos: string[]; partner: string; owner: string; source: string;
}
export function eventMatchesFilters(e: PlannerEvent, f: EventFilters, today: string): boolean {
  const status = dtcStatusOf(e, today);
  if (!f.statuses.includes(status)) return false;
  if (f.statusView !== "Both" && e.status !== "Declined" && e.status !== f.statusView) return false;
  if (!matchesCategoryTicks(e, f.subcategories)) return false;
  if (f.sectors.length && !e.sectors.map(normalizeSector).some(s => f.sectors.includes(s))) return false;
  if (f.portcos.length && !e.portcos.some((p) => f.portcos.includes(p))) return false;
  if (f.partner && !e.partners.some((p) => p.trim().toLowerCase() === f.partner.trim().toLowerCase())) return false;
  const owners = e.owner.split(/[;,|]/).map(s => teamMemberFor(s)?.displayName || s.trim());
  if (f.owner && !owners.includes(f.owner)) return false;
  if (f.source && e.source !== f.source) return false;
  const q = f.search.trim().toLowerCase();
  return !q || `${e.name} ${e.location} ${e.portcos.join(" ")} ${e.partners.join(" ")} ${e.notes}`.toLowerCase().includes(q);
}

/** Stable tracker identity at the legacy list/chart presentation boundary. */
export function plannerEventForView(e: PlannerEvent): AsanaEvent {
  const format = e.format === "in-person" || e.format === "virtual" || e.format === "hybrid" ? e.format : undefined;
  return {
    gid: e.urid, name: e.name, date: e.start, portcos: e.portcos, sectors: e.sectors,
    owner: e.owner, status: e.status === "Confirmed" ? "completed" : "planned", format,
    lead: e.subcategory, type: e.category === "Briefings" ? "meeting" : /dinner/i.test(e.name) ? "dinner" : "conference",
    attendeeCount: e.networkCount,
  };
}

export function mergeEventAutofill(current: Partial<PlannerEvent>, extracted: Partial<PlannerEvent>): Partial<PlannerEvent> {
  const next = { ...current };
  for (const key of ["name", "start", "end", "location", "format", "notes", "website", "lumaUrl"] as const) {
    if (extracted[key]) next[key] = extracted[key];
  }
  if (extracted.sectors?.length) next.sectors = extracted.sectors;
  if (!current.urid) { next.source = "Link"; next.sourceRef = extracted.sourceRef; }
  return next;
}

/** Tracker statuses that count as "we're doing / did this" for legacy event consumers. */
const LIVE_DTC = new Set(["Completed", "Confirmed"]);

/**
 * Tracker row → the legacy event shape the homepage, PortCo pages, exposure sync and V.I.C. read.
 * Keeps the old Asana ID as the identity when present so existing links and dedupe keys still match.
 * Returns null for Potential/Considering/Declined rows (they were never in the Asana project).
 */
export function trackerEventAsLegacy(e: PlannerEvent, today: string): AsanaEvent | null {
  if (!e.name || !e.start || !LIVE_DTC.has(dtcStatusOf(e, today))) return null;
  const format = e.format === "in-person" || e.format === "virtual" || e.format === "hybrid" ? e.format : undefined;
  return {
    gid: e.asanaGid || e.urid, name: e.name, date: e.start, portcos: e.portcos, sectors: e.sectors,
    owner: e.owner, lead: e.subcategory, format, attendeeCount: e.networkCount || undefined,
    status: (e.end || e.start) < today ? "completed" : "planned",
    role: e.category === "DTC Led Events" ? "hosted" : undefined,
    type: e.category === "Briefings" ? "meeting" : /dinner/i.test(e.name) ? "dinner" : "conference",
  };
}

/** Legacy events exploded per PortCo (lower-cased name key), for PortCo pages. */
export function portfolioEventsByCompany(events: AsanaEvent[]): Map<string, PortfolioEvent[]> {
  const out = new Map<string, PortfolioEvent[]>();
  for (const e of events) for (const pc of e.portcos) {
    const key = pc.trim().toLowerCase();
    if (!key) continue;
    const list = out.get(key) || [];
    list.push({ id: `asana-${e.gid}-${key}`, date: e.date, name: e.name, type: e.type, status: e.status, eventRole: e.role });
    out.set(key, list);
  }
  return out;
}

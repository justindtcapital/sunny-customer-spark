import { dtcStatusOf, normalizeSector, type PlannerEvent } from "./event-planner";
import { teamMemberFor } from "./user-ownership";
import type { AsanaEvent } from "./types";

export type EventView = "planner" | "list" | "calendar" | "analytics";
export interface EventFilters {
  search: string; subcategories: string[]; sectors: string[]; statuses: string[];
  statusView: "Confirmed" | "Potential" | "Both"; portco: string; partner: string; owner: string; source: string;
}
export function eventMatchesFilters(e: PlannerEvent, f: EventFilters, today: string): boolean {
  const status = dtcStatusOf(e, today);
  if (f.statuses.length ? !f.statuses.includes(status) : status === "Declined") return false;
  if (f.statusView !== "Both" && e.status !== "Declined" && e.status !== f.statusView) return false;
  if (f.subcategories.length && !f.subcategories.includes(e.subcategory)) return false;
  if (f.sectors.length && !e.sectors.map(normalizeSector).some(s => f.sectors.includes(s))) return false;
  if (f.portco && !e.portcos.includes(f.portco)) return false;
  if (f.partner && !e.partners.includes(f.partner)) return false;
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
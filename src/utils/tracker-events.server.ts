// Event Tracker-backed replacements for the retired Asana event reads (same shapes as before).
import { readPlannerEvents } from "./event-planner.server";
import { portfolioEventsByCompany, trackerEventAsLegacy } from "@/lib/event-views";
import type { AsanaEvent, PortfolioEvent } from "@/lib/types";

/** All live (Confirmed/Completed) Tracker events in the legacy event shape. */
export async function fetchTrackerEvents(): Promise<AsanaEvent[]> {
  const today = new Date().toISOString().slice(0, 10);
  return (await readPlannerEvents()).map((e) => trackerEventAsLegacy(e, today)).filter((e): e is AsanaEvent => !!e);
}

/** Tracker events per PortCo (lower-cased company name). */
export async function fetchTrackerPortfolioEvents(): Promise<Map<string, PortfolioEvent[]>> {
  return portfolioEventsByCompany(await fetchTrackerEvents());
}

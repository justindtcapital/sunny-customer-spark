// Pure shaping of one event's details and people for V.I.C. (read-only).
import type { PlannerEvent } from "@/lib/event-planner";
import type { EventPersonRow } from "@/lib/event-people";

export interface VicEventPerson { name: string; title: string; company: string; email: string; kind: string; status: string }

/** People filter: "All" keeps everyone; otherwise only that status (Attended/Registered/Invited). */
export function vicEventDetails(
  event: PlannerEvent,
  people: EventPersonRow[],
  directory: Map<string, { title?: string; company?: string }>,
  status: "All" | "Attended" | "Registered" | "Invited" = "All",
) {
  const counts: Record<string, number> = {};
  for (const p of people) counts[p.status] = (counts[p.status] || 0) + 1;
  const list: VicEventPerson[] = people
    .filter((p) => status === "All" || p.status === status)
    .map((p) => {
      const d = directory.get((p.email || "").split(/[;,]/)[0].trim().toLowerCase());
      return { name: p.name, title: d?.title || "", company: p.company || d?.company || "", email: p.email, kind: p.kind, status: p.status };
    });
  return {
    event: {
      urid: event.urid, name: event.name, start: event.start, end: event.end, location: event.location,
      category: event.category, subcategory: event.subcategory, dtcStatus: event.dtcStatus || event.status,
      owner: event.owner, format: event.format, partners: event.partners, portcos: event.portcos, sectors: event.sectors,
      website: event.website, lumaUrl: event.lumaUrl, eventContact: event.eventContact,
      notes: (event.notes || "").slice(0, 3000), actionsNeeded: (event.actionsNeeded || "").slice(0, 1500),
    },
    counts,
    totalPeople: people.length,
    people: list.slice(0, 300),
    truncated: list.length > 300,
  };
}

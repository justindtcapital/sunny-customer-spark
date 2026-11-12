import { describe, expect, it } from "vitest";
import { eventBreakdowns, eventCity, eventsInScope, monthlyByType } from "./events-dashboard";
import type { PlannerEvent } from "./event-planner";

const ev = (urid: string, start: string, subcategory: string, extra: Partial<PlannerEvent> = {}) =>
  ({ urid, name: urid, start, end: start, subcategory, location: "", portcos: [], sectors: [], ...extra }) as PlannerEvent;

const events = [
  ev("a", "2026-03-04", "Other", { location: "Austin, TX", portcos: ["VAST Data"], sectors: ["Data/AI"] }),
  ev("b", "2026-03-20", "Vation Briefs", { location: "Austin", portcos: ["VAST Data", "MavenAGI"] }),
  ev("c", "2026-07-01", "", { location: "Zoom" }),
  ev("d", "2025-03-01", "Other"),
];

describe("events dashboard", () => {
  it("counts a March event only under March and its type", () => {
    const rows = monthlyByType(events, 2026);
    expect(rows[2].total).toBe(2);
    expect(rows[2]["Other"]).toBe(1);
    expect(rows[2].Unassigned).toBe(1); // Vation Briefings only exists once Vation is added as a partner
    expect(rows[6].Unassigned).toBe(1);
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(3);
  });
  it("filters breakdowns to the selected month", () => {
    const b = eventBreakdowns(eventsInScope(events, 2026, 2), [
      { eventUrid: "a", email: "x@y.com" }, { eventUrid: "a", email: "X@y.com" }, { eventUrid: "c", email: "z@y.com" },
    ] as never);
    expect(b.perPortco).toEqual([{ label: "VAST Data", value: 2 }, { label: "MavenAGI", value: 1 }]);
    expect(b.perCity).toEqual([{ label: "Austin", value: 2 }]);
    expect(b.attendeesPerEvent).toEqual([{ label: "a", value: 1 }]);
  });
  it("groups virtual locations", () => {
    expect(eventCity("Zoom")).toBe("Virtual");
  });
});

describe("partner categories on the dashboard", () => {
  it("counts an added partner briefing under its own type", async () => {
    const { eventTypesFor } = await import("./events-dashboard");
    const types = eventTypesFor([{ partner: "Vation", row: "Briefings", color: "amber" }]);
    const rows = monthlyByType(events, 2026, types);
    expect(rows[2]["Vation Briefings"]).toBe(1);
    expect(types.find((t) => t.name === "Vation Briefings")?.color).toBe("amber");
  });
});

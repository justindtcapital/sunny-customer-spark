import { describe, expect, it } from "vitest";
import {
  parseTrackerDate, mapTrackerStatus, mapTrackerCategory, plannerWindow, stepAnchor, windowTotals,
  priorYears, guessImportMapping, categoryOfSubcategory, type PlannerEvent,
} from "../src/lib/event-planner";

const ev = (p: Partial<PlannerEvent>): PlannerEvent => ({
  urid: Math.random().toString(), name: "x", start: "", end: "", location: "", category: "", subcategory: "Unassigned",
  status: "Confirmed", sectors: [], portcos: [], partners: [], owner: "", format: "", website: "", lumaUrl: "",
  source: "", sourceRef: "", asanaGid: "", networkCount: 0, notes: "", actionsNeeded: "", eventContact: "",
  createdBy: "", updated: "", ...p,
});

describe("event planner", () => {
  it("parses tracker date ranges", () => {
    expect(parseTrackerDate("1/6-1/8", 2026)).toEqual({ start: "2026-01-06", end: "2026-01-08" });
    expect(parseTrackerDate("24-Feb", 2026)).toEqual({ start: "2026-02-24", end: "2026-02-24" });
    expect(parseTrackerDate("3/30-31", 2026)).toEqual({ start: "2026-03-30", end: "2026-03-31" });
  });
  it("maps tracker status to Confirmed / Potential / Declined", () => {
    expect(mapTrackerStatus("Executed")).toBe("Confirmed");
    expect(mapTrackerStatus("Accepted")).toBe("Confirmed");
    expect(mapTrackerStatus("Considering")).toBe("Potential");
    expect(mapTrackerStatus("")).toBe("Potential");
    expect(mapTrackerStatus("Declined")).toBe("Declined");
  });
  it("puts Vation events under Briefings", () => {
    expect(mapTrackerCategory("Pay-to-play", "Vation - Austin")).toBe("Vation Briefs");
    expect(categoryOfSubcategory("Vation Briefs")).toBe("Briefings");
  });
  it("prev/next steps by week, month and year", () => {
    expect(stepAnchor("week", "2026-10-19", 1)).toBe("2026-10-26");
    expect(stepAnchor("month", "2026-10-19", -1)).toBe("2026-09-01");
    expect(stepAnchor("year", "2026-10-19", 1)).toBe("2027-01-01");
  });
  it("week window starts Monday with 7 columns; year has 12", () => {
    const w = plannerWindow("week", "2026-10-21");
    expect(w.start).toBe("2026-10-19");
    expect(w.columns).toHaveLength(7);
    expect(plannerWindow("year", "2026-05-01").columns).toHaveLength(12);
  });
  it("totals only count events inside the window", () => {
    const es = [
      ev({ start: "2026-10-20", networkCount: 30, portcos: ["A", "B"], sectors: ["Security"] }),
      ev({ start: "2026-11-02", networkCount: 50, portcos: ["A"] }),
    ];
    const t = windowTotals(es, plannerWindow("week", "2026-10-20"));
    expect(t).toMatchObject({ events: 1, network: 30, portcos: 2 });
    expect(t.sectors.Cyber).toBe(1);
    expect(windowTotals(es, plannerWindow("year", "2026-01-01")).events).toBe(2);
  });
  it("finds prior-year editions", () => {
    const a = ev({ name: "RSA SF 2026", start: "2026-04-01" });
    const b = ev({ name: "RSA SF 2025", start: "2025-04-01" });
    expect(priorYears(a, [a, b]).map((x) => x.urid)).toEqual([b.urid]);
  });
  it("guesses CSV mapping", () => {
    const m = guessImportMapping(["Event", "Date", "Location", "Website"]);
    expect(Object.values(m)).toEqual(["name", "start", "location", "website"]);
  });
});

// Briefings in the title always land in the Briefings category.
{
  const { mapTrackerCategory, trackerYearFor, dtcStatusOf, categoryOfSubcategory } = await import("../src/lib/event-planner");
  const sub = mapTrackerCategory("dtc sponsored", "Briefing - Disney - LA");
  if (sub !== "DTC Curated Briefings" || categoryOfSubcategory(sub) !== "Briefings") throw new Error("briefing category");
  if (trackerYearFor(1, 12, 2026) !== 2027 || trackerYearFor(3, 4, 2026) !== 2026) throw new Error("year wrap");
  if (dtcStatusOf({ dtcStatus: "executed", status: "Confirmed", start: "", end: "" }) !== "Executed") throw new Error("dtc status");
  console.log("  ok  briefings, year wrap, DTC status");
}

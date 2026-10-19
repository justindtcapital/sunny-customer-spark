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

import { trackerYearFor, dtcStatusOf, mapTrackerCategory as mtc, categoryOfSubcategory as cos } from "../src/lib/event-planner";
it("briefing in the title is always a Briefings event", () => {
  const sub = mtc("dtc sponsored", "Briefing - Disney - LA");
  expect(sub).toBe("DTC Curated Briefings");
  expect(cos(sub)).toBe("Briefings");
});
it("tracker January after December rolls to next year", () => {
  expect(trackerYearFor(1, 12, 2026)).toBe(2027);
  expect(trackerYearFor(3, 4, 2026)).toBe(2026);
});
it("DTC status reads the tracker flag", () => {
  expect(dtcStatusOf({ dtcStatus: "executed", status: "Confirmed", start: "", end: "" })).toBe("Executed");
});

import { asanaMatchScore, planAsanaEnrichment, mergePlannerEvents, type AsanaLike } from "../src/lib/event-planner";
const az = (p: Partial<AsanaLike>): AsanaLike => ({
  gid: "g1", name: "RSA Conference", date: "2026-04-01", sectors: [], portcos: [], ...p,
});

describe("Asana enrichment", () => {
  it("matches by gid first, then same date + series name", () => {
    const e = ev({ name: "RSA SF 2026", start: "2026-04-01", asanaGid: "g9" });
    expect(asanaMatchScore(e, az({ gid: "g9", name: "Other", date: "2025-01-01" }))).toBe(3);
    expect(asanaMatchScore(e, az({ gid: "g1", name: "RSA SF" }))).toBe(2);
    expect(asanaMatchScore(e, az({ gid: "g1", name: "RSA SF", date: "2026-04-02" }))).toBe(0);
    expect(asanaMatchScore(e, az({ gid: "g1", name: "RSA Conference 2026 - San Francisco" }))).toBe(1);
  });
  it("enrichment fills empty fields but never overwrites", () => {
    const e = ev({ name: "RSA SF", start: "2026-04-01", format: "in-person", portcos: ["A"] });
    const plan = planAsanaEnrichment([e], [az({ format: "virtual", owner: "Chris", sectors: ["Security"], portcos: ["B"], attendeeCount: 40 })]);
    const u = plan.updates.get(e.urid)!;
    expect(u.format).toBe("in-person");
    expect(u.owner).toBe("Chris");
    expect(u.sectors).toContain("Cyber");
    expect(u.portcos).toEqual(["A", "B"]);
    expect(u.networkCount).toBe(40);
    expect(u.asanaGid).toBe("g1");
  });
  it("merges a same-date duplicate pair, Tracker row wins and keeps DTC status", () => {
    const tracker = ev({ name: "McAfee Summit", start: "2026-05-12", source: "Tracker", dtcStatus: "Accepted", subcategory: "3rd Party Events" });
    const dupe = ev({ name: "McAfee Summit 2026", start: "2026-05-12", source: "Asana", asanaGid: "g7", networkCount: 25, format: "in-person" });
    const plan = planAsanaEnrichment([tracker, dupe], []);
    expect(plan.removed).toEqual([dupe.urid]);
    const merged = plan.updates.get(tracker.urid)!;
    expect(merged.dtcStatus).toBe("Accepted");
    expect(merged.asanaGid).toBe("g7");
    expect(merged.networkCount).toBe(25);
    expect(merged.format).toBe("in-person");
  });
  it("does not merge three-plus same-date rows or different dates", () => {
    const a = ev({ name: "Dinner NYC", start: "2026-06-01" });
    const b = ev({ name: "Dinner NYC 2026", start: "2026-06-01" });
    const c = ev({ name: "Dinner NYC Extra", start: "2026-06-01" });
    expect(planAsanaEnrichment([a, b, c], []).removed).toEqual([]);
    const d = ev({ name: "Dinner NYC", start: "2026-06-02" });
    expect(planAsanaEnrichment([a, d], []).removed).toEqual([]);
  });
  it("mergePlannerEvents unions lists and keeps keeper identity", () => {
    const k = ev({ urid: "k", name: "A", portcos: ["X"], sectors: ["Cyber"] });
    const l = ev({ urid: "l", name: "A 2026", portcos: ["Y"], sectors: ["Data/AI"], website: "https://a.com" });
    const m = mergePlannerEvents(k, l);
    expect(m.urid).toBe("k");
    expect(m.portcos).toEqual(["X", "Y"]);
    expect(m.sectors).toEqual(["Cyber", "Data/AI"]);
    expect(m.website).toBe("https://a.com");
  });
});

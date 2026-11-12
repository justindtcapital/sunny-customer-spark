import { describe, it, expect } from "vitest";
import { hiddenByTicks, matchesCategoryTicks, rowEventsFor, type PlannerEvent } from "./event-planner";
import { eventMatchesFilters } from "./event-views";

const ev = (name: string, subcategory: string) =>
  ({ name, subcategory, owner: "", portcos: [], partners: [], sectors: [], status: "Confirmed", dtcStatus: "Confirmed", start: "2026-03-01", end: "2026-03-01" }) as unknown as PlannerEvent;
const row = [
  ev("ISSA Summit", "ISSA"),
  ev("CDO Magazine Dinner", "CDO Magazine"),
  ev("Other Mixer", "Other"),
];

describe("row Show all", () => {
  it("nothing ticked shows every event in the row", () => {
    expect(matchesCategoryTicks(row[0], [])).toBe(true);
    expect(rowEventsFor(row, [], false)).toHaveLength(3);
    expect(hiddenByTicks(row, [])).toBe(0);
  });
  it("ticked categories hide the rest, and the hidden count names them", () => {
    expect(matchesCategoryTicks(row[0], ["ISSA"])).toBe(true);
    expect(matchesCategoryTicks(row[2], ["ISSA"])).toBe(false);
    expect(hiddenByTicks(row, ["ISSA"])).toBe(2);
    expect(rowEventsFor(row, ["ISSA"], false).map((e) => e.name)).toEqual(["ISSA Summit"]);
  });
  it("Show all brings back the unticked events for that row only", () => {
    expect(rowEventsFor(row, ["ISSA"], true).map((e) => e.name)).toEqual(["ISSA Summit", "CDO Magazine Dinner", "Other Mixer"]);
  });
  it("the shared filter uses the same ticks rule", () => {
    const f = { search: "", subcategories: ["ISSA"], sectors: [], statuses: ["Confirmed", "Completed", "Considering", "Potential", "Declined"], statusView: "Both", portcos: [], partner: "", owner: "", source: "" } as const;
    expect(eventMatchesFilters(row[0], { ...f }, "")).toBe(true);
    expect(eventMatchesFilters(row[1], { ...f }, "")).toBe(false);
  });
});

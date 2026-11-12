import { describe, expect, it } from "vitest";
import { availablePotential, matchesPotentialPick, plannerCategories, potentialIndex } from "./event-planner";

const cats = plannerCategories([
  { partner: "ISSA", row: "Partner Led Events", color: "indigo" },
  { partner: "Vation", row: "Briefings", color: "amber" },
]);
const potential = [
  { subcategory: "DTC Event" },
  { subcategory: "DTC Event" },
  { subcategory: "Vation Briefings" },
];

describe("Potential row index", () => {
  it("lists the same categories and partners as the rows above, in order, with counts", () => {
    const idx = potentialIndex(potential, cats);
    expect(idx.map((x) => x.name)).toEqual(["DTC Event", "ISSA", "Other", "DTC Curated Briefings", "Vation Briefings", "Other Briefings"]);
    expect(idx.find((x) => x.name === "DTC Event")!.count).toBe(2);
    expect(idx.find((x) => x.name === "ISSA")!.count).toBe(0);
  });
  it("shows No category only when a potential event has none", () => {
    expect(potentialIndex(potential, cats).some((x) => x.row === "Unassigned")).toBe(false);
    expect(potentialIndex([{ subcategory: "" }], cats).find((x) => x.row === "Unassigned")!.count).toBe(1);
  });
  it("All selects only categories that have potential events", () => {
    expect(availablePotential(potentialIndex(potential, cats))).toEqual(["DTC Event", "Vation Briefings"]);
  });
  it("picking narrows the Potential row; nothing picked shows everything", () => {
    expect(matchesPotentialPick({ subcategory: "ISSA" }, [])).toBe(true);
    expect(matchesPotentialPick({ subcategory: "ISSA" }, ["DTC Event"])).toBe(false);
    expect(matchesPotentialPick({ subcategory: "Vation Briefs" }, ["Vation Briefings"])).toBe(true);
  });
});

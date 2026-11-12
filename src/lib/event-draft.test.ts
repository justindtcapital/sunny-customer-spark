import { describe, expect, it } from "vitest";
import { changedFields, draftProblem, inList } from "./event-draft";
import type { PlannerEvent } from "./event-planner";

const ev = (p: Partial<PlannerEvent> = {}): PlannerEvent => ({
  urid: "E1", name: "GBI Impact - CIO NYC", start: "2026-11-10", end: "2026-11-10", location: "", category: "Partner Led Events",
  subcategory: "GBI Roundtable", status: "Potential", sectors: [], portcos: [], partners: [], owner: "", format: "", website: "",
  lumaUrl: "", source: "", sourceRef: "", asanaGid: "", networkCount: 0, notes: "", actionsNeeded: "", eventContact: "",
  createdBy: "", updated: "u1", dtcStatus: "Potential", ...p,
});
const rowOf = (sub: string) => (sub === "Unassigned" || !sub ? "Unassigned" : "Partner Led Events");

describe("side panel draft", () => {
  it("sends only fields that actually changed", () => {
    expect(changedFields(ev(), { name: "GBI Impact - CIO NYC", partners: ["GBI Impact"] })).toEqual({ partners: ["GBI Impact"] });
  });
  it("blocks moving an uncategorised event past Potential", () => {
    expect(draftProblem(ev({ subcategory: "Unassigned" }), { dtcStatus: "Considering" }, rowOf, "2026-11-12")).toMatch(/category/);
    expect(draftProblem(ev(), { dtcStatus: "Considering" }, rowOf, "2026-11-12")).toBe("");
  });
  it("requires a name", () => {
    expect(draftProblem(ev(), { name: "  " }, rowOf, "2026-11-12")).toBe("Event name is required");
  });
  it("matches partner names regardless of case", () => {
    expect(inList(["GBI Impact"], "gbi impact")).toBe(true);
    expect(inList(["GBI Impact"], "GBI")).toBe(false);
  });
});

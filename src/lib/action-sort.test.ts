import { describe, expect, it } from "vitest";
import { companyKindVisible, priorityRank, sortActions } from "./action-sort";

describe("companyKindVisible", () => {
  it("shows every company when no company box is ticked", () => {
    const none = { portcos: false, network: false, ops: false };
    expect(companyKindVisible(none, "portcos")).toBe(true);
    expect(companyKindVisible(none, "network")).toBe(true);
    expect(companyKindVisible(none, "ops")).toBe(true);
  });
  it("limits to the ticked company kinds otherwise", () => {
    const only = { portcos: true, network: false, ops: false };
    expect(companyKindVisible(only, "portcos")).toBe(true);
    expect(companyKindVisible(only, "network")).toBe(false);
  });
});

describe("sortActions", () => {
  const items = [
    { company: "B", title: "b", date: "2026-11-01", due: "2026-11-20", priority: "3: Low - Could Do" },
    { company: "A", title: "a", date: "2026-11-05", due: "", priority: "1: High - Must Do" },
    { company: "C", title: "c", date: "", due: "2026-11-10", priority: "2: Med - Should Do" },
  ];
  it("Date puts the newest first and undated last", () => {
    expect(sortActions(items, "date").map((i) => i.title)).toEqual(["a", "b", "c"]);
  });
  it("Due date puts the soonest first and no due date last", () => {
    expect(sortActions(items, "due").map((i) => i.title)).toEqual(["c", "b", "a"]);
  });
  it("Priority orders Must, Should, Could", () => {
    expect(sortActions(items, "priority").map((i) => i.title)).toEqual(["a", "c", "b"]);
  });
  it("ranks unprioritised items after Could Do", () => {
    expect(priorityRank("")).toBeGreaterThan(priorityRank("3. Could Do"));
  });
});

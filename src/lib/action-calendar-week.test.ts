import { describe, it, expect } from "vitest";
import { currentWeekRange } from "./action-calendar";
describe("currentWeekRange", () => {
  it("Sunday belongs to the week starting the previous Monday", () => {
    expect(currentWeekRange("2026-11-15")).toEqual({ start: "2026-11-09", end: "2026-11-15" });
  });
  it("Monday starts its own week", () => {
    expect(currentWeekRange("2026-11-16")).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  });
});

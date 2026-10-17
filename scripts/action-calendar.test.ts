import { describe, expect, it } from "vitest";
import { actionDayCounts, inActionRange, orderedDateRange } from "../src/lib/action-calendar";
describe("action date selection", () => {
  it("clicking today includes only today's due actions", () => { const range = orderedDateRange("2026-10-17", "2026-10-17"); expect(inActionRange("2026-10-17", range)).toBe(true); expect(inActionRange("2026-10-18", range)).toBe(false); expect(inActionRange("", range)).toBe(false); });
  it("dragging a week selects all seven dates inclusively in either direction", () => { const range = orderedDateRange("2026-10-18", "2026-10-12"); expect(range).toEqual({ start: "2026-10-12", end: "2026-10-18" }); for (let d = 12; d <= 18; d++) expect(inActionRange(`2026-10-${d}`, range)).toBe(true); expect(inActionRange("2026-10-19", range)).toBe(false); });
  it("counts actions for each day without counting undated tasks", () => { expect([...actionDayCounts([{ due: "2026-10-17" }, { due: "2026-10-17" }, { due: "2026-10-18" }, { due: "" }])]).toEqual([["2026-10-17", 2], ["2026-10-18", 1]]); });
  it("all dates includes undated follow-ups again", () => { expect(inActionRange("", null)).toBe(true); });
});
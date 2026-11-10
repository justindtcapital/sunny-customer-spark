import { describe, expect, it } from "vitest";
import { actionDueLabel, inActionRange } from "./action-calendar";

describe("inActionRange", () => {
  const day = { start: "2026-11-10", end: "2026-11-10" };
  it("includes the selected day", () => expect(inActionRange("2026-11-10", day)).toBe(true));
  it("includes every earlier day", () => expect(inActionRange("2026-11-09", day)).toBe(true));
  it("excludes later days", () => expect(inActionRange("2026-11-11", day)).toBe(false));
  it("excludes undated actions", () => expect(inActionRange("", day)).toBe(false));
});

describe("actionDueLabel", () => {
  it("shows today's action as 11/10, not overdue", () => expect(actionDueLabel("2026-11-10", "2026-11-10")).toEqual({ text: "11/10", overdue: false }));
  it("marks an earlier day overdue", () => expect(actionDueLabel("2026-11-09", "2026-11-10")).toEqual({ text: "11/9", overdue: true }));
});

import { describe, it, expect } from "vitest";
import { completedActions, type CompletedAction } from "../src/lib/completed-actions";

describe("Completed actions", () => {
  const rows: CompletedAction[] = ["workstream", "followup", "note", "activity"].map((kind, i) => ({ id: String(i), kind: kind as CompletedAction["kind"], title: kind, date: "2025-01-01", person: "", portco: "", owner: "Chris Falloon" }));
  it("includes all four completed action types even beyond 30 days", () => {
    expect(completedActions(rows, "Chris Falloon", new Set()).map((r) => r.kind)).toEqual(["workstream", "followup", "note", "activity"]);
  });
  it("keeps owners separate and excludes undone actions and duplicate tracks", () => {
    expect(completedActions([...rows, rows[0], { ...rows[1], id: "other", owner: "Julia Beech" }, { ...rows[2], id: "undone", actionId: "action:1" }], "Chris Falloon", new Set(["action:1"]))).toHaveLength(4);
  });
});
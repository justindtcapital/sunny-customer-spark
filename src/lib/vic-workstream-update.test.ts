import { describe, expect, it } from "vitest";
import { workstreamEditPlan } from "./vic-workstream-update";

const cur = { status: "Early Conversations", priority: "2: Med - Should Do", notes: "Kickoff held", completed: false };

describe("workstreamEditPlan", () => {
  it("returns null when nothing changed", () => {
    expect(workstreamEditPlan("ws-1", cur, { status: "Early Conversations", priority: "2: Med - Should Do", note: "", completed: false }, "2026-11-15")).toBeNull();
  });
  it("sends only the changed status and appends a dated note", () => {
    const r = workstreamEditPlan("ws-1", cur, { status: "Working to Complete", priority: "2: Med - Should Do", note: "Dell OEM call booked", completed: false }, "2026-11-15");
    expect(r?.changes).toEqual([{ gid: "Workstream Status", type: "multi_enum", original: "Early Conversations", value: ["Working to Complete"] }]);
    expect(r?.notes?.value).toBe("Kickoff held\n2026-11-15: Dell OEM call booked");
    expect(r && "completed" in r).toBe(false);
  });
  it("treats status order as unchanged", () => {
    const c = { ...cur, status: "Stalled, Early Conversations" };
    expect(workstreamEditPlan("ws-1", c, { ...c, status: "Early Conversations, Stalled", note: "" }, "2026-11-15")).toBeNull();
  });
  it("includes changed Sell With Dell, Sell-In, and Dell Stakeholders fields", () => {
    const c = { ...cur, sellWithDellStatus: "Interested", sellInStatus: "", dellStakeholders: "" };
    const r = workstreamEditPlan(
      "ws-1",
      c,
      { ...c, sellWithDellStatus: "Engaged / Progressing", sellInStatus: "Working to Engage", dellStakeholders: "Alex Smith", note: "" },
      "2026-11-15",
    );
    expect(r?.changes).toEqual([
      { gid: "Sell With Dell Status", type: "multi_enum", original: "Interested", value: ["Engaged / Progressing"] },
      { gid: "Sell-In Status", type: "enum", original: "", value: "Working to Engage" },
      { gid: "Dell Stakeholders", type: "text", original: "", value: "Alex Smith" },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { followUpOrigin, inheritedWorkstream, nextInThread, nextStepSummary, nextStepTitle, originText, quickFollowUpDates } from "./action-thread";

describe("quickFollowUpDates", () => {
  it("offers tomorrow, 3 days, 1 week, 2 weeks and 1 month from today", () => {
    expect(quickFollowUpDates("2026-11-24").map((d) => d.date)).toEqual(["2026-11-25", "2026-11-27", "2026-12-01", "2026-12-08", "2026-12-24"]);
  });
  it("clamps one month to the end of a shorter month", () => {
    expect(quickFollowUpDates("2027-01-31")[4]!.date).toBe("2027-02-28");
  });
});

describe("followUpOrigin", () => {
  it("shows the completed step before a chained follow-up", () => {
    const o = followUpOrigin({ recordId: "followup:abc", summary: nextStepSummary("Send deck", "Sent it, waiting on legal") }, undefined, { title: "Send deck", resolvedAt: "2026-11-20T10:00:00Z" });
    expect(o).toEqual({ label: "Previous step", title: "Send deck", date: "2026-11-20", text: "Sent it, waiting on legal" });
  });
  it("names the source meeting note", () => {
    expect(followUpOrigin({ recordId: "rec1", summary: "" }, { sourceType: "granola", title: "RBC sync", date: "2026-11-16" }).label).toBe("Meeting note");
  });
  it("reads the earlier step from the summary when it can't be looked up", () => {
    expect(followUpOrigin({ recordId: "acme:12", summary: 'After "Call Jane"' }).title).toBe("Call Jane");
  });
  it("strips V.I.C. boilerplate", () => {
    expect(originText("Follow-up set from Action with V.I.C. (followup): Check for a response")).toBe("Check for a response");
    expect(originText('Follow-up from "RBC payments win" — due 2026-11-23')).toBe("");
  });
});

describe("inheritedWorkstream", () => {
  it("carries a workstream forward through earlier steps", () => {
    const prior = new Map([["f2", { recordId: "f1" }], ["f1", { recordId: "ws:123" }]]);
    expect(inheritedWorkstream("f2", (id) => prior.get(id))).toBe("123");
  });
  it("uses an earlier step's saved workstream", () => {
    expect(inheritedWorkstream("f1", () => ({ recordId: "note9", workstreamGid: "777" }))).toBe("777");
  });
  it("is empty when nothing links to a workstream", () => {
    expect(inheritedWorkstream("note9", () => undefined)).toBe("");
  });
});

describe("nextInThread", () => {
  const base = { summary: "", person: "" };
  it("prefers the follow-up scheduled from this one", () => {
    const x = { ...base, id: "a", activityId: "a", due: "2026-11-20", workstreamGid: "w" };
    const later = { ...base, id: "b", due: "2026-11-22", workstreamGid: "w" };
    const chained = { ...base, id: "c", recordId: "a", due: "2026-12-01" };
    expect(nextInThread(x, [x, later, chained])?.id).toBe("c");
  });
  it("falls back to the next due on the same workstream", () => {
    const x = { ...base, id: "a", due: "2026-11-20", workstreamGid: "w" };
    const earlier = { ...base, id: "b", due: "2026-11-10", workstreamGid: "w" };
    const later = { ...base, id: "c", due: "2026-11-25", workstreamGid: "w" };
    const other = { ...base, id: "d", due: "2026-11-21", workstreamGid: "z" };
    expect(nextInThread(x, [x, earlier, later, other])?.id).toBe("c");
  });
});

describe("nextStepTitle", () => {
  it("names the person when there is one", () => {
    expect(nextStepTitle({ summary: "Send deck", person: "Jane Doe" })).toBe("Follow up with Jane Doe");
  });
  it("never suggests following up with a teammate", () => {
    expect(nextStepTitle({ summary: "Compare notes with Hillock", person: "Chris Falloon" }, (n) => n === "Chris Falloon")).toBe("Follow up: Compare notes with Hillock");
  });
});

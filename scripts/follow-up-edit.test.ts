import { describe, expect, it } from "vitest";
import { applyFollowUpEdit, followUpEditSchema, followUpValues } from "../src/lib/follow-up-edit";
import type { HomeReminder } from "../src/lib/home-momentum";
const original: HomeReminder = { id: "note:123", activityId: "123", source: "Notes", person: "Chris", email: "chris@example.com", owner: "Chris Falloon", company: "MavenAGI", due: "2026-10-22", summary: "Follow up", originalNote: "Original transcript" };
describe("task editing", () => {
  it("saves editable task fields without changing its original source or completion keys", () => {
    const edit = { ...followUpValues(original), summary: "Send Maven deck", details: "Discuss pilot", due: "2026-10-26", owner: "Julia Beech", company: "Dell", people: [{ name: "Jonathan", email: "jonathan@example.com" }], tracks: ["BD" as const] };
    const result = applyFollowUpEdit(original, edit);
    expect(result).toMatchObject({ id: "note:123", activityId: "123", originalNote: "Original transcript", email: "chris@example.com", summary: "Send Maven deck", due: "2026-10-26", owner: "Julia Beech", company: "Dell", details: "Discuss pilot", people: edit.people, tracks: ["BD"] });
    expect(original.summary).toBe("Follow up");
  });
  it("links an action to a workstream and can unlink it again", () => {
    const linked = applyFollowUpEdit(original, { ...followUpValues(original), workstreamGid: "gid-1" });
    expect(linked.workstreamGid).toBe("gid-1");
    const unlinked = applyFollowUpEdit(linked, { ...followUpValues(linked), workstreamGid: "" });
    expect(unlinked.workstreamGid).toBeUndefined();
  });
  it("rejects empty action titles", () => { expect(followUpEditSchema.safeParse({ ...followUpValues(original), summary: " " }).success).toBe(false); });
  it("allows clearing a due date", () => { expect(followUpEditSchema.safeParse({ ...followUpValues(original), due: "" }).success).toBe(true); });
});
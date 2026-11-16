import { describe, expect, it } from "vitest";
import { completionPlan, dropReminders } from "./follow-up-completion";

describe("completionPlan", () => {
  it("does not close a note-logged follow-up a second time", () => {
    expect(completionPlan({ activityId: "fu:1" }, "Sent the deck", false)).toEqual({ logAction: true, closeSeparately: false });
  });
  it("closes directly when there is no note or next follow-up", () => {
    expect(completionPlan({ activityId: "fu:1" }, "  ", false)).toEqual({ logAction: false, closeSeparately: true });
  });
  it("still closes contact-trail follow-ups that have no activity row", () => {
    expect(completionPlan({}, "Called", false)).toEqual({ logAction: true, closeSeparately: true });
  });
  it("logs when only a future follow-up is set", () => {
    expect(completionPlan({ activityId: "fu:1" }, "", true).logAction).toBe(true);
  });
});

describe("dropReminders", () => {
  it("removes only the completed follow-up", () => {
    const data = { reminders: [{ id: "a" }, { id: "b" }] };
    expect(dropReminders(data, (r) => r.id === "a")?.reminders).toEqual([{ id: "b" }]);
  });
});

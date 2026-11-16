import { describe, expect, it } from "vitest";
import { canUndoCompletion, completionPlan, dropReminders, restoreReminder, withRetry } from "./follow-up-completion";

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

describe("withRetry", () => {
  it("retries a save that hits Google's limit, then succeeds", async () => {
    let calls = 0;
    const res = await withRetry(async () => { calls++; if (calls < 3) throw new Error("429"); return true; }, [1, 1, 1], async () => {});
    expect([res, calls]).toEqual([true, 3]);
  });
  it("does not retry when the row simply wasn't found", async () => {
    let calls = 0;
    expect(await withRetry(async () => { calls++; return false; }, [1, 1], async () => {})).toBe(false);
    expect(calls).toBe(1);
  });
  it("gives up after the last retry", async () => {
    await expect(withRetry(async () => { throw new Error("429"); }, [1, 1], async () => {})).rejects.toThrow("429");
  });
});

describe("restoreReminder", () => {
  it("puts an undone follow-up back once", () => {
    const d = { reminders: [{ id: "a" }] };
    expect(restoreReminder(d, { id: "b" })?.reminders.map((r) => r.id)).toEqual(["a", "b"]);
    expect(restoreReminder(d, { id: "a" })).toBe(d);
  });
});

describe("canUndoCompletion", () => {
  it("allows undo for activity follow-ups but not contact flags", () => {
    expect(canUndoCompletion({ id: "x", activityId: "fu:1" })).toBe(true);
    expect(canUndoCompletion({ id: "flag:a@b.com", source: "Network", email: "a@b.com" })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { isPendingNote } from "../src/utils/notes-inbox.server";

describe("notes inbox", () => {
  it("hides reviewed notes from the pending inbox", () => {
    const reviews = new Map([["r1", { reviewedAt: "2026-10-14", reviewedBy: "a", workstream: "", contactsAdded: 0, followUps: 0 }]]);
    expect(isPendingNote("r1", reviews)).toBe(false);
    expect(isPendingNote("r2", reviews)).toBe(true);
  });
});

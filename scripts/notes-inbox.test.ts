import { describe, expect, it } from "vitest";
import { isPendingNote } from "../src/utils/notes-inbox.server";

describe("notes inbox", () => {
  it("hides reviewed notes from the pending inbox", () => {
    const reviews = new Map([["r1", { reviewedAt: "2026-10-14", reviewedBy: "a", workstream: "", contactsAdded: 0, followUps: 0 }]]);
    expect(isPendingNote("r1", reviews)).toBe(false);
    expect(isPendingNote("r2", reviews)).toBe(true);
  });
});

import { isRegisteredActivity } from "../src/utils/notes-inbox.server";

describe("activity review gate", () => {
  const base = { reviewedAt: "2026-10-15", reviewedBy: "a", workstream: "", contactsAdded: 0, followUps: 0 };
  it("keeps unreviewed alias emails out of registered activity", () => {
    expect(isRegisteredActivity("gmail-bd", undefined)).toBe(false);
  });
  it("registers confirmed alias emails", () => {
    expect(isRegisteredActivity("gmail-gtm", { ...base, status: "confirmed" as const })).toBe(true);
  });
  it("excludes skipped alias emails", () => {
    expect(isRegisteredActivity("gmail-workstreams", { ...base, status: "skipped" as const })).toBe(false);
  });
  it("leaves Asana archive and notes activity registered", () => {
    expect(isRegisteredActivity("asana", undefined)).toBe(true);
    expect(isRegisteredActivity("granola", undefined)).toBe(true);
  });
});

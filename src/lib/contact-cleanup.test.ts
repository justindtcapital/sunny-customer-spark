import { describe, it, expect } from "vitest";
import { emailDuplicateGroups, pickCleanupKeeper, sheetTime, type CleanupRecord } from "./contact-cleanup";

const rec = (urid: string, row: number, v: Record<string, string>): CleanupRecord => ({ urid, row, values: { email: "a@x.com", ...v } });

describe("email duplicate cleanup", () => {
  it("groups people who share an email, skipping merged rows and dismissed groups", () => {
    const rs = [rec("1", 1, {}), rec("2", 2, { email: "A@x.com; b@y.com" }), rec("3", 3, { email: "b@y.com" }), rec("4", 4, { "relationship status": "Merged" }), rec("5", 5, { email: "c@z.com" }), rec("6", 6, { email: "c@z.com" })];
    const g = emailDuplicateGroups(rs, [["5", "6"]]);
    expect(g.map((x) => x.records.map((r) => r.urid))).toEqual([["1", "2", "3"]]);
  });
  it("keeps the most recently added record when no later status change exists", () => {
    const g = { email: "a@x.com", records: [rec("old", 1, { "date added": "4/14/2026 20:26:01", "relationship status": "Prospecting" }), rec("new", 2, { "date added": "6/5/2026", "relationship status": "Prospecting" })] };
    expect(pickCleanupKeeper(g, [])).toEqual({ keeperUrid: "new", status: "Prospecting", reason: "newest record" });
  });
  it("a status change logged after the newest record wins and keeps the record holding that status", () => {
    const g = { email: "a@x.com", records: [rec("warm", 1, { "date added": "1/2/2026", "relationship status": "Warm" }), rec("new", 2, { "date added": "6/5/2026", "relationship status": "Prospecting" })] };
    expect(pickCleanupKeeper(g, [{ email: "A@x.com", to: "Warm", at: "2026-07-01T10:00:00Z" }])).toEqual({ keeperUrid: "warm", status: "Warm", reason: "latest status change" });
  });
  it("ignores status changes older than the newest record", () => {
    const g = { email: "a@x.com", records: [rec("warm", 1, { "date added": "1/2/2026", "relationship status": "Warm" }), rec("new", 2, { "date added": "6/5/2026", "relationship status": "Cold" })] };
    expect(pickCleanupKeeper(g, [{ email: "a@x.com", to: "Warm", at: "2026-03-01T10:00:00Z" }]).keeperUrid).toBe("new");
  });
  it("ignores logged entries that are not statuses (such as Removed)", () => {
    const g = { email: "a@x.com", records: [rec("cold", 1, { "date added": "1/2/2026", "relationship status": "Cold" }), rec("new", 2, { "date added": "6/5/2026", "relationship status": "Hot" })] };
    expect(pickCleanupKeeper(g, [{ email: "a@x.com", to: "Removed", at: "2026-07-01T10:00:00Z" }]).keeperUrid).toBe("new");
  });
  it("reads sheet dates with or without a time", () => {
    expect(sheetTime("6/5/2026")).toBe(Date.UTC(2026, 5, 5));
    expect(sheetTime("4/14/2026 20:26:01")).toBe(Date.UTC(2026, 3, 14, 20, 26, 1));
  });
});

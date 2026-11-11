import { describe, expect, it } from "vitest";
import { campaignBucket, campaignStats, creditedOwners, networkDashboardStats, touchesInWindow, type PersonInfo, type Touch } from "./network-dashboard";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const people = (entries: [string, PersonInfo][]) => new Map(entries);

describe("network dashboard", () => {
  it("credits the contact's owner, by full teammate name", () => {
    expect(creditedOwners("Falloon")).toEqual(["Chris Falloon"]);
    expect(creditedOwners("julia@dt-capital.net")).toEqual(["Julia Beech"]);
    expect(creditedOwners("Falloon, Beech")).toEqual(["Chris Falloon", "Julia Beech"]);
    expect(creditedOwners("Someone Else")).toEqual(["Unassigned"]);
  });

  it("counts emails, campaign sends and logged activity, once per person per day", () => {
    const touches: Touch[] = [
      { person: "a@x.com", date: "2026-11-01T10:00:00Z", source: "Email" },
      { person: "a@x.com", date: "2026-11-01", source: "Campaign" },
      { person: "a@x.com", date: "2026-11-02", source: "Logged" },
      { person: "b@x.com", date: "2026-11-03", source: "Campaign" },
    ];
    expect(touchesInWindow(touches, 90, NOW)).toHaveLength(3);
  });

  it("defaults to the last 90 days", () => {
    const touches: Touch[] = [
      { person: "a@x.com", date: "2026-10-01", source: "Email" },
      { person: "a@x.com", date: "2026-07-01", source: "Email" },
    ];
    expect(touchesInWindow(touches, 90, NOW)).toHaveLength(1);
  });

  it("conversion counts prospects reached who moved into the Network after the touch, credited to the owner", () => {
    const p = people([
      ["a@x.com", { prime: "Shane Earley", tier: "Cold", prospect: false }],
      ["b@x.com", { prime: "Shane Earley", tier: "Prospect", prospect: true }],
    ]);
    const touches: Touch[] = [
      { person: "a@x.com", date: "2026-10-01", source: "Email" },
      { person: "b@x.com", date: "2026-10-02", source: "Email" },
    ];
    const movements = [{ ts: "2026-10-05T00:00:00Z", email: "a@x.com", from: "Prospecting", to: "Cold" }];
    const { rows, total } = networkDashboardStats({ people: p, touches, movements, days: 90, now: NOW });
    const shane = rows.find((r) => r.owner === "Shane Earley")!;
    expect(shane.prospectsReached).toBe(2);
    expect(shane.converted).toBe(1);
    expect(shane.conversionRate).toBe(0.5);
    expect(total.converted).toBe(1);
  });

  it("Cold→Warm and Warm→Hot rates use people at that level now plus those promoted out", () => {
    const p = people([
      ["a@x.com", { prime: "Julia Beech", tier: "Warm", prospect: false }],
      ["b@x.com", { prime: "Julia Beech", tier: "Cold", prospect: false }],
      ["c@x.com", { prime: "Julia Beech", tier: "Hot", prospect: false }],
    ]);
    const movements = [
      { ts: "2026-10-05", email: "a@x.com", from: "Cold", to: "Warm" },
      { ts: "2026-10-06", email: "c@x.com", from: "Warm", to: "Hot" },
    ];
    const julia = networkDashboardStats({ people: p, touches: [], movements, days: 90, now: NOW }).rows.find((r) => r.owner === "Julia Beech")!;
    expect([julia.coldToWarm, julia.coldBase]).toEqual([1, 2]);
    expect([julia.warmToHot, julia.warmBase]).toEqual([1, 2]);
  });

  it("campaigns: draft/saved are Open, actioning is Active, done is Closed", () => {
    expect(["draft", "saved", "actioning", "done"].map(campaignBucket)).toEqual(["Open", "Open", "Active", "Closed"]);
    const s = campaignStats([
      { status: "actioning", owner: "Chris Hillock", createdBy: "" },
      { status: "done", owner: "", createdBy: "chrish@dt-capital.net" },
      { status: "draft", owner: "Chris Falloon", createdBy: "" },
    ]);
    expect(s.totals).toEqual({ Open: 1, Active: 1, Closed: 1 });
    expect(s.byOwner.find((o) => o.owner === "Chris Hillock")).toMatchObject({ Active: 1, Closed: 1 });
  });
});

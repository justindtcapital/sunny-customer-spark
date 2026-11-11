import { describe, expect, it } from "vitest";
import { campaignBucket, campaignStats, creditedOwners, networkDashboardStats, touchesInWindow, type PersonInfo, type Touch } from "./network-dashboard";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const people = (entries: [string, PersonInfo][]) => new Map(entries);

describe("network dashboard", () => {
  it("resolves teammates by full name", () => {
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

  it("an unattributed touch merges into a same-day touch with a teammate; two teammates both count", () => {
    const touches: Touch[] = [
      { person: "a@x.com", date: "2026-11-01", source: "Email" },
      { person: "a@x.com", date: "2026-11-01", source: "Logged", actor: "Chris Hillock" },
      { person: "a@x.com", date: "2026-11-01", source: "Logged", actor: "julia@dt-capital.net" },
    ];
    expect(touchesInWindow(touches, 90, NOW).map((t) => t.actor).sort()).toEqual(["Chris Hillock", "Julia Beech"]);
  });

  it("defaults to the last 90 days", () => {
    const touches: Touch[] = [
      { person: "a@x.com", date: "2026-10-01", source: "Email" },
      { person: "a@x.com", date: "2026-07-01", source: "Email" },
    ];
    expect(touchesInWindow(touches, 90, NOW)).toHaveLength(1);
  });

  it("outreach and conversion credit the teammate who acted, not the contact owner", () => {
    const p = people([
      ["a@x.com", { prime: "Julia Beech", tier: "Cold", prospect: false }],
      ["b@x.com", { prime: "Julia Beech", tier: "Prospect", prospect: true }],
    ]);
    const touches: Touch[] = [
      { person: "a@x.com", date: "2026-10-01", source: "Logged", actor: "shane@dt-capital.net" },
      { person: "b@x.com", date: "2026-10-02", source: "Logged", actor: "Shane Earley" },
    ];
    const movements = [{ ts: "2026-10-05T00:00:00Z", email: "a@x.com", from: "Prospecting", to: "Cold" }];
    const { rows, total } = networkDashboardStats({ people: p, touches, movements, days: 90, now: NOW });
    const shane = rows.find((r) => r.owner === "Shane Earley")!;
    expect(rows.find((r) => r.owner === "Julia Beech")!.outreach).toBe(0);
    expect(shane.outreach).toBe(2);
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

  it("campaigns: draft/saved are Open, actioning/done are Active, closed is Closed", () => {
    expect(["draft", "saved", "actioning", "done", "closed"].map(campaignBucket)).toEqual(["Open", "Open", "Active", "Active", "Closed"]);
    const s = campaignStats([
      { status: "actioning", owner: "Chris Hillock", createdBy: "" },
      { status: "done", owner: "", createdBy: "chrish@dt-capital.net" },
      { status: "draft", owner: "Chris Falloon", createdBy: "" },
    ]);
    expect(s.totals).toEqual({ Open: 1, Active: 1, Closed: 1 });
    expect(s.byOwner.find((o) => o.owner === "Chris Hillock")).toMatchObject({ Active: 1, Closed: 1 });
  });
});

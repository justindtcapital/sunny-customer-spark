import { describe, it, expect } from "vitest";
import { normalizeInvestor, normalizeOwner, normalizeStatuses, splitFields, mergeVpWins, matchDellTargets, PROFILE_FIELDS } from "./portco-import";

describe("portco import", () => {
  it("lead investor snaps to the fixed list", () => {
    expect(normalizeInvestor("Scott ")).toEqual({ value: "Scott", known: true });
    expect(normalizeInvestor("Bob").known).toBe(false);
  });
  it("owners must be on the team", () => {
    expect(normalizeOwner("Julia Beech").onTeam).toBe(true);
    expect(normalizeOwner("Random Person").onTeam).toBe(false);
  });
  it("drops Dell Leverage - Sell Through status", () => {
    expect(normalizeStatuses("Stalled, Dell Leverage - Sell Through")).toEqual({ value: "Stalled", dropped: ["Dell Leverage - Sell Through"] });
  });
  it("Next Steps are discarded, unknown fields archived", () => {
    const s = splitFields({ "Lead Investor ": "Scott", "Next Steps": "call", "Dell Champion": "X" }, PROFILE_FIELDS);
    expect(s.kept).toEqual({ "Lead Investor": "Scott" });
    expect(s.archived).toEqual({ "Dell Champion": "X" });
  });
  it("Venture Pulse wins over Asana", () => {
    const r = mergeVpWins({ "DTC Priority": "1 - Needle Mover" }, { "DTC Priority": "2 - Nurture", "Company Stage": "Seed" });
    expect(r.merged).toEqual({ "DTC Priority": "1 - Needle Mover", "Company Stage": "Seed" });
    expect(r.conflicts).toHaveLength(1);
  });
  it("Dell targets link only on unique match", () => {
    const d = [{ urid: "a", name: "Jane Doe" }, { urid: "b", name: "Sam Lee" }, { urid: "c", name: "Sam Lee" }];
    expect(matchDellTargets("Jane Doe, Sam Lee, New Guy", d).map((m) => m.status)).toEqual(["linked", "ambiguous", "new"]);
  });
});

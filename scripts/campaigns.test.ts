import { describe, expect, it } from "vitest";
import { followUpDueDate, mergeCandidates, type CandidatePerson } from "../src/lib/campaigns";

const p = (name: string, email = "", company = "Acme"): CandidatePerson => ({
  name,
  email,
  company,
  title: "",
  linkedin: "",
  origin: "upload",
});

describe("campaign list merge", () => {
  it("dedupes by email, then name + company", () => {
    const base = [p("Ann Lee", "ann@acme.com")];
    const r = mergeCandidates(base, [p("Ann L", "ANN@acme.com"), p("Bob Ray", "", "Acme"), p("bob ray", "", "acme")]);
    expect(r.added).toBe(1);
    expect(r.list).toHaveLength(2);
  });
  it("skips people already in the campaign", () => {
    const r = mergeCandidates([], [p("Ann Lee", "ann@acme.com")], new Set(["ann@acme.com"]));
    expect(r.added).toBe(0);
  });
});

describe("follow-up due date", () => {
  const from = new Date("2026-01-31T12:00:00Z");
  it("adds days", () => expect(followUpDueDate(from, 3, "days")).toBe("2026-02-03"));
  it("adds weeks", () => expect(followUpDueDate(from, 2, "weeks")).toBe("2026-02-14"));
  it("clamps month end", () => expect(followUpDueDate(from, 1, "months")).toBe("2026-02-28"));
});

import { memberRowsFor, summarizeMembers, type CampaignMember } from "../src/lib/campaigns";

const m = (over: Partial<CampaignMember>): CampaignMember => ({
  campaignId: "c1", personKey: "k", kind: "prospect", name: "", email: "", title: "", company: "",
  linkedin: "", added: "", subject: "", body: "", sentChannel: "", sentDate: "", followUpOwner: "", followUpDue: "",
  ...over,
});

describe("campaign summary + delete rows", () => {
  it("counts kinds, contacted and follow-ups", () => {
    const s = summarizeMembers([
      m({ kind: "network", sentDate: "2026-10-01" }),
      m({ body: "hi", followUpDue: "2026-11-02", followUpOwner: "Shane Earley" }),
      m({ followUpDue: "2026-10-20" }),
    ]);
    expect(s).toMatchObject({ total: 3, network: 1, prospect: 2, contacted: 1, personalized: 1, openFollowUps: 2, nextFollowUp: "2026-10-20" });
  });
  it("only selects rows for the deleted campaign", () => {
    expect(memberRowsFor(["c1", "c2", "c1", ""], "c1")).toEqual([2, 4]);
  });
});

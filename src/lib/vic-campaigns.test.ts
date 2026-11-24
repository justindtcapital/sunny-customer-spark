import { describe, expect, it } from "vitest";
import { vicCampaignDetails, vicCampaignSummary } from "./vic-campaigns";
import type { CampaignMember, CampaignRecord } from "./campaigns";
import type { ResultRow } from "./campaign-results";

const campaign: CampaignRecord = {
  id: "camp-1",
  name: "DIU Military Intro",
  purpose: "Business development",
  events: ["Defense Summit"],
  portcos: ["Terra Security", "Nox Security"],
  owner: "Chris Falloon",
  channel: "email",
  templateSubject: "Intro to DTC portfolio",
  templateBody: "Hi there",
  status: "actioning",
  created: "2026-11-01T10:00:00Z",
  updated: "2026-11-10T10:00:00Z",
  createdBy: "chris.falloon@dell.com",
  memberCount: 3,
};

const members: CampaignMember[] = [
  {
    campaignId: "camp-1", personKey: "ann@a.com", kind: "network", name: "Ann Lee", email: "ann@a.com",
    title: "CISO", company: "Acme", linkedin: "", added: "2026-11-01", subject: "", body: "",
    sentChannel: "email", sentDate: "2026-11-02", followUpOwner: "", followUpDue: "",
  },
  {
    campaignId: "camp-1", personKey: "bob@b.com", kind: "prospect", name: "Bob Ray", email: "bob@b.com",
    title: "VP Eng", company: "Beta", linkedin: "", added: "2026-11-01", subject: "", body: "",
    sentChannel: "email", sentDate: "2026-11-02", followUpOwner: "Chris Falloon", followUpDue: "2026-11-15",
  },
  {
    campaignId: "camp-1", personKey: "cam@c.com", kind: "network", name: "Cam Wu", email: "cam@c.com",
    title: "CTO", company: "Core", linkedin: "", added: "2026-11-03", subject: "", body: "",
    sentChannel: "", sentDate: "", followUpOwner: "", followUpDue: "",
  },
];

const results: ResultRow[] = [
  { campaignId: "camp-1", personKey: "ann@a.com", result: "interested", followUpOwner: "", followUpDue: "", by: "Chris Falloon", at: "2026-11-03T10:00:00Z" },
  { campaignId: "camp-1", personKey: "ann@a.com", result: "attending", followUpOwner: "", followUpDue: "", by: "Chris Falloon", at: "2026-11-04T10:00:00Z" },
  { campaignId: "camp-1", personKey: "bob@b.com", result: "declined", followUpOwner: "", followUpDue: "", by: "Chris Falloon", at: "2026-11-03T12:00:00Z" },
];

describe("vic-campaigns", () => {
  it("shapes campaign summaries with canonical type label", () => {
    expect(vicCampaignSummary(campaign)).toMatchObject({
      id: "camp-1",
      name: "DIU Military Intro",
      type: "Business development",
      memberCount: 3,
    });
  });

  it("lists every campaign member with latest normalized result and sent counts", () => {
    const d = vicCampaignDetails(campaign, members, results);
    expect(d.counts).toEqual({
      total: 3,
      sent: 2,
      unsent: 1,
      results: { Interested: 0, Confirmed: 1, Declined: 1, "No reply": 0, Unmarked: 1 },
    });
    expect(d.people.map((p) => [p.name, p.result, p.kind])).toEqual([
      ["Ann Lee", "Confirmed", "Network"],
      ["Bob Ray", "Declined", "Prospect"],
      ["Cam Wu", "Unmarked", "Network"],
    ]);
    expect(d.truncated).toBe(false);
  });

  it("filters by result and sent status and supports pagination", () => {
    const confirmed = vicCampaignDetails(campaign, members, results, { result: "Confirmed" });
    expect(confirmed.people.map((p) => p.name)).toEqual(["Ann Lee"]);

    const unsent = vicCampaignDetails(campaign, members, results, { sent: "Not sent" });
    expect(unsent.people.map((p) => p.name)).toEqual(["Cam Wu"]);

    const page1 = vicCampaignDetails(campaign, members, results, { offset: 0, limit: 2 });
    expect(page1.people.map((p) => p.name)).toEqual(["Ann Lee", "Bob Ray"]);
    expect(page1.truncated).toBe(true);

    const page2 = vicCampaignDetails(campaign, members, results, { offset: 2, limit: 2 });
    expect(page2.people.map((p) => p.name)).toEqual(["Cam Wu"]);
    expect(page2.truncated).toBe(false);
  });
});
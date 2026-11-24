import { describe, expect, it } from "vitest";
import { vicDellLeverageView, vicPortcoProfile } from "./vic-portfolio";
import type { PortfolioCompany } from "./types";
import type { Workstream } from "./workstream-parse";
import { SWD_STATUS_FIELD } from "./sell-with-dell-status";
import { SELL_IN_FIELD } from "./sell-in-status";

const company: PortfolioCompany = {
  id: "pc1", urid: "pc-u1", name: "Terra Security", sector: "Cybersecurity", domain: "Security",
  website: "https://terra.security", location: "New York, NY", description: "AI pentesting.",
} as PortfolioCompany;

const ws: Workstream = {
  gid: "ws-1", company: "Terra Security", segment: "GTM", name: "Dell Services partnership",
  rawName: "Dell Services partnership", owner: "Chris Falloon", status: "Working to Complete",
  workstreamStatus: "Working to Complete", workstreamPriority: "1: High - Must Do",
  sellInStatus: "Interested", maturity: "", dellTargets: "Dell - Services", dellStakeholders: "Alex Dell",
  category: "Dell Leverage - Sell Through", nextSteps: "Intro to Services VP", notes: "Intro to Services VP",
  lastActivity: "2026-11-10", completed: false, url: "",
  fields: {
    "Workstream Status": "Working to Complete",
    "Workstream Priority": "1: High - Must Do",
    "GTM Strategy Category": "Dell Leverage - Sell Through",
    [SWD_STATUS_FIELD]: "Engaged / Progressing",
    [SELL_IN_FIELD]: "Interested",
    "Dell Targets": "Dell - Services",
    "Dell Stakeholders": "Alex Dell",
  },
} as unknown as Workstream;

describe("vic-portfolio", () => {
  it("builds a full PortCo profile with profile fields, workstreams, events and campaigns", () => {
    const r = vicPortcoProfile({
      company,
      profile: { urid: "pc-u1", company: "Terra Security", owner: "Chris Falloon", fields: { "Lead Investor": "Scott", "Company Stage": "Series A" }, archived: { Legacy: "Yes" }, updatedAt: "2026-11-12", updatedBy: "Chris Falloon" },
      workstreams: [ws],
      contacts: [],
      events: [{ urid: "e1", name: "RSAC", start: "2026-04-20", location: "SF", status: "Confirmed", dtcStatus: "Confirmed", portcos: ["Terra Security"] } as never],
      campaigns: [{ id: "c1", name: "DIU Intro", status: "actioning", owner: "Chris Falloon", portcos: ["Terra Security"], memberCount: 12 } as never],
    });
    expect(r.profileFields["Lead Investor"]).toBe("Scott");
    expect(r.activeWorkstreams[0]?.sellWithDellStatus).toBe("Engaged / Progressing");
    expect(r.events).toHaveLength(1);
    expect(r.campaigns).toHaveLength(1);
  });

  it("shapes the Dell Leverage status board and stakeholder map", () => {
    const d = vicDellLeverageView({ workstreams: [ws], contacts: [], companies: [company], changes: [] });
    expect(d.workstreams.length).toBeGreaterThanOrEqual(1);
    expect(d.stageBoard.some((col) => col.companies.includes("Terra Security"))).toBe(true);
  });
});
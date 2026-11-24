import { describe, expect, it } from "vitest";
import { filterNetworkContacts, unifyForVic, vicContactDossier, vicNetworkSummary } from "./vic-contacts";
import type { Contact, TargetLead } from "./types";

const baseContact = (over: Partial<Contact>): Contact => ({
  id: "c1", urid: "u1", name: "Jane Doe", title: "CISO", company: "Acme Corp", email: "jane@acme.com",
  phone: "555-0100", address: "", location: "Boston, MA", linkedinUrl: "https://linkedin.com/in/jane",
  prime: "Chris Falloon", sector: "Security", areasOfInterest: ["Security"], primaryArea: "Security",
  temperature: "Council", kind: "Network", portCoIntros: ["Terra Security"],
  eventsAttended: ["Boston CISO Dinner"], eventsInvited: [],
  interactions: [{ id: "i1", date: "2026-11-10", type: "meeting", summary: "Met at dinner", owner: "Chris Falloon" }],
  ...over,
});

const baseProspect = (over: Partial<TargetLead>): TargetLead => ({
  id: "t1", urid: "p1", name: "Sam Ray", title: "VP Engineering", company: "Beta Inc",
  linkedinUrl: "", email: "sam@beta.com", phone: "", location: "Austin, TX", sector: "AI",
  stage: "Prospecting", originSource: "Apollo", prime: "Shane Earley", outreach: [], notes: "",
  ...over,
});

describe("vic-contacts", () => {
  const contacts = [
    baseContact({}),
    baseContact({ id: "c2", urid: "u2", name: "Pat Portco", company: "Terra Security", email: "pat@terra.io", kind: "PortCo", portco: true, temperature: "Council", location: "New York, NY", prime: "Julia Beech" }),
  ];
  const prospects = [baseProspect({})];
  const unified = unifyForVic(contacts, prospects);

  it("keeps PortCo contacts unrated and filters by tier, market, kind and owner", () => {
    expect(unified.find((r) => r.urid === "u2")?.tier).toBe("Not rated (PortCo)");
    const bostonCouncil = filterNetworkContacts(unified, { tier: "Council", market: "Boston" });
    expect(bostonCouncil.people.map((p) => p.name)).toEqual(["Jane Doe"]);
    const shaneProspects = filterNetworkContacts(unified, { owner: "Shane Earley", includeProspects: true });
    expect(shaneProspects.people.map((p) => p.name)).toEqual(["Sam Ray"]);
    const portcos = filterNetworkContacts(unified, { kind: "PortCo" });
    expect(portcos.people.map((p) => p.name)).toEqual(["Pat Portco"]);
  });

  it("builds a full contact dossier including interactions, events, intros and campaigns", () => {
    const d = vicContactDossier({
      contact: contacts[0],
      campaigns: [{ id: "camp-1", name: "Q4 Outreach", status: "actioning", sentDate: "2026-11-01", result: "Confirmed" }],
      emails: [{ date: "2026-11-05", subject: "Hello", owner: "Chris Falloon" }],
    });
    expect(d?.list).toBe("Network");
    expect(d?.market).toBe("Boston");
    expect(d?.campaigns).toHaveLength(1);
    expect(d && "portcoIntros" in d ? d.portcoIntros : []).toEqual(["Terra Security"]);
  });

  it("computes Network Pyramid counts and excludes PortCo from rated tiers", () => {
    const summary = vicNetworkSummary({
      rows: unified,
      targets: { Council: 25, Hot: 100 },
      movements: [{ ts: new Date().toISOString(), email: "jane@acme.com", from: "Hot", to: "Council" }],
    });
    expect(summary.byTier).toMatchObject({ Council: 1, Prospect: 1 });
    expect(summary.byKind).toMatchObject({ Network: 2, PortCo: 1 });
    expect(summary.targets).toEqual({ Council: 25, Hot: 100 });
  });
});
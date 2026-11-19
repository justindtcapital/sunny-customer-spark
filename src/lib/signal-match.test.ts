import { describe, expect, it } from "vitest";
import { defaultFollowUpDate, personCandidates, portcoCandidates, validateMatches } from "./signal-match";
import type { Contact, PortfolioCompany } from "./types";

const person = (id: string, temperature: Contact["temperature"], company = "Acme", extra: Partial<Contact> = {}): Contact => ({
  id, name: `Person ${id}`, title: "CISO", company, email: `${id}@x.com`, phone: "", address: "", prime: "", sector: "",
  areasOfInterest: [], temperature, portCoIntros: [], eventsAttended: [], eventsInvited: [], interactions: [], ...extra,
});
const pc = (name: string): PortfolioCompany => ({
  id: name, name, sector: "Security", domain: "Security" as PortfolioCompany["domain"], website: "", linkedinUrl: "", location: "",
  description: `${name} does things`, contactName: `${name} CEO`, contactEmail: `ceo@${name}.com`, phone: "",
  contactPhone: "", employees: [], events: [], introductions: [],
} as unknown as PortfolioCompany);

describe("personCandidates", () => {
  it("offers only Council, Hot and Warm people", () => {
    const ids = personCandidates([person("a", "Council"), person("b", "Hot"), person("c", "Warm"), person("d", "Cold")]).map((p) => p.id);
    expect(ids).toEqual(["a", "b", "c"]);
  });
  it("includes Cold people at the company in the news, listed first", () => {
    const ids = personCandidates([person("a", "Council"), person("d", "Cold", "Snowflake")], "Snowflake").map((p) => p.id);
    expect(ids).toEqual(["d", "a"]);
  });
  it("never offers PortCo people, even with an old Council rating", () => {
    expect(personCandidates([person("p", "Council", "Terra", { portco: true, kind: "PortCo" })], "Terra")).toEqual([]);
  });
});

describe("validateMatches", () => {
  const people = personCandidates([person("a", "Council"), person("b", "Hot")]);
  const portcos = portcoCandidates([pc("Terra"), pc("Halcyon")]);
  it("drops invented people and companies", () => {
    const m = validateMatches({
      portcos: [{ name: "Made Up Co", angle: "Validation", why: "x", talkingPoint: "" }, { name: "halcyon", angle: "GTM opening", why: "Fits.", talkingPoint: "" }],
      people: [{ id: "zzz", why: "x", opener: "" }, { id: "a", why: "Owns this.", opener: "" }],
      note: "",
    }, people, portcos);
    expect(m.portcos.map((p) => p.name)).toEqual(["Halcyon"]);
    expect(m.people.map((p) => p.id)).toEqual(["a"]);
  });
  it("never suggests the PortCo the news is about", () => {
    const m = validateMatches({ portcos: [{ name: "Terra", angle: "Validation", why: "Self.", talkingPoint: "" }], people: [], note: "" }, people, portcos, "Terra");
    expect(m.portcos).toEqual([]);
  });
  it("carries the PortCo founder for the email draft", () => {
    const m = validateMatches({ portcos: [{ name: "Terra", angle: "Risk", why: "Heads up.", talkingPoint: "" }], people: [], note: "" }, people, portcos);
    expect(m.portcos[0]).toMatchObject({ founderName: "Terra CEO", founderEmail: "ceo@Terra.com", angle: "Risk" });
  });
  it("caps at 3 PortCos and 4 people", () => {
    const many = personCandidates(["1", "2", "3", "4", "5"].map((i) => person(i, "Hot")));
    const pcs = portcoCandidates(["A", "B", "C", "D"].map(pc));
    const m = validateMatches({
      portcos: pcs.map((p) => ({ name: p.name, angle: "Validation", why: "y", talkingPoint: "" })),
      people: many.map((p) => ({ id: p.id, why: "y", opener: "" })), note: "",
    }, many, pcs);
    expect(m.portcos).toHaveLength(3);
    expect(m.people).toHaveLength(4);
  });
});

describe("defaultFollowUpDate", () => {
  it("is three days out", () => expect(defaultFollowUpDate(new Date("2026-11-16T12:00:00Z"))).toBe("2026-11-19"));
  it("moves a Saturday to Monday", () => expect(defaultFollowUpDate(new Date("2026-11-18T12:00:00Z"))).toBe("2026-11-23"));
});

import { signalTopic } from "./signal-match";
describe("signalTopic", () => {
  it("replaces a 'Company — Category' headline with the summary's first sentence", () => {
    expect(signalTopic({ company: "IBM", headline: "IBM — Funding/M&A", summary: "IBM acquired AuthMind. More text." })).toBe("IBM acquired AuthMind.");
  });
  it("doesn't stop at 'Corp.'", () => {
    expect(signalTopic({ company: "IBM", headline: "IBM — Funding/M&A", summary: "IBM Corp. has acquired AuthMind to add agent identity. More." })).toBe("IBM Corp. has acquired AuthMind to add agent identity.");
  });
  it("keeps a real headline", () => {
    expect(signalTopic({ company: "IBM", headline: "IBM buys identity startup AuthMind for Vault", summary: "x" })).toBe("IBM buys identity startup AuthMind for Vault");
  });
});

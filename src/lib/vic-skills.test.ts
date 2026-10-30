import { describe, expect, it } from "vitest";
import { getVicSkill, VIC_SKILLS } from "./vic-skills";
import { introductionCandidates } from "./vic-introductions";
import type { Contact } from "./types";

const contact = (overrides: Partial<Contact>): Contact => ({ id: "one", urid: "one", name: "Alex", title: "CISO", company: "Example", email: "alex@example.com", phone: "", address: "", prime: "Chris F", sector: "Security", areasOfInterest: ["AI security"], temperature: "Cold", portCoIntros: [], eventsAttended: [], eventsInvited: [], interactions: [], ...overrides });
const input = { terms: ["security"], mine: true, teamEmail: "chrisf@dt-capital.net", portcos: ["MavenAGI"], target: "MavenAGI" };
describe("Vic skills", () => {
  it("exposes the three shared workflows and rejects unknown skill IDs", () => {
    expect(VIC_SKILLS.map((s) => s.id)).toEqual(["portfolio-questions", "company-overlap", "intro-matching"]);
    expect(getVicSkill("user-supplied-instructions")).toBeUndefined();
  });
  it("resolves relationship primes through teammate aliases for My Network", () => {
    const result = introductionCandidates([contact({}), contact({ urid: "two", prime: "Julia" })], input);
    expect(result.candidates.map((c) => c.urid)).toEqual(["one"]);
    expect(result.candidates[0]?.prime).toBe("Chris Falloon");
  });
  it("excludes PortCo employees from external introduction candidates", () => {
    expect(introductionCandidates([contact({ company: "MavenAGI" })], input).total).toBe(0);
  });
  it("deduplicates canonical records and preserves manual Cold ratings", () => {
    const original = contact({ portCoIntros: ["MavenAGI"] });
    const result = introductionCandidates([original, original], input);
    expect(result.total).toBe(1);
    expect(result.candidates[0]?.alreadyIntroduced).toBe(true);
    expect(result.candidates[0]?.level).toBe("Cold");
    expect(original.temperature).toBe("Cold");
  });
  it("does not return a whole network for an empty matching request", () => {
    expect(introductionCandidates([contact({})], { ...input, terms: [] }).total).toBe(0);
  });
});
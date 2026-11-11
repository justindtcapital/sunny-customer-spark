import { describe, expect, it } from "vitest";
import { classifyContacts, kindShown, manualKind, resolveKind, toggleKind, tracksRating } from "./contact-kind";
import type { Contact } from "./types";
import type { Partner } from "./partners";

const partners: Partner[] = [
  { name: "Trace3", category: "Resellers & Integrators", website: "https://www.trace3.com", notes: "", aliases: [] },
  { name: "Dell", category: "Dell", website: "https://www.dell.com", notes: "", aliases: ["Dell Technologies"] },
];
const person = (p: Partial<Contact>): Contact => ({
  id: p.email || "x", name: "A", title: "", company: "", email: "", phone: "", address: "", prime: "", sector: "",
  areasOfInterest: [], temperature: "Warm", portCoIntros: [], eventsAttended: [], eventsInvited: [], interactions: [], ...p,
});
const kindOf = (p: Partial<Contact>) => classifyContacts([person(p)], { portcoNames: ["MavenAGI"], partners })[0].kind;

describe("contact types", () => {
  it("a manual pick always beats the guess, both ways", () => {
    expect(kindOf({ company: "MavenAGI", contactType: "Network" })).toBe("Network");
    expect(kindOf({ company: "Acme", contactType: "PortCo" })).toBe("PortCo");
    expect(kindOf({ company: "Dell Technologies", contactType: "Partner" })).toBe("Partner");
  });
  it("guesses PortCo, then Dell, then Partner, then Network", () => {
    expect(resolveKind(null, { portco: true, dell: true, partner: true })).toBe("PortCo");
    expect(resolveKind(null, { portco: false, dell: true, partner: true })).toBe("Dell");
    expect(kindOf({ company: "Dell Technologies" })).toBe("Dell");
    expect(kindOf({ company: "Trace3" })).toBe("Partner");
    expect(kindOf({ company: "Acme", email: "a@trace3.com" })).toBe("Partner");
    expect(kindOf({ company: "Acme" })).toBe("Network");
  });
  it("legacy Customer/VC values fall back to the automatic guess", () => {
    expect(manualKind("Customer")).toBeNull();
    expect(manualKind("VC")).toBeNull();
    expect(kindOf({ company: "Trace3", contactType: "Customer" })).toBe("Partner");
  });
  it("PortCo people aren't rated; Dell, Partner and Network people are", () => {
    expect(tracksRating("PortCo")).toBe(false);
    expect(tracksRating("Dell")).toBe(true);
    expect(tracksRating("Partner")).toBe(true);
    expect(tracksRating("Network")).toBe(true);
  });
  it("classifying never changes the saved rating", () => {
    const [c] = classifyContacts([person({ company: "MavenAGI", temperature: "Hot" })], { portcoNames: ["MavenAGI"], partners });
    expect(c.temperature).toBe("Hot");
    expect(c.portco).toBe(true);
  });
  it("unticking a type hides only that type", () => {
    const hidden = toggleKind([], "Partner");
    expect(kindShown({ kind: "Partner" }, hidden)).toBe(false);
    expect(kindShown({ kind: "Dell" }, hidden)).toBe(true);
    expect(kindShown({ kind: "Network" }, hidden)).toBe(true);
    expect(toggleKind(hidden, "Partner")).toEqual([]);
  });
});

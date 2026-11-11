import { describe, expect, it } from "vitest";
import { fileFollowUp, portcoMatchKey, resolveActionContact } from "./action-grouping";

const dir = [
  { name: "Charles Mongeon", email: "charles@acme.com", company: "Acme" },
  { name: "Katherine Walther", email: "kw@trace3.com", company: "Trace3" },
  { name: "Matt Darcy", email: "md@digitalrealty.com", company: "Digital Realty" },
  { name: "Chris Falloon", email: "chrisf@dt-capital.net", company: "DTC" },
];
const team = (s: string) => /falloon/i.test(s);

describe("portcoMatchKey", () => {
  it("treats Bland and Bland AI as the same PortCo", () => {
    expect(portcoMatchKey("Bland AI")).toBe(portcoMatchKey("Bland"));
  });
  it("treats SiMa.ai and SiMa as the same PortCo", () => {
    expect(portcoMatchKey("SiMa.ai")).toBe(portcoMatchKey("SiMa"));
  });
});

describe("resolveActionContact", () => {
  it("uses a tagged person's company", () => {
    expect(resolveActionContact({ person: "Chris Falloon", summary: "Re-Connect w Mongeon", people: [{ name: "Charles Mongeon", email: "" }] }, dir, team))
      .toEqual({ name: "Charles Mongeon", company: "Acme" });
  });
  it("uses the follow-up's own person when they are in the Network", () => {
    expect(resolveActionContact({ person: "Katherine Walther", summary: "Follow up w Katherine" }, dir, team)?.company).toBe("Trace3");
  });
  it("finds one full name written in the title when the person is a teammate", () => {
    expect(resolveActionContact({ person: "Chris Falloon", summary: "Meet Matt Darcy in New York" }, dir, team)?.company).toBe("Digital Realty");
  });
  it("matches a unique surname after 'w'", () => {
    expect(resolveActionContact({ person: "Chris Falloon", summary: "Re-Connect w Mongeon" }, dir, team)?.company).toBe("Acme");
  });
  it("never groups under a teammate", () => {
    expect(resolveActionContact({ person: "Chris Falloon", summary: "Prep board deck" }, dir, team)).toBeNull();
  });
  it("leaves a name shared by people at different companies unresolved", () => {
    const twins = [...dir, { name: "Matt Darcy", email: "m2@other.com", company: "Other" }];
    expect(resolveActionContact({ person: "Chris Falloon", summary: "Meet Matt Darcy" }, twins, team)).toBeNull();
  });
});

describe("fileFollowUp", () => {
  const portco = (n: string) => (/^bland( ai)?$/i.test(n.trim()) ? "Bland AI" : /^sima/i.test(n.trim()) ? "SiMa.ai" : "");
  it("files a Bland-tagged follow-up with Brian Moyer under Home Depot, tagged Bland", () => {
    expect(fileFollowUp({ company: "Bland", groupCompany: "Home Depot", contactName: "Brian Moyer" }, portco, team))
      .toEqual({ kind: "network", group: "Home Depot", portcoTag: "Bland AI", auto: true });
  });
  it("keeps a follow-up with someone at the PortCo under the PortCo", () => {
    expect(fileFollowUp({ company: "Bland", groupCompany: "Bland AI", contactName: "Isaiah Granet" }, portco, team))
      .toMatchObject({ kind: "portcos", group: "Bland AI" });
  });
  it("keeps a PortCo-tagged follow-up with no outside person under the PortCo", () => {
    expect(fileFollowUp({ company: "SiMa", person: "Chris Falloon" }, portco, team)).toMatchObject({ kind: "portcos", group: "SiMa.ai" });
  });
  it("lets the user file a Network-looking follow-up under the PortCo", () => {
    expect(fileFollowUp({ company: "Bland", groupCompany: "Home Depot", filing: "portco" }, portco, team))
      .toEqual({ kind: "portcos", group: "Bland AI", portcoTag: "Bland AI", auto: false });
  });
  it("lets the user file a PortCo follow-up under the person's company", () => {
    expect(fileFollowUp({ company: "Bland", contactName: "Brian Moyer", filing: "network" }, portco, team))
      .toMatchObject({ kind: "network", group: "Brian Moyer", portcoTag: "Bland AI" });
  });
  it("files an untagged follow-up under the outside person's company", () => {
    expect(fileFollowUp({ groupCompany: "Trace3", person: "Chris Falloon" }, portco, team)).toMatchObject({ kind: "network", group: "Trace3", portcoTag: "" });
  });
  it("puts follow-ups with no company and only a teammate under PortDev Ops", () => {
    expect(fileFollowUp({ company: "No PortCo", person: "Chris Falloon" }, portco, team).kind).toBe("ops");
  });
});

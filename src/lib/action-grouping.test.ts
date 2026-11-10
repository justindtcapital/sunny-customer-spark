import { describe, expect, it } from "vitest";
import { portcoMatchKey, resolveActionContact } from "./action-grouping";

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
  it("never groups under a teammate", () => {
    expect(resolveActionContact({ person: "Chris Falloon", summary: "Prep board deck" }, dir, team)).toBeNull();
  });
  it("leaves a name shared by people at different companies unresolved", () => {
    const twins = [...dir, { name: "Matt Darcy", email: "m2@other.com", company: "Other" }];
    expect(resolveActionContact({ person: "Chris Falloon", summary: "Meet Matt Darcy" }, twins, team)).toBeNull();
  });
});

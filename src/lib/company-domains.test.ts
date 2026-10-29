import { describe, expect, it } from "vitest";
import {
  findCompanyClash,
  linkContactsByDomain,
  normalizeDomain,
  suggestDomainMatches,
  validateDomainAliases,
} from "./company-domains";

describe("normalizeDomain", () => {
  it("strips protocol, www, path, port and case", () => {
    expect(normalizeDomain("HTTPS://www.GetMaven.io:443/about?x=1")).toBe("getmaven.io");
  });
  it("collapses subdomains and keeps two-part country suffixes", () => {
    expect(normalizeDomain("jane@mail.acme.com")).toBe("acme.com");
    expect(normalizeDomain("eu.acme.co.uk")).toBe("acme.co.uk");
  });
});

describe("linkContactsByDomain", () => {
  const maven = { name: "MavenAGI", website: "getmaven.io", domainAliases: ["mavenagi.com"] };
  it("links website and verified alias domains, marking alias matches", () => {
    const res = linkContactsByDomain(
      [{ email: "a@getmaven.io" }, { email: "b@mavenagi.com" }, { email: "c@other.com" }],
      maven,
    );
    expect(res.map((r) => r.contact.email)).toEqual(["a@getmaven.io", "b@mavenagi.com"]);
    expect(res[1].via).toBe("mavenagi.com");
    expect(res[0].via).toBeUndefined();
  });
  it("never links through a shared email provider, even if listed", () => {
    const res = linkContactsByDomain([{ email: "x@gmail.com" }], { name: "X", domainAliases: ["gmail.com"] });
    expect(res).toHaveLength(0);
  });
});

describe("validateDomainAliases", () => {
  it("rejects shared providers and domains owned by another company", () => {
    const res = validateDomainAliases("gmail.com, coactive.ai, mavenagi.com", { name: "MavenAGI", website: "getmaven.io" }, [
      { name: "Coactive", website: "https://coactive.ai" },
    ]);
    expect(res.accepted).toEqual(["mavenagi.com"]);
    expect(res.rejected.map((r) => r.domain)).toEqual(["gmail.com", "coactive.ai"]);
  });
});

describe("suggestDomainMatches", () => {
  it("suggests similar domains without linking them", () => {
    const company = { name: "MavenAGI", website: "mavenagi.com" };
    const contacts = [{ email: "a@mavenagi.co", company: "" }, { email: "b@unrelated.com", company: "" }];
    const s = suggestDomainMatches(contacts, company);
    expect(s.map((x) => x.domain)).toEqual(["mavenagi.co"]);
    expect(linkContactsByDomain(contacts, company)).toHaveLength(0);
  });
  it("suggests by company name and respects dismissals", () => {
    const company = { name: "Coactive AI", website: "coactive.ai", dismissedDomains: ["oldco.com"] };
    const contacts = [{ email: "a@coactivesystems.com", company: "Coactive AI" }, { email: "b@oldco.com", company: "Coactive AI" }];
    expect(suggestDomainMatches(contacts, company).map((x) => x.domain)).toEqual(["coactivesystems.com"]);
  });
});

describe("findCompanyClash", () => {
  it("catches a new company whose website is an existing company's alias", () => {
    const clash = findCompanyClash(
      [{ name: "MavenAGI", website: "getmaven.io", domainAliases: ["mavenagi.com"] }],
      { name: "Maven", website: "https://www.mavenagi.com" },
    );
    expect(clash?.company.name).toBe("MavenAGI");
  });
});

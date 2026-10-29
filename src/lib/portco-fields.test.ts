import { describe, expect, it } from "vitest";
import { compareCompanyNames, isLinkedInCompanyUrl } from "./portco-fields";

describe("isLinkedInCompanyUrl", () => {
  it("allows empty", () => expect(isLinkedInCompanyUrl("  ")).toBe(true));
  it("accepts company pages with or without scheme/www", () => {
    expect(isLinkedInCompanyUrl("linkedin.com/company/acme")).toBe(true);
    expect(isLinkedInCompanyUrl("https://www.linkedin.com/company/acme/")).toBe(true);
    expect(isLinkedInCompanyUrl("https://linkedin.com/school/mit")).toBe(true);
    expect(isLinkedInCompanyUrl("linkedin.com/showcase/acme-ai")).toBe(true);
  });
  it("rejects personal profiles, other sites and junk", () => {
    expect(isLinkedInCompanyUrl("linkedin.com/in/jane")).toBe(false);
    expect(isLinkedInCompanyUrl("https://acme.com/company/acme")).toBe(false);
    expect(isLinkedInCompanyUrl("not a url")).toBe(false);
    expect(isLinkedInCompanyUrl("https://notlinkedin.com/company/x")).toBe(false);
  });
});

describe("compareCompanyNames", () => {
  it("sorts A–Z ignoring case and surrounding spaces", () => {
    const list = [{ name: " beta" }, { name: "alpha2" }, { name: "Alpha" }, { name: "gamma " }];
    expect([...list].sort(compareCompanyNames).map((c) => c.name.trim())).toEqual(["Alpha", "alpha2", "beta", "gamma"]);
  });
  it("is stable on equal names via id", () => {
    const list = [{ name: "Acme", id: "b" }, { name: "acme", id: "a" }, { name: "Acme", id: "a" }];
    expect([...list].sort(compareCompanyNames).map((c) => c.id)).toEqual(["a", "a", "b"]);
  });
});

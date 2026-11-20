import { describe, expect, it } from "vitest";
import {
  EMPTY_NETWORK_FILTER,
  facetCounts,
  filterAudience,
  filterByRoles,
  filterPortcos,
  portcoPeopleIndex,
  roleGroupOf,
  seniorityOf,
  type AudiencePerson,
} from "./campaign-audience";

describe("roleGroupOf", () => {
  it("puts founders and chiefs in leadership", () => {
    expect(roleGroupOf("Co-Founder & CEO")).toBe("Founders & C-suite");
    expect(roleGroupOf("Chief Revenue Officer")).toBe("Founders & C-suite");
    expect(roleGroupOf("President")).toBe("Founders & C-suite");
  });
  it("treats a vice president of sales as GTM, not leadership", () => {
    expect(roleGroupOf("Vice President of Sales")).toBe("Sales & GTM");
    expect(roleGroupOf("Head of Partnerships")).toBe("Sales & GTM");
  });
  it("leaves other roles in everyone else", () => {
    expect(roleGroupOf("Staff Engineer")).toBe("Everyone else");
  });
});

it("seniorityOf reads VP, director and manager levels", () => {
  expect(seniorityOf("SVP Engineering")).toBe("VP");
  expect(seniorityOf("Senior Vice President, IT")).toBe("VP");
  expect(seniorityOf("Director of Security")).toBe("Director");
  expect(seniorityOf("Product Manager")).toBe("Manager");
  expect(seniorityOf("CISO")).toBe("C-suite");
});

it("filterPortcos narrows by domain, market and name together", () => {
  const cos = [
    { name: "Alpha", domain: "Security", location: "Boston, MA" },
    { name: "Beta", domain: "Logistics", location: "Austin, TX" },
    { name: "Gamma", domain: "Security", location: "New York, NY" },
  ];
  expect(filterPortcos(cos, { search: "", domains: ["Security"], markets: [] }).map((c) => c.name)).toEqual(["Alpha", "Gamma"]);
  expect(filterPortcos(cos, { search: "", domains: ["Supply Chain"], markets: [] }).map((c) => c.name)).toEqual(["Beta"]);
  expect(filterPortcos(cos, { search: "", domains: ["Security"], markets: ["Boston"] }).map((c) => c.name)).toEqual(["Alpha"]);
  expect(filterPortcos(cos, { search: "gam", domains: [], markets: [] }).map((c) => c.name)).toEqual(["Gamma"]);
});

it("portcoPeopleIndex links people by website domain or company name, never shared mail", () => {
  const cos = [
    { name: "Glen Coco", domain: "AI", website: "https://glencoco.ai" },
    { name: "Tetri", domain: "Data", website: "tetri.io" },
  ];
  const people = [
    { name: "A", email: "a@glencoco.ai", company: "" },
    { name: "B", email: "b@gmail.com", company: "Tetri Inc." },
    { name: "C", email: "c@gmail.com", company: "Someone Else" },
  ];
  const idx = portcoPeopleIndex(cos, people);
  expect(idx.get("Glen Coco")?.map((p) => p.name)).toEqual(["A"]);
  expect(idx.get("Tetri")?.map((p) => p.name)).toEqual(["B"]);
});

it("filterByRoles keeps only the chosen role groups, empty keeps everyone", () => {
  const ppl = [{ title: "CEO" }, { title: "Account Executive" }, { title: "Engineer" }];
  expect(filterByRoles(ppl, ["Founders & C-suite"]).length).toBe(1);
  expect(filterByRoles(ppl, ["Founders & C-suite", "Sales & GTM"]).length).toBe(2);
  expect(filterByRoles(ppl, []).length).toBe(3);
});

describe("network audience filters", () => {
  const p = (o: Partial<AudiencePerson>): AudiencePerson => ({
    name: "x", company: "Acme", email: "", title: "", tier: "Warm", domain: "Security", market: "Boston", seniority: "VP", ...o,
  });
  const people = [
    p({ name: "1", tier: "Hot" }),
    p({ name: "2", tier: "Warm", market: "Austin" }),
    p({ name: "3", tier: "Hot", company: "Globex", domain: "AI & Data" }),
  ];
  it("combines tier, market and company filters", () => {
    expect(filterAudience(people, { ...EMPTY_NETWORK_FILTER, tiers: ["Hot"] }).map((x) => x.name)).toEqual(["1", "3"]);
    expect(filterAudience(people, { ...EMPTY_NETWORK_FILTER, tiers: ["Hot"], companies: ["acme"] }).map((x) => x.name)).toEqual(["1"]);
  });
  it("facet counts ignore their own facet but respect the others", () => {
    const counts = facetCounts(people, { ...EMPTY_NETWORK_FILTER, tiers: ["Hot"], markets: ["Boston"] }, "tiers");
    expect(counts.get("Hot")).toBe(2);
    expect(counts.get("Warm")).toBeUndefined();
  });
});

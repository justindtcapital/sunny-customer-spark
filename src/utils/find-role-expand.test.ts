import { describe, expect, it } from "vitest";
import {
  buildApolloAttributeQuery,
  expandFindRoleQuery,
  parseRoleTerms,
} from "./find-role-expand";

describe("buildApolloAttributeQuery", () => {
  it("keeps Supply Chain as the only title when C-Suite, VP, and Director are checked", () => {
    const res = buildApolloAttributeQuery({
      jobFunctions: ["Supply Chain"],
      jobLevels: ["C-Suite", "VP", "Director"],
    });

    expect(res.titles).toEqual(["Supply Chain"]);
    expect(res.seniorities).toEqual(["c_suite", "vp", "head", "director"]);
  });

  it("splits comma and semicolon separated role terms and removes duplicates", () => {
    expect(parseRoleTerms(["Supply Chain, Procurement; supply chain , Logistics"])).toEqual([
      "Supply Chain",
      "Procurement",
      "Logistics",
    ]);
  });

  it("uses native seniorities without injecting hardcoded titles when no role is typed", () => {
    const res = buildApolloAttributeQuery({
      jobFunctions: [],
      jobLevels: ["C-Suite", "Manager"],
    });

    expect(res.titles).toEqual([]);
    expect(res.seniorities).toEqual(["c_suite", "manager"]);
  });
});

describe("expandFindRoleQuery", () => {
  it("never injects generic executive titles or downward manager seniority into typed role terms", () => {
    const res = expandFindRoleQuery({
      titles: ["Supply Chain"],
      seniorities: ["c_suite", "vp", "director"],
    });

    expect(res.titles).toEqual(["Supply Chain"]);
    expect(res.seniorities).toEqual(["c_suite", "vp", "head", "director"]);
    expect(res.seniorities).not.toContain("manager");
  });

  it("returns empty titles and preserves selected seniorities (plus head for vp) when only seniority chips are picked", () => {
    const res = expandFindRoleQuery({
      titles: [],
      seniorities: ["vp"],
    });

    expect(res.titles).toEqual([]);
    expect(res.seniorities).toEqual(["vp", "head"]);
  });
});
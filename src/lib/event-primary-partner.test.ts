import { describe, it, expect } from "vitest";
import { plannerCategories, primaryPartnerCategory } from "./event-planner";

const cats = plannerCategories([{ partner: "AWS", row: "Partner Led Events", color: "teal" }, { partner: "AWS", row: "Briefings", color: "indigo" }]);

describe("primaryPartnerCategory", () => {
  it("ISSA as primary partner owns the ISSA category", () => {
    expect(primaryPartnerCategory("ISSA", "Other", cats)).toBe("ISSA");
  });
  it("GBI Impact owns GBI Roundtable", () => {
    expect(primaryPartnerCategory("GBI Impact", "", cats)).toBe("GBI Roundtable");
  });
  it("keeps the briefing row for a partner with categories in both rows", () => {
    expect(primaryPartnerCategory("AWS", "Other Briefings", cats)).toBe("AWS Briefings");
    expect(primaryPartnerCategory("AWS", "Other", cats)).toBe("AWS");
  });
  it("partner without its own category changes nothing", () => {
    expect(primaryPartnerCategory("Trace3", "Other", cats)).toBe("");
  });
});

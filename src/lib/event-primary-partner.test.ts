import { describe, it, expect } from "vitest";
import { categoryAfterPartnerChange, effectiveCategory, plannerCategories, primaryPartnerCategory } from "./event-planner";

const cats = plannerCategories([
  { partner: "ISSA", row: "Partner Led Events", color: "plum" },
  { partner: "AWS", row: "Partner Led Events", color: "teal" },
  { partner: "AWS", row: "Briefings", color: "indigo" },
]);
const ev = (subcategory: string, partners: string[], category = "Partner Led Events") => ({ subcategory, category, partners });

describe("primary partner owns the event's category", () => {
  it("an added partner as primary gives the event its category", () => {
    expect(primaryPartnerCategory("ISSA", "Other", cats)).toBe("ISSA");
  });
  it("keeps the briefing row for a partner with categories in both rows", () => {
    expect(primaryPartnerCategory("AWS", "Other Briefings", cats)).toBe("AWS Briefings");
    expect(primaryPartnerCategory("AWS", "Other", cats)).toBe("AWS");
  });
  it("partner without its own category changes nothing", () => {
    expect(primaryPartnerCategory("Trace3", "Other", cats)).toBe("");
  });
  it("an event already tagged with a partner shows that partner's category once the partner is added", () => {
    expect(effectiveCategory(ev("Other", ["ISSA", "Dell"]), cats).subcategory).toBe("ISSA");
  });
  it("retired GBI Roundtable / CDO Events categories show as Other", () => {
    expect(effectiveCategory(ev("GBI Roundtable", []), cats)).toEqual({ subcategory: "Other", category: "Partner Led Events" });
    expect(effectiveCategory(ev("CDO Events", ["Trace3"]), cats).subcategory).toBe("Other");
  });
  it("another partner's category falls back to Other when the primary partner has no row", () => {
    expect(effectiveCategory(ev("ISSA", ["Dell", "ISSA"]), cats).subcategory).toBe("Other");
  });
  it("events with no partner keep a valid category", () => {
    expect(effectiveCategory(ev("AWS", []), cats).subcategory).toBe("AWS");
  });
  it("DTC-led events never move because of a partner tag", () => {
    expect(categoryAfterPartnerChange(ev("DTC Event", ["ISSA"], "DTC Led Events"), cats).subcategory).toBe("DTC Event");
  });
  it("tagging a partner on an uncategorised event moves it into that partner's category", () => {
    expect(categoryAfterPartnerChange(ev("Unassigned", ["ISSA"], "Unassigned"), cats)).toEqual({ subcategory: "ISSA", category: "Partner Led Events" });
  });
});

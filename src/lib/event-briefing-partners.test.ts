import { describe, it, expect } from "vitest";
import { categoryAfterPartnerChange, effectiveCategory, nameMentionsPartner, planBriefingPartnerTags, plannerCategories, type PlannerEvent } from "./event-planner";

const cats = plannerCategories([
  { partner: "Vation", row: "Briefings", color: "amber" },
  { partner: "AWS", row: "Briefings", color: "indigo" },
]);
const ev = (subcategory: string, partners: string[], category = "Briefings") => ({ subcategory, category, partners });

describe("briefings work like partner-led events", () => {
  it("only DTC Curated Briefings and Other Briefings are fixed; Vation is an added partner", () => {
    expect(plannerCategories([]).find((c) => c.name === "Briefings")!.subcategories.map((s) => s.name)).toEqual(["DTC Curated Briefings", "Other Briefings"]);
    expect(cats.find((c) => c.name === "Briefings")!.subcategories.map((s) => s.name)).toEqual(["DTC Curated Briefings", "Vation Briefings", "AWS Briefings", "Other Briefings"]);
  });
  it("tagging Vation as primary on an Other briefing moves it to Vation Briefings", () => {
    expect(categoryAfterPartnerChange(ev("Other Briefings", ["Vation"]), cats)).toEqual({ subcategory: "Vation Briefings", category: "Briefings" });
  });
  it("old Vation Briefs rows read as Vation Briefings", () => {
    expect(effectiveCategory(ev("Vation Briefs", ["Vation"]), cats).subcategory).toBe("Vation Briefings");
  });
  it("DTC Curated Briefings never move because of a partner tag", () => {
    expect(categoryAfterPartnerChange(ev("DTC Curated Briefings", ["AWS"]), cats).subcategory).toBe("DTC Curated Briefings");
    expect(effectiveCategory(ev("DTC Curated Briefings", ["Vation"]), cats).subcategory).toBe("DTC Curated Briefings");
  });
});

const pe = (urid: string, name: string, subcategory: string, category = "Briefings", partners: string[] = []) =>
  ({ urid, name, subcategory, category, partners }) as unknown as PlannerEvent;

describe("one-time Vation tagging", () => {
  it("matches Vation as a whole word, not inside Innovation", () => {
    expect(nameMentionsPartner("Vation - Austin", "Vation")).toBe(true);
    expect(nameMentionsPartner("Vation CISO Roundtable", "Vation")).toBe(true);
    expect(nameMentionsPartner("Toronto Innovation Event", "Vation")).toBe(false);
  });
  it("tags Vation-named briefings as primary and moves mis-filed ones to Other Briefings", () => {
    const plan = planBriefingPartnerTags([
      pe("1", "Vation - Austin", "Vation Briefs"),
      pe("2", "Gartner Application Innovation Summit", "Vation Briefs"),
      pe("3", "Toronto Innovation Event w/ Arctiq", "DTC Event", "DTC Led Events"),
      pe("4", "Vation - NYC", "Vation Briefings", "Briefings", ["Vation"]),
    ], "Vation", "Vation Briefs");
    expect(plan).toEqual([
      { urid: "1", name: "Vation - Austin", partners: ["Vation"], subcategory: "Vation Briefings", category: "Briefings" },
      { urid: "2", name: "Gartner Application Innovation Summit", partners: [], subcategory: "Other Briefings", category: "Briefings" },
    ]);
  });
  it("puts Vation first while keeping other partners as participants", () => {
    const [edit] = planBriefingPartnerTags([pe("1", "Vation - SF", "Vation Briefs", "Briefings", ["AWS"])], "Vation", "Vation Briefs");
    expect(edit.partners).toEqual(["Vation", "AWS"]);
  });
});

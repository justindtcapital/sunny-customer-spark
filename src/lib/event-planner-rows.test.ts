import { describe, expect, it } from "vitest";
import {
  DTC_STATUSES, canonicalDtcStatus, canonicalSubcategory, categoryOfSubcategory, dtcStatusOf, placementRow,
  plannerCategories, plannerStatusForDtc, nextPartnerColor,
} from "./event-planner";

const ev = (dtcStatus: string, category: string) => ({ dtcStatus, status: "Potential" as const, start: "2026-12-01", end: "2026-12-01", category });

describe("DTC status names", () => {
  it("are Completed, Confirmed, Considering, Potential, Declined", () => {
    expect([...DTC_STATUSES]).toEqual(["Completed", "Confirmed", "Considering", "Potential", "Declined"]);
  });
  it("reads old Executed as Completed and Accepted as Confirmed", () => {
    expect(canonicalDtcStatus("Executed")).toBe("Completed");
    expect(canonicalDtcStatus("accepted")).toBe("Confirmed");
    expect(dtcStatusOf({ dtcStatus: "Executed", status: "Confirmed", start: "", end: "" })).toBe("Completed");
  });
  it("Completed and Confirmed are solid; Considering stays dashed", () => {
    expect(plannerStatusForDtc("Completed")).toBe("Confirmed");
    expect(plannerStatusForDtc("Confirmed")).toBe("Confirmed");
    expect(plannerStatusForDtc("Considering")).toBe("Potential");
  });
});

describe("planner rows", () => {
  it("keeps Potential events in the bottom Potential row whatever their category", () => {
    expect(placementRow(ev("Potential", "Briefings"))).toBe("Potential");
  });
  it("moves an event up into its category row once it is Considering", () => {
    expect(placementRow(ev("Considering", "Briefings"))).toBe("Briefings");
    expect(placementRow(ev("Considering", "Partner Led Events"))).toBe("Partner Led Events");
  });
  it("keeps uncategorized events in Potential", () => {
    expect(placementRow(ev("Considering", "Unassigned"))).toBe("Potential");
  });
});

describe("categories", () => {
  it("collapses both DTC-led labels into one DTC Event", () => {
    expect(canonicalSubcategory("DTC Event (No Partnership)")).toBe("DTC Event");
    expect(canonicalSubcategory("DTC Event (with Partner)")).toBe("DTC Event");
  });
  it("moves 3rd party events to Other and Sagetap pitches to Other Briefings", () => {
    expect(canonicalSubcategory("3rd Party Events")).toBe("Other");
    expect(categoryOfSubcategory("3rd Party Events")).toBe("Partner Led Events");
    expect(canonicalSubcategory("Virtual Pitches (Sagetap)")).toBe("Other Briefings");
    expect(categoryOfSubcategory("Virtual Pitches (Sagetap)")).toBe("Briefings");
  });
  it("partner-led row has only Other until partners are added", () => {
    const row = plannerCategories().find((c) => c.name === "Partner Led Events")!;
    expect(row.subcategories.map((s) => s.name)).toEqual(["Other"]);
  });
  it("an added partner gets its own colour before Other and keeps its row", () => {
    const extras = [{ partner: "Cisco", row: "Partner Led Events", color: "teal" }];
    const row = plannerCategories(extras).find((c) => c.name === "Partner Led Events")!;
    expect(row.subcategories.map((s) => s.name)).toEqual(["Cisco", "Other"]);
    expect(categoryOfSubcategory("Cisco", "Partner Led Events")).toBe("Partner Led Events");
    expect(nextPartnerColor(extras)).not.toBe("teal");
  });
  it("an added briefing partner keeps the Briefings row from its name alone", () => {
    expect(categoryOfSubcategory("Vation Briefings")).toBe("Briefings");
    expect(categoryOfSubcategory("Vation Briefs")).toBe("Briefings");
    expect(categoryOfSubcategory("ISSA", "Partner Led Events")).toBe("Partner Led Events");
  });
});

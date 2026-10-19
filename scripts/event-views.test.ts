import { describe, expect, it } from "vitest";
import { eventMatchesFilters, mergeEventAutofill, plannerEventForView, type EventFilters } from "../src/lib/event-views";
import { DEFAULT_DTC_STATUSES, DTC_STATUSES, dtcStatusOf, type PlannerEvent } from "../src/lib/event-planner";
import { teamMemberFor } from "../src/lib/user-ownership";

const event: PlannerEvent = { urid: "tracker-1", name: "CES", start: "2026-01-06", end: "2026-01-08", location: "Las Vegas", category: "DTC Partnered Events", subcategory: "3rd Party Events", status: "Declined", dtcStatus: "Declined", sectors: ["Cyber"], portcos: ["Halcyon"], partners: ["Dell"], owner: "julia.beech@dell.com", createdBy: "julia.beech@dell.com", format: "in-person", website: "", lumaUrl: "", source: "Tracker", sourceRef: "", asanaGid: "", networkCount: 12, notes: "", actionsNeeded: "", eventContact: "", updated: "" };
const filters: EventFilters = { search: "", subcategories: [], sectors: [], statuses: [], statusView: "Both", portco: "", partner: "", owner: "", source: "" };
describe("shared event view rules", () => {
  it("orders participation statuses from executed to declined", () => {
    expect(DTC_STATUSES).toEqual(["Executed", "Accepted", "Considering", "Potential", "Declined"]);
  });
  it("defaults to executed, accepted and considering only", () => {
    expect(DEFAULT_DTC_STATUSES).toEqual(["Executed", "Accepted", "Considering"]);
    const f = { ...filters, statuses: [...DEFAULT_DTC_STATUSES] };
    for (const dtcStatus of DTC_STATUSES) {
      expect(eventMatchesFilters({ ...event, dtcStatus }, f, "2026-10-19"))
        .toBe(["Executed", "Accepted", "Considering"].includes(dtcStatus));
    }
  });
  it("keeps awareness-only potential distinct from actively considering", () => {
    expect(dtcStatusOf({ ...event, dtcStatus: "Potential", status: "Potential" })).toBe("Potential");
    expect(dtcStatusOf({ ...event, dtcStatus: "Considering", status: "Potential" })).toBe("Considering");
    expect(dtcStatusOf({ ...event, dtcStatus: "", status: "Potential" })).toBe("Potential");
    expect(eventMatchesFilters({ ...event, dtcStatus: "Potential", status: "Potential" }, { ...filters, statuses: ["Potential"] }, "2026-10-19")).toBe(true);
  });
  it("shows no events when all participation statuses are unchecked", () => {
    expect(eventMatchesFilters({ ...event, dtcStatus: "Accepted", status: "Confirmed" }, filters, "2026-10-19")).toBe(false);
  });
  it("selects Declined solely through DTC Status", () => {
    expect(eventMatchesFilters(event, filters, "2026-10-19")).toBe(false);
    expect(eventMatchesFilters(event, { ...filters, statuses: ["Declined"] }, "2026-10-19")).toBe(true);
    expect(eventMatchesFilters(event, { ...filters, statuses: ["Accepted"] }, "2026-10-19")).toBe(false);
  });
  it("combines category, sector, company, partner and canonical owner filters", () => {
    const f = { ...filters, statuses: ["Declined"], subcategories: ["3rd Party Events"], sectors: ["Cyber"], portco: "Halcyon", partner: "Dell", owner: "Julia Beech" };
    expect(eventMatchesFilters(event, f, "2026-10-19")).toBe(true);
    expect(eventMatchesFilters(event, { ...f, sectors: ["Data/AI"] }, "2026-10-19")).toBe(false);
  });
  it("attributes Julia through the same identity used by the CRM", () => {
    expect(teamMemberFor(event.createdBy)?.email).toBe("julia.beech@dell.com");
    expect(teamMemberFor(event.owner)?.displayName).toBe("Julia Beech");
  });
  it("retains tracker identity in list/chart presentation", () => {
    expect(plannerEventForView(event)).toMatchObject({ gid: "tracker-1", date: "2026-01-06", attendeeCount: 12 });
  });
  it("autofill updates extracted details but preserves editable tags and identity", () => {
    const next = mergeEventAutofill(event, { name: "CES 2027", start: "2027-01-06", end: "2027-01-09", location: "Las Vegas, USA", source: "Link", notes: "" });
    expect(next).toMatchObject({ urid: "tracker-1", name: "CES 2027", start: "2027-01-06", end: "2027-01-09", portcos: ["Halcyon"], owner: "julia.beech@dell.com", source: "Tracker" });
  });
});
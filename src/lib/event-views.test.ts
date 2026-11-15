import { portfolioEventsByCompany, trackerEventAsLegacy } from "./event-views";
import { describe, expect, it } from "vitest";
import type { PlannerEvent } from "./event-planner";
const blankPlannerEventForTest = (p: Partial<PlannerEvent>): PlannerEvent => ({
  urid: "u1", name: "", start: "", end: "", location: "", category: "Briefings", subcategory: "Vation Briefings", status: "Confirmed",
  sectors: [], portcos: [], partners: [], owner: "", format: "", website: "", lumaUrl: "", source: "Tracker", sourceRef: "",
  asanaGid: "", networkCount: 0, notes: "", actionsNeeded: "", eventContact: "", createdBy: "", updated: "", dtcStatus: "", ...p,
});

describe("tracker events replace Asana events", () => {
  const base = blankPlannerEventForTest({ name: "Vation - NYC", start: "2026-10-01", portcos: ["Twine"], asanaGid: "123", dtcStatus: "Completed" });
  it("keeps the old Asana ID so existing links still match", () => {
    expect(trackerEventAsLegacy(base, "2026-11-15")?.gid).toBe("123");
  });
  it("past events read as completed, future as planned", () => {
    expect(trackerEventAsLegacy(base, "2026-11-15")?.status).toBe("completed");
    expect(trackerEventAsLegacy({ ...base, start: "2026-12-01", dtcStatus: "Confirmed" }, "2026-11-15")?.status).toBe("planned");
  });
  it("leaves out declined and potential events", () => {
    expect(trackerEventAsLegacy({ ...base, dtcStatus: "Declined" }, "2026-11-15")).toBeNull();
    expect(trackerEventAsLegacy({ ...base, dtcStatus: "Potential" }, "2026-11-15")).toBeNull();
  });
  it("lists the event under each PortCo", () => {
    const m = portfolioEventsByCompany([trackerEventAsLegacy(base, "2026-11-15")!]);
    expect(m.get("twine")?.[0]?.name).toBe("Vation - NYC");
  });
});

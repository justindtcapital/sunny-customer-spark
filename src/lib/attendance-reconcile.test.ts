import { describe, expect, it } from "vitest";
import { attendeeRowsFor, planAttendanceReconcile, type AttendanceTag } from "./attendance-reconcile";
import type { PlannerEvent } from "./event-planner";

const ev = (p: Partial<PlannerEvent>): PlannerEvent => ({
  urid: "", name: "", start: "", end: "", location: "", category: "Conferences", subcategory: "", status: "Potential",
  sectors: [], portcos: [], partners: [], owner: "", format: "", website: "", lumaUrl: "", source: "", sourceRef: "",
  asanaGid: "", networkCount: 0, notes: "", actionsNeeded: "", eventContact: "", createdBy: "", updated: "", dtcStatus: "", ...p,
});
const tag = (eventName: string, email: string, date = ""): AttendanceTag => ({ eventName, email, name: email, date, kind: "Network" });
const events = [ev({ urid: "R25", name: "RSAC 2025", start: "2025-04-28" }), ev({ urid: "R26", name: "RSAC 2026", start: "2026-04-27" }), ev({ urid: "V", name: "Vation Summit", start: "2026-09-10" })];

describe("attendance reconciliation", () => {
  it("links an exact event name as clear", () => {
    const [g] = planAttendanceReconcile([tag("Vation Summit", "a@x.com")], events, []);
    expect(g.status).toBe("clear");
    expect(g.candidates[0].urid).toBe("V");
  });
  it("uses the year in the tag to pick one of several editions", () => {
    const [g] = planAttendanceReconcile([tag("RSAC '26", "a@x.com")], events, []);
    expect(g.status).toBe("clear");
    expect(g.candidates[0].urid).toBe("R26");
  });
  it("sends a yearless, undated series name to review", () => {
    const [g] = planAttendanceReconcile([tag("RSAC", "a@x.com")], events, []);
    expect(g.status).toBe("review");
  });
  it("leaves unknown names unmatched", () => {
    expect(planAttendanceReconcile([tag("Mystery Dinner", "a@x.com")], events, [])[0].status).toBe("unmatched");
  });
  it("never adds a person already on the event", () => {
    const groups = planAttendanceReconcile([tag("Vation Summit", "a@x.com"), tag("Vation Summit", "b@x.com")], events, []);
    const rows = attendeeRowsFor(groups, { "Vation Summit": "V" }, [{ eventUrid: "V", name: "", email: "A@x.com", kind: "", status: "", date: "" }]);
    expect(rows.map((r) => r.email)).toEqual(["b@x.com"]);
  });
});

import { isMeetingTag as _m, planAttendanceReconcile as _p } from "./attendance-reconcile";
describe("events-DB-only matching", () => {
  it("drops calendar meetings and unmatched names", () => {
    expect(_m("Julia & Taylor Events Sync")).toBe(true);
    expect(_m("Coffee - catch up: Bimal G / Chris F")).toBe(true);
    const g = _p([{ email: "a@x.com", name: "A", eventName: "Coffee Meeting", date: "", kind: "" }, { email: "b@x.com", name: "B", eventName: "Random Thing", date: "", kind: "" }], [ev({ urid: "1", name: "RSA Conference", start: "2026-04-27" })], []);
    expect(g).toHaveLength(0);
  });
  it("sends informal names to review", () => {
    const g = _p([{ email: "a@x.com", name: "A", eventName: "RSA Events", date: "", kind: "" }], [ev({ urid: "1", name: "RSA Conference", start: "2026-04-27" })], []);
    expect(g[0].status).toBe("review");
    expect(g[0].candidates[0].urid).toBe("1");
  });
});

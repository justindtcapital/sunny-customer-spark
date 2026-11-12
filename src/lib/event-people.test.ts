import { describe, expect, it } from "vitest";
import type { PlannerEvent } from "./event-planner";
import { aliasHit, campaignsForEvent, eventPeople, resolveTrackerEvent, trackerPickerEvents } from "./event-people";

const ev = (over: Partial<PlannerEvent>): PlannerEvent => ({
  urid: "u1", name: "GBI Impact - CIO NYC", start: "2026-11-09", end: "2026-11-09", location: "", category: "", subcategory: "",
  status: "Confirmed", sectors: [], portcos: [], partners: [], owner: "", format: "", website: "", lumaUrl: "", source: "",
  sourceRef: "Merged event: GBI - CIO NYC - Auditoria", asanaGid: "", networkCount: 0, notes: "", actionsNeeded: "",
  eventContact: "", createdBy: "", updated: "", dtcStatus: "", ...over,
} as PlannerEvent);

const cio = ev({});
const toronto2025 = ev({ urid: "u2", name: "GBI Toronto 2025", start: "2025-04-01", sourceRef: "" });
const toronto2026 = ev({ urid: "u3", name: "GBI Toronto 2026", start: "2026-04-01", sourceRef: "" });

describe("event picker resolution", () => {
  const list = trackerPickerEvents([cio, toronto2025, toronto2026]);

  it("only resolves names that are tracker events", () => {
    expect(resolveTrackerEvent("GBI Impact - CIO NYC", list)?.urid).toBe("u1");
    expect(resolveTrackerEvent("Some typed event", list)).toBeUndefined();
  });

  it("resolves a merged (old) name to the canonical tracker event", () => {
    expect(resolveTrackerEvent("GBI - CIO NYC - Auditoria", list)?.name).toBe("GBI Impact - CIO NYC");
    expect(aliasHit(list[0], "auditoria")).toBe("GBI - CIO NYC - Auditoria");
  });

  it("never matches a different year's edition", () => {
    expect(resolveTrackerEvent("GBI Toronto 2025", list)?.urid).toBe("u2");
    expect(resolveTrackerEvent("GBI Toronto", list)).toBeUndefined();
  });
});

describe("event people", () => {
  it("includes prospects tagged under the event's merged name", () => {
    const rows = eventPeople(cio, [], [], [{ id: "t1", name: "Pat Prospect", email: "pat@x.com", eventsInvited: ["GBI - CIO NYC - Auditoria"] }]);
    expect(rows).toEqual([expect.objectContaining({ name: "Pat Prospect", kind: "Prospect", status: "Invited" })]);
  });

  it("shows tagged people missing from the CRM and keeps the strongest status", () => {
    const rows = eventPeople(
      cio,
      [{ eventUrid: "u1", name: "Ann", email: "ann@x.com", kind: "Network", status: "Invited", date: "" }],
      [{ id: "c1", name: "Ann", email: "ann@x.com", eventsAttended: ["GBI Impact - CIO NYC"] }],
      [],
      [{ email: "jason@clutch.io", curid: "", eventName: "GBI - CIO NYC - Auditoria", type: "attended" }],
    );
    expect(rows.map((r) => [r.name, r.kind, r.status])).toEqual([
      ["Ann", "Network", "Attended"],
      ["jason@clutch.io", "Not in CRM", "Attended"],
    ]);
  });
});

describe("campaigns for event", () => {
  it("matches campaigns linked by canonical or merged name only", () => {
    const cs = [{ id: "a", events: ["GBI - CIO NYC - Auditoria"] }, { id: "b", events: ["GBI Impact - CIO NYC"] }, { id: "c", events: ["Other"] }];
    expect(campaignsForEvent(cio, cs).map((c) => c.id)).toEqual(["a", "b"]);
  });
});

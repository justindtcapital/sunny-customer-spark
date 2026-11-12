import { describe, expect, it } from "vitest";
import { vicEventDetails } from "./vic-events";
import type { PlannerEvent } from "./event-planner";

const ev = { urid: "e1", name: "Vation - London", start: "2026-11-04", end: "2026-11-04", partners: [], portcos: [], sectors: [], notes: "", actionsNeeded: "" } as unknown as PlannerEvent;
const people = [
  { key: "1", name: "Ann", email: "ann@x.com", company: "", kind: "Prospect", status: "Attended" },
  { key: "2", name: "Bob", email: "bob@y.com", company: "Y", kind: "Network", status: "Invited" },
];
const dir = new Map([["ann@x.com", { title: "CISO", company: "X" }]]);

describe("vicEventDetails", () => {
  it("returns only attendees when asked for Attended, with title and company from the CRM", () => {
    const r = vicEventDetails(ev, people, dir, "Attended");
    expect(r.people).toEqual([{ name: "Ann", title: "CISO", company: "X", email: "ann@x.com", kind: "Prospect", status: "Attended" }]);
    expect(r.counts).toEqual({ Attended: 1, Invited: 1 });
  });
  it("returns everyone by default", () => {
    expect(vicEventDetails(ev, people, dir).people.map((p) => p.name)).toEqual(["Ann", "Bob"]);
  });
});

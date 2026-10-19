import { describe, expect, it } from "vitest";
import { cleanupMatch, planEventCleanup, resolveEventSectors, remapEventAttendees, eventReferenceNames } from "../src/lib/event-cleanup";
import type { PlannerEvent } from "../src/lib/event-planner";

const event = (p: Partial<PlannerEvent>): PlannerEvent => ({ urid: "k", name: "Vation - Austin", start: "2026-02-04", end: "2026-02-04", location: "", category: "Briefings", subcategory: "Vation Briefs", status: "Confirmed", sectors: [], portcos: [], partners: [], owner: "", format: "", website: "", lumaUrl: "", source: "Tracker", sourceRef: "FY2027!20", asanaGid: "", networkCount: 0, notes: "", actionsNeeded: "", eventContact: "", createdBy: "", updated: "", dtcStatus: "Executed", ...p });
const companies = [{ name: "OpenObserve", sector: "Data & Analytics", domain: "Data" }, { name: "Halcyon", sector: "Cybersecurity", domain: "Security" }, { name: "Mave", sector: "SecOps Platform", domain: "Cloud" }, { name: "Tetrate", sector: "Ai Tooling", domain: "AI" }];

describe("event cleanup", () => {
  it("merges Vation city-PortCo variants even with unrelated events on the same day", () => {
    const k = event({ sectors: ["Cyber"], portcos: ["OpenObserve"], notes: "Tracker note" });
    const l = event({ urid: "l", name: "Vation - Austin - OpenObserve", source: "Asana", asanaGid: "g1", sourceRef: "https://app.asana.com/0/0/g1", notes: "Asana note", networkCount: 12 });
    const p = planEventCleanup([k, l, event({ urid: "other", name: "Cyber Expo" })], companies);
    expect(p.replacements.get("l")).toBe("k");
    expect(p.replacements.has("other")).toBe(false);
    const merged = p.updates.get("k");
    expect(merged?.dtcStatus).toBe("Executed");
    expect(merged?.sectors).toEqual(["Data/AI"]);
    expect(merged?.notes).toContain("Tracker note");
    expect(merged?.notes).toContain("Asana note");
    expect(merged?.networkCount).toBe(12);
    expect(merged && eventReferenceNames(merged)).toContain(l.name);
  });
  it("keeps different dates and conference breakout sessions separate", () => {
    expect(cleanupMatch(event({}), event({ name: "Vation - Austin - OpenObserve", start: "2026-02-05" }))).toBe(false);
    expect(cleanupMatch(event({ name: "RSA Conference" }), event({ name: "RSA - CISO Whiskey Tasting" }))).toBe(false);
    expect(cleanupMatch(event({ name: "InnoLead Impact" }), event({ name: "InnoLead Impact Workshop" }))).toBe(false);
  });
  it("matches inverted briefing names", () => {
    expect(cleanupMatch(event({ name: "Dell FDE Briefing" }), event({ name: "Briefing - Dell FDE" }))).toBe(true);
  });
  it("uses all participating company sectors and recognizes domain-style aliases", () => {
    expect(resolveEventSectors(event({ portcos: ["Halcyon", "OpenObserve"], sectors: ["Cyber"] }), companies)).toEqual(["Cyber", "Data/AI"]);
    expect(resolveEventSectors(event({ portcos: ["Tetrate.io"], sectors: ["Cyber"] }), companies)).toEqual(["Data/AI"]);
    expect(resolveEventSectors(event({ portcos: ["Mave"], sectors: ["Data/AI"] }), companies)).toEqual(["Cyber"]);
  });
  it("categorizes CES without changing its Declined decision", () => {
    const p = planEventCleanup([event({ name: "CES", subcategory: "Unassigned", status: "Declined", dtcStatus: "Declined" })], companies);
    expect(p.updates.get("k")?.subcategory).toBe("3rd Party Events");
    expect(p.updates.get("k")?.dtcStatus).toBe("Declined");
  });
  it("remaps attendance while preserving all attendee records and states", () => {
    const rows = [{ eventUrid: "l", name: "Chris", email: "chris@example.com", kind: "Network", status: "Attended", date: "2026-02-04" }];
    expect(remapEventAttendees(rows, new Map([["l", "k"]]))).toEqual([{ ...rows[0], eventUrid: "k" }]);
  });
  it("is idempotent after applying a plan", () => {
    const rows = [event({}), event({ urid: "l", name: "Vation - Austin - OpenObserve", source: "Asana" })];
    const p = planEventCleanup(rows, companies);
    const next = rows.filter(e => !p.replacements.has(e.urid)).map(e => p.updates.get(e.urid) || e);
    expect(planEventCleanup(next, companies).replacements.size).toBe(0);
    expect(planEventCleanup(next, companies).updates.size).toBe(0);
  });
});
import { buildManualMerge } from "../src/lib/event-cleanup";
describe("manual list merge", () => {
  it("keeps the chosen record, takes picked fields, unions tags and records the merged name", () => {
    const a = event({ urid: "a", name: "Orange Briefing", sectors: ["Cyber"], dtcStatus: "Executed" });
    const b = event({ urid: "b", name: "Orange Briefing @ DTW", location: "Detroit", sectors: ["Data/AI"], dtcStatus: "Accepted", notes: "b note" });
    const m = buildManualMerge([a, b], "a", { name: "b", location: "b", dtcStatus: "a" });
    expect(m.urid).toBe("a");
    expect(m.name).toBe("Orange Briefing @ DTW");
    expect(m.location).toBe("Detroit");
    expect(m.dtcStatus).toBe("Executed");
    expect(m.sectors.sort()).toEqual(["Cyber", "Data/AI"]);
    expect(m.notes).toContain("b note");
    expect(m.sourceRef).toContain("Merged URID: b");
  });
});

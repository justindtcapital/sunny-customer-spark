import { describe, expect, it } from "vitest";
import { planHistoryLinks, newLinksOnly, normalizeEventName, type HistoryLink } from "./event-history";
import type { PlannerEvent } from "./event-planner";

const ev = (p: Partial<PlannerEvent>): PlannerEvent => ({
  urid: "", name: "", start: "", end: "", location: "", category: "Conferences", subcategory: "", status: "Potential",
  sectors: [], portcos: [], partners: [], owner: "", format: "", website: "", lumaUrl: "", source: "", sourceRef: "",
  asanaGid: "", networkCount: 0, notes: "", actionsNeeded: "", eventContact: "", createdBy: "", updated: "", dtcStatus: "", ...p,
});

const rsac27 = ev({ urid: "T1", name: "RSAC 2027", start: "2027-04-20", portcos: ["Nox"] });

describe("event history linking", () => {
  it("normalizes years and editions away", () => {
    expect(normalizeEventName("RSAC 2026 (15th edition)")).toBe("rsac");
  });

  it("links a uniquely matching past event as clear", () => {
    const { proposals } = planHistoryLinks({ targets: [rsac27], pastEvents: [ev({ urid: "P1", name: "RSAC 2026", start: "2026-04-20", portcos: ["Nox"] })], activities: [], existing: [] });
    expect(proposals[0].status).toBe("clear");
    expect(proposals[0].candidates.map((c) => c.urid)).toEqual(["T1"]);
  });

  it("sends two possible 2027 events to review", () => {
    const t2 = ev({ urid: "T2", name: "RSAC", start: "2027-05-01" });
    const { proposals } = planHistoryLinks({ targets: [rsac27, t2], pastEvents: [ev({ urid: "P1", name: "RSAC 2026", start: "2026-04-20" })], activities: [], existing: [] });
    expect(proposals[0].status).toBe("review");
  });

  it("sends conflicting PortCos to review", () => {
    const { proposals } = planHistoryLinks({ targets: [rsac27], pastEvents: [ev({ urid: "P1", name: "RSAC 2026", start: "2026-04-20", portcos: ["Arena"] })], activities: [], existing: [] });
    expect(proposals[0].status).toBe("review");
  });

  it("never auto-links generic names", () => {
    const t = ev({ urid: "T3", name: "Dinner 2027", start: "2027-03-01" });
    const { proposals } = planHistoryLinks({ targets: [t], pastEvents: [ev({ urid: "P2", name: "Dinner", start: "2026-03-01" })], activities: [], existing: [] });
    expect(proposals[0].status).toBe("review");
  });

  it("matches via earlier merged names", () => {
    const t = ev({ urid: "T4", name: "Black Hat USA 2027", start: "2027-08-01", sourceRef: "Merged event: BlackHat Vegas" });
    const { proposals } = planHistoryLinks({ targets: [t], pastEvents: [ev({ urid: "P3", name: "BlackHat Vegas 2026", start: "2026-08-01" })], activities: [], existing: [] });
    expect(proposals[0].status).toBe("clear");
  });

  it("links an activity during a past event with a shared PortCo", () => {
    const past = ev({ urid: "P1", name: "RSAC 2026", start: "2026-04-20", end: "2026-04-23", portcos: ["Nox"] });
    const act = { kind: "activity" as const, id: "A1", name: "Booth follow-up", date: "2026-04-22", portcos: ["Nox"], type: "event" };
    const { proposals } = planHistoryLinks({ targets: [rsac27], pastEvents: [past], activities: [act], existing: [] });
    expect(proposals.find((p) => p.source.id === "A1")?.status).toBe("clear");
  });

  it("ignores ordinary meetings that merely fall during a past event", () => {
    const past = ev({ urid: "P1", name: "RSAC 2026", start: "2026-04-20", end: "2026-04-23", portcos: ["Nox"] });
    const act = { kind: "activity" as const, id: "A2", name: "Pricing call", date: "2026-04-22", portcos: ["Nox"], type: "meeting" };
    const { proposals } = planHistoryLinks({ targets: [rsac27], pastEvents: [past], activities: [act], existing: [] });
    expect(proposals.find((p) => p.source.id === "A2")).toBeUndefined();
  });

  it("running again adds nothing for already-linked pairs", () => {
    const existing: HistoryLink[] = [{ targetUrid: "T1", kind: "event", sourceId: "P1", sourceName: "", sourceDate: "", portcos: [], reason: "", sourceUrl: "", linkedBy: "", linkedAt: "" }];
    const r = planHistoryLinks({ targets: [rsac27], pastEvents: [ev({ urid: "P1", name: "RSAC 2026", start: "2026-04-20" })], activities: [], existing });
    expect(r.proposals).toHaveLength(0);
    expect(r.alreadyLinked).toBe(1);
    expect(newLinksOnly([existing[0], existing[0]], existing)).toHaveLength(0);
  });
});

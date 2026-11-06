import { describe, expect, it } from "vitest";
import { canonicalEventPortcos, mergeCompanyEvents, resolveEventPortco, trackerEventsByPortco } from "./event-portcos";
import type { PlannerEvent } from "./event-planner";

const official = ["Singulr", "MavenAGI", "Mave", "Tag-N-Trac", "Twine", "Terra", "Terragrit", "Domino Data Lab", "MaxIQ", "Tetrate", "Endor Labs"];
const ev = (o: Partial<PlannerEvent>): PlannerEvent => ({
  urid: "E1", name: "CDO Roundtable", start: "2026-11-03", end: "2026-11-03", location: "", category: "", subcategory: "", status: "Confirmed",
  sectors: [], portcos: [], partners: [], owner: "", format: "", website: "", lumaUrl: "", source: "Tracker", sourceRef: "", asanaGid: "",
  networkCount: 0, notes: "", actionsNeeded: "", eventContact: "", createdBy: "", updated: "", dtcStatus: "", ...o,
});

describe("event PortCo names", () => {
  it("collapses Asana spellings onto one official company", () => {
    expect(canonicalEventPortcos(["Singulr", "MavenAGI", "Singulr AI", "Maven AGI"], official).portcos).toEqual(["Singulr", "MavenAGI"]);
    expect(canonicalEventPortcos(["Endor Labs", "Endor", "Tetrate.io"], official).portcos).toEqual(["Endor Labs", "Tetrate"]);
  });
  it("uses the approved spellings for Maven, TNT and the close matches", () => {
    expect(resolveEventPortco("Maven", official)).toBe("MavenAGI");
    expect(resolveEventPortco("TNT", official)).toBe("Tag-N-Trac");
    expect(resolveEventPortco("Twine Security", official)).toBe("Twine");
    expect(resolveEventPortco("Terra Security", official)).toBe("Terra");
    expect(resolveEventPortco("Domino", official)).toBe("Domino Data Lab");
    expect(resolveEventPortco("MaxIQ (Gyaan)", official)).toBe("MaxIQ");
  });
  it("keeps an unknown company as typed and reports it", () => {
    expect(canonicalEventPortcos(["Acme Robotics"], official)).toEqual({ portcos: ["Acme Robotics"], unresolved: ["Acme Robotics"] });
  });
  it("lists each event once on the company page and skips declined events", () => {
    const idx = trackerEventsByPortco([
      ev({ portcos: ["Singulr", "Singulr AI"] }),
      ev({ urid: "E2", status: "Declined", portcos: ["Singulr"] }),
    ], official, "2026-11-06");
    expect(idx["singulr"].map((e) => e.id)).toEqual(["tracker-E1"]);
  });
  it("drops an Asana entry already represented by the event list", () => {
    const [tracker] = trackerEventsByPortco([ev({ asanaGid: "123", portcos: ["Singulr"] })], official, "2026-11-06")["singulr"];
    const asana = [{ id: "asana-123-singulr ai", date: "2026-11-03", name: "CDO Roundtable (Asana)", type: "conference" as const }];
    expect(mergeCompanyEvents([tracker], asana).map((e) => e.id)).toEqual(["tracker-E1"]);
  });
});

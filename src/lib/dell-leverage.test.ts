import { describe, expect, it } from "vitest";
import {
  DEFAULT_DELL_FILTER, DELL_NOTES_FIELD, EXCLUDED_FIELDS, buHeatmap, companiesAtStage, companyRelationships, sanitizeDellNote, workstreamsOf, companyStageBoard, dellRowsFrom, existingOutcomes, filterDellRows, movementInWindow,
  primaryStage, productCounts, stakeholderMap, statusChangesFromLog, summarizeDell, type DellWorkstreamInput,
} from "./dell-leverage";
import type { Contact } from "./types";

const ws = (o: Partial<DellWorkstreamInput> & { gid: string }): DellWorkstreamInput => ({
  company: "Acme", name: "Dell IT", sellInStatus: "", maturity: "", category: "", dellTargets: "", dellStakeholders: "", fields: {}, completed: false, lastActivity: "2026-11-01", ...o,
});
const person = (name: string, email: string): Contact => ({ name, email, company: "Dell Technologies", title: "VP", urid: email } as unknown as Contact);

const SAMPLE = [
  ws({ gid: "a", company: "Redis", sellInStatus: "1 - Engaged /Progressing", dellTargets: "Dell - IT", dellStakeholders: "Ward Williams" }),
  ws({ gid: "b", company: "Redis", name: "Offer", maturity: "Existing - Reference Architecture / Joint Solution", dellTargets: "Dell - UDS", fields: { "Dell Products Aligned": "Dell Ai Factory, Dell UDS - Powerscale" } }),
  ws({ gid: "c", company: "Alation", sellInStatus: "1 - Engaged /Progressing", maturity: "3 - Trying to Engage", dellStakeholders: "Selene Wong" }),
  ws({ gid: "d", company: "Twine", sellInStatus: "2 - Engaged / Stalled", dellTargets: "Dell - IT", dellStakeholders: "Addy", completed: true }),
  ws({ gid: "e", company: "Akka", category: "Dell Leverage - Sell Through" }),
  ws({ gid: "f", company: "Other Co", name: "PMF work", category: "PMF / Messaging Work" }),
  ws({ gid: "g", company: "Druva", sellInStatus: "Existing - Growing", dellTargets: "Dell - ISG", fields: { "Dell Products Aligned": "Dell Ai Factory" } }),
];
const CONTACTS = [person("Ward Williams", "ward@dell.com"), person("Selene Wong", "selene@dell.com")];
const rows = dellRowsFrom(SAMPLE, { contacts: CONTACTS });

describe("dell leverage rows", () => {
  it("includes only workstreams with a Dell motion, one row per motion", () => {
    expect(rows.map((r) => r.id).sort()).toEqual(["a:Sell-In", "b:Sell-With", "c:Sell-In", "c:Sell-With", "d:Sell-In", "e:Sell-With", "g:Sell-In"]);
  });

  it("never carries DTC priorities, ROI ratings, owners or notes", () => {
    const leaked = dellRowsFrom([ws({ gid: "x", sellInStatus: "3 - Trying to Engage", fields: { "DTC Priority": "1 - Needle Mover", "Workstream Priority": "1: High - Must Do", "DTC Dell Leverage Priority": "High ROI", "DTC - Dell Leverage Opportunity": "Immediate - Active" } })]);
    const text = JSON.stringify(leaked);
    for (const f of EXCLUDED_FIELDS) expect(text).not.toContain(JSON.stringify(f));
    for (const v of ["Needle Mover", "High - Must Do", "High ROI", "Immediate - Active"]) expect(text).not.toContain(v);
    expect(Object.keys(leaked[0]!).sort()).toEqual(["bu", "company", "completed", "domain", "engagementNotes", "id", "motion", "name", "outcomes", "products", "stage", "stakeholders", "statuses", "updatedAt", "workstreamId"]);
  });

  it("Existing beats any pipeline stage; Dell Leverage category without a status is Not set", () => {
    expect(primaryStage(["3 - Trying to Engage", "Existing - Embedded in Dell Offering"])).toBe("Existing");
    expect(rows.find((r) => r.id === "e:Sell-With")!.stage).toBe("Not set");
    expect(rows.find((r) => r.id === "a:Sell-In")!.bu).toBe("Dell - IT");
    expect(rows.find((r) => r.id === "c:Sell-In")!.bu).toBe("BU not set");
  });
});

describe("dell leverage summary", () => {
  it("counts unique workstreams, active ones and the motion split", () => {
    const s = summarizeDell(rows);
    expect(s.workstreams).toBe(6);
    expect(s.active).toBe(5);
    expect(s.byMotion).toEqual({ "Sell-In": 4, "Sell-With": 3 });
    expect(s.companies).toBe(5);
    expect(s.progressing).toBe(2);
    expect(s.stalled).toBe(1);
    expect(s.stalledShare).toBeCloseTo(1 / 3);
    expect(s.existing).toBe(2);
  });

  it("stakeholder coverage counts workstreams with a linked Dell person, per motion", () => {
    const s = summarizeDell(rows);
    expect(s.coverage).toEqual({ covered: 2, named: 3, total: 6 });
    expect(s.coverageByMotion["Sell-In"]).toEqual({ covered: 2, named: 3, total: 4 });
    expect(s.coverageByMotion["Sell-With"]).toEqual({ covered: 1, named: 1, total: 3 });
    expect(s.stakeholderReach).toBe(2);
  });

  it("filters by motion, BU, stage, missing stakeholders and completed", () => {
    expect(filterDellRows(rows, { ...DEFAULT_DELL_FILTER, motion: "Sell-With" }).length).toBe(3);
    expect(filterDellRows(rows, { ...DEFAULT_DELL_FILTER, bu: "Dell - IT" }).map((r) => r.id)).toEqual(["a:Sell-In", "d:Sell-In"]);
    expect(filterDellRows(rows, { ...DEFAULT_DELL_FILTER, missingStakeholders: true }).map((r) => r.workstreamId).sort()).toEqual(["b", "d", "e", "g"]);
    expect(filterDellRows(rows, { ...DEFAULT_DELL_FILTER, includeCompleted: false }).some((r) => r.completed)).toBe(false);
    expect(filterDellRows(rows, { ...DEFAULT_DELL_FILTER, stage: "Existing" }).map((r) => r.id).sort()).toEqual(["b:Sell-With", "g:Sell-In"]);
  });

  it("filters to one company picked on the board", () => {
    expect(filterDellRows(rows, { ...DEFAULT_DELL_FILTER, company: "Redis" }).map((r) => r.id)).toEqual(["a:Sell-In", "b:Sell-With"]);
  });

  it("company board puts each company in every status it has work in, with its motions", () => {
    const board = companyStageBoard(rows);
    expect(board.map((c) => c.stage)).toEqual(["Interested / Not Engaged", "Trying to Engage", "Engaged / Stalled", "Engaged / Progressing", "Existing", "Not set"]);
    const col = (s: string) => board.find((c) => c.stage === s)!;
    expect(col("Engaged / Progressing").companies).toEqual([{ company: "Alation", motions: ["Sell-In"], workstreams: 1 }, { company: "Redis", motions: ["Sell-In"], workstreams: 1 }]);
    expect(col("Existing").companies.map((c) => c.company)).toEqual(["Druva", "Redis"]);
    expect(col("Trying to Engage").companies).toEqual([{ company: "Alation", motions: ["Sell-With"], workstreams: 1 }]);
    expect(col("Interested / Not Engaged").companies).toEqual([]);
  });

  it("BU heatmap is alphabetical with BU not set last", () => {
    expect(buHeatmap(rows).map((b) => b.bu)).toEqual(["Dell - ISG", "Dell - IT", "Dell - UDS", "BU not set"]);
    expect(buHeatmap(rows).find((b) => b.bu === "Dell - IT")!.cells["Engaged / Stalled"]).toBe(1);
  });

  it("existing outcomes split Sell-With outcomes from Sell-In account health", () => {
    const o = existingOutcomes(rows);
    expect(o.sellWith.find((x) => x.outcome.includes("Reference"))!.count).toBe(1);
    expect(o.sellIn.map((x) => [x.outcome, x.count])).toEqual([["Existing - Growing", 1], ["Existing - Static", 0], ["Existing - Concerned", 0]]);
  });

  it("stakeholder map flags BUs with workstreams nobody is linked to", () => {
    const it = stakeholderMap(rows).find((b) => b.bu === "Dell - IT")!;
    expect(it.people.map((p) => [p.name, p.linked])).toEqual([["Ward Williams", true], ["Addy", false]]);
    expect(it.gaps).toBe(1);
  });

  it("products count each workstream once", () => {
    expect(productCounts(rows)).toEqual([{ product: "Dell Ai Factory", count: 2 }, { product: "Dell UDS - Powerscale", count: 1 }]);
  });
});

describe("movement since last QBR", () => {
  const log = [
    ["At", "By", "Kind", "Record ID", "Company", "Field", "Before", "After"],
    ["2026-10-01T10:00:00Z", "x", "workstream", "a", "Redis", "Sell-In Status", "3 - Trying to Engage", "2 - Engaged / Stalled"],
    ["2026-10-20T10:00:00Z", "x", "workstream", "a", "Redis", "Sell-In Status", "2 - Engaged / Stalled", "1 - Engaged /Progressing"],
    ["2026-10-05T10:00:00Z", "x", "workstream", "d", "Twine", "Sell-In Status", "1 - Engaged /Progressing", "2 - Engaged / Stalled"],
    ["2026-10-06T10:00:00Z", "x", "workstream", "e", "Akka", "Sell With Dell Status", "", "3 - Trying to Engage"],
    ["2026-10-07T10:00:00Z", "x", "workstream", "b", "Redis", "Sell With Dell - Maturity", "Reference Architecture / Joint Solution", "Existing - Reference Architecture / Joint Solution"],
    ["2026-10-08T10:00:00Z", "x", "workstream", "g", "Druva", "Sell-In Status", "1 - Engaged /Progressing", "Not Moving Forward"],
    ["2026-10-09T10:00:00Z", "x", "workstream", "c", "Alation", "Sell-In Status", "1 - Engaged /Progressing", "3 - Trying to Engage"],
    ["2026-10-10T10:00:00Z", "x", "workstream", "c", "Alation", "Sell-In Status", "3 - Trying to Engage", "1 - Engaged /Progressing"],
    ["2026-10-11T10:00:00Z", "x", "profile", "Redis", "Redis", "Sell-In Status", "", "1 - Engaged /Progressing"],
    ["2026-10-12T10:00:00Z", "x", "workstream", "a", "Redis", "Workstream Priority", "", "1: High - Must Do"],
    ["2026-08-01T10:00:00Z", "x", "workstream", "d", "Twine", "Sell-In Status", "", "1 - Engaged /Progressing"],
  ];
  const moves = movementInWindow(statusChangesFromLog(log), rows, "2026-09-01", "2026-11-30");
  const kinds = Object.fromEntries(moves.map((m) => [`${m.workstreamId}:${m.motion}`, m.kind]));

  it("compares the value before the window's first change with the value after its last", () => {
    expect(kinds).toEqual({ "a:Sell-In": "advanced", "d:Sell-In": "slipped", "e:Sell-With": "new", "g:Sell-In": "closed" });
  });

  it("ignores renames, undone edits, company rows, other fields and changes outside the window", () => {
    expect(kinds["b:Sell-With"]).toBeUndefined();
    expect(kinds["c:Sell-In"]).toBeUndefined();
    expect(moves.length).toBe(4);
  });
});

describe("dell status and company pop-ups", () => {
  it("carries the Dell-facing engagement notes, never the internal Notes", () => {
    const r = dellRowsFrom([ws({ gid: "n", sellInStatus: "3 - Trying to Engage", fields: { [DELL_NOTES_FIELD]: "Intro call booked with Dell IT.", Notes: "internal only" } })]);
    expect(r[0]!.engagementNotes).toBe("Intro call booked with Dell IT.");
    expect(JSON.stringify(r)).not.toContain("internal only");
  });

  it("merges a workstream's Sell-In and Sell-With rows into one entry", () => {
    const c = workstreamsOf(rows.filter((r) => r.workstreamId === "c"));
    expect(c).toHaveLength(1);
    expect(c[0]!.motions.map((m) => `${m.motion}:${m.stage}`)).toEqual(["Sell-In:Engaged / Progressing", "Sell-With:Trying to Engage"]);
  });

  it("status pop-up lists each company at that status with only its workstreams there", () => {
    const at = companiesAtStage(rows, "Engaged / Progressing");
    expect(at.map((c) => c.company)).toEqual(["Alation", "Redis"]);
    expect(at.find((c) => c.company === "Redis")!.workstreams.map((w) => w.workstreamId)).toEqual(["a"]);
    expect(at.find((c) => c.company === "Redis")!.people.map((p) => p.name)).toEqual(["Ward Williams"]);
  });

  it("company pop-up groups the company's workstreams by Dell BU", () => {
    expect(companyRelationships(rows, "Redis").map((r) => [r.bu, r.workstreams.map((w) => w.workstreamId)])).toEqual([["Dell - IT", ["a"]], ["Dell - UDS", ["b"]]]);
  });

  it("drops drafted sentences naming internal priorities, ROI, investment or ownership", () => {
    expect(sanitizeDellNote("Pilot with Dell IT is live. This is a Needle Mover with High ROI for us. Next step is a joint review in Q1."))
      .toBe("Pilot with Dell IT is live. Next step is a joint review in Q1.");
    expect(sanitizeDellNote("Our investment and ownership grew.")).toBe("");
  });
});

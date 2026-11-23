import { describe, expect, it } from "vitest";
import { applyColumns, BLANK, valueCounts } from "./table-filter";

const rows = [
  { company: "Akka", owner: "Chris Falloon", status: "Stalled, Early Conversations", name: "Dell AI" },
  { company: "Sagetap", owner: "", status: "Stalled", name: "Partner program" },
  { company: "Cymulate", owner: "Julia Beech", status: "Working to Complete", name: "Dell Security" },
];
const get = (r: (typeof rows)[number], k: string) => (r as Record<string, string>)[k] || "";
const isMulti = (k: string) => k === "status";

describe("column filters on the workstreams table", () => {
  it("keeps rows whose pick-list value is ticked, matching any value of a multi-select cell", () => {
    expect(applyColumns(rows, { filters: { status: { kind: "values", values: ["Stalled"] } }, sort: null, get, isMulti }).map((r) => r.company)).toEqual(["Akka", "Sagetap"]);
  });
  it("can filter for blank cells (e.g. unassigned owner)", () => {
    expect(applyColumns(rows, { filters: { owner: { kind: "values", values: [BLANK] } }, sort: null, get }).map((r) => r.company)).toEqual(["Sagetap"]);
  });
  it("combines filters across columns and text 'contains'", () => {
    const out = applyColumns(rows, { filters: { name: { kind: "text", text: "dell" }, owner: { kind: "values", values: ["Julia Beech"] } }, sort: null, get });
    expect(out.map((r) => r.company)).toEqual(["Cymulate"]);
  });
  it("sorts up and down, with blanks always last", () => {
    expect(applyColumns(rows, { filters: {}, sort: { key: "owner", dir: 1 }, get }).map((r) => r.company)).toEqual(["Akka", "Cymulate", "Sagetap"]);
    expect(applyColumns(rows, { filters: {}, sort: { key: "owner", dir: -1 }, get }).map((r) => r.company)).toEqual(["Cymulate", "Akka", "Sagetap"]);
  });
  it("counts each value once per row for the filter list", () => {
    expect(valueCounts(rows, (r) => r.status, true)).toEqual([
      { value: "Early Conversations", count: 1 }, { value: "Stalled", count: 2 }, { value: "Working to Complete", count: 1 },
    ]);
  });
});

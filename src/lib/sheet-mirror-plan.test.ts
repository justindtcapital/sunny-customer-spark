import { describe, expect, it } from "vitest";
import { mirrorServable, parseA1, planMirrorWrite } from "./sheet-mirror-plan";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets/SHEET1";

describe("parseA1", () => {
  it("reads tab, row and column", () => {
    expect(parseA1("Contacts!I42")).toEqual({ tab: "Contacts", row: 42, col: 8 });
    expect(parseA1("'Events DB'!AA3:AC9")).toEqual({ tab: "Events DB", row: 3, col: 26 });
    expect(parseA1("Events DB!A1")).toEqual({ tab: "Events DB", row: 1, col: 0 });
    expect(parseA1("Signals")).toEqual({ tab: "Signals", row: 1, col: 0 });
    expect(parseA1("Contacts!1:1")).toEqual({ tab: "Contacts", row: 1, col: 0 });
  });
});

describe("planMirrorWrite", () => {
  it("turns a single-cell PUT into a cell edit", () => {
    const url = `${BASE}/values/${encodeURIComponent("Contacts!C5")}?valueInputOption=USER_ENTERED`;
    expect(planMirrorWrite("PUT", url, JSON.stringify({ values: [["Hot"]] }))).toEqual({
      sheet: "SHEET1", ops: [{ kind: "cells", tab: "Contacts", cells: [{ r: 5, c: 2, v: "Hot" }] }],
    });
  });

  it("turns a row write into a block put at its column", () => {
    const url = `${BASE}/values/${encodeURIComponent("Events DB!B7")}?valueInputOption=RAW`;
    expect(planMirrorWrite("PUT", url, { values: [["a", "b"]] })?.ops).toEqual([{ kind: "put", tab: "Events DB", row: 7, col: 1, rows: [["a", "b"]] }]);
  });

  it("groups batchUpdate single cells per tab", () => {
    const body = { valueInputOption: "RAW", data: [
      { range: "Contacts!A2", values: [["x"]] }, { range: "Contacts!B9", values: [["y"]] }, { range: "Notes!A1", values: [["h1", "h2"]] },
    ] };
    const plan = planMirrorWrite("POST", `${BASE}/values:batchUpdate`, JSON.stringify(body));
    expect(plan?.ops).toContainEqual({ kind: "cells", tab: "Contacts", cells: [{ r: 2, c: 0, v: "x" }, { r: 9, c: 1, v: "y" }] });
    expect(plan?.ops).toContainEqual({ kind: "put", tab: "Notes", row: 1, col: 0, rows: [["h1", "h2"]] });
  });

  it("places appends where Google says it put them", () => {
    const url = `${BASE}/values/${encodeURIComponent("Contacts")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    const plan = planMirrorWrite("POST", url, { values: [["a"], ["b"]] }, { updates: { updatedRange: "Contacts!A1057:A1058" } });
    expect(plan?.ops).toEqual([{ kind: "append", tab: "Contacts", row: 1057, rows: [["a"], ["b"]] }]);
  });

  it("re-reads a tab when rows are deleted or the change can't be copied exactly", () => {
    const del = planMirrorWrite("POST", `${BASE}:batchUpdate`, { requests: [{ deleteDimension: {} }] }, undefined, "Contacts");
    expect(del?.ops).toEqual([{ kind: "stale", tab: "Contacts" }]);
    const unknown = planMirrorWrite("POST", `${BASE}:batchUpdate`, { requests: [{ insertDimension: {} }] });
    expect(unknown?.ops).toEqual([{ kind: "stale", tab: null }]);
    const clear = planMirrorWrite("POST", `${BASE}/values/${encodeURIComponent("Signals!A2:Z")}:clear`, {});
    expect(clear?.ops).toEqual([{ kind: "stale", tab: "Signals" }]);
  });

  it("leaves the copy alone when only a new tab is added", () => {
    expect(planMirrorWrite("POST", `${BASE}:batchUpdate`, { requests: [{ addSheet: { properties: { title: "X" } } }] })?.ops).toEqual([]);
  });
});

describe("mirrorServable", () => {
  const now = Date.parse("2026-11-23T16:00:00Z");
  it("serves a current copy and refuses stale or old ones", () => {
    expect(mirrorServable({ stale: false, synced_at: "2026-11-23T15:50:00Z" }, now, 20 * 60_000)).toBe(true);
    expect(mirrorServable({ stale: true, synced_at: "2026-11-23T15:59:00Z" }, now, 20 * 60_000)).toBe(false);
    expect(mirrorServable({ stale: false, synced_at: "2026-11-23T15:30:00Z" }, now, 20 * 60_000)).toBe(false);
    expect(mirrorServable(null, now, 20 * 60_000)).toBe(false);
  });
});

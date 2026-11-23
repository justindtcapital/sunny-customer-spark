import { describe, it, expect } from "vitest";
import { SWD_STATUS_OPTIONS, normalizeSellWithDell, sellWithDellStatusFrom } from "./sell-with-dell-status";
import { WORKSTREAM_FIELD_DEFS } from "./portco-fields-schema";

describe("Sell With Dell Status", () => {
  it("replaces the maturity column on workstreams with the same Sell-In choices plus Existing outcomes", () => {
    const names = WORKSTREAM_FIELD_DEFS.map((d) => d.name);
    expect(names).toContain("Sell With Dell Status");
    expect(names).not.toContain("Sell With Dell - Maturity");
    const sellIn = WORKSTREAM_FIELD_DEFS.find((d) => d.name === "Sell-In Status")!.options!;
    for (const o of sellIn) expect(SWD_STATUS_OPTIONS).toContain(o);
  });
  it("lists the 1/2/3 progress choices first and every Existing choice at the bottom", () => {
    expect(SWD_STATUS_OPTIONS.slice(0, 3)).toEqual(["1 - Engaged /Progressing", "2 - Engaged / Stalled", "3 - Trying to Engage"]);
    const firstExisting = SWD_STATUS_OPTIONS.findIndex((o) => o.startsWith("Existing - "));
    expect(SWD_STATUS_OPTIONS.slice(firstExisting).every((o) => o.startsWith("Existing - "))).toBe(true);
    expect(SWD_STATUS_OPTIONS).toContain("Existing - Embedded in Dell Offering");
    expect(SWD_STATUS_OPTIONS).toContain("Existing - On Dell Paper / Revenue Generating");
    expect(SWD_STATUS_OPTIONS).toContain("Existing - Reference Architecture / Joint Solution");
    expect(SWD_STATUS_OPTIONS).toContain("Existing - DTC Partner");
  });
  it("carries old maturity values over to the new status", () => {
    expect(sellWithDellStatusFrom("Embedded in Dell Offering")).toBe("Existing - Embedded in Dell Offering");
    expect(sellWithDellStatusFrom("On Dell Paper / Revenue Generating")).toBe("Existing - On Dell Paper / Revenue Generating");
    expect(sellWithDellStatusFrom("Preliminary Discussions")).toBe("3 - Trying to Engage");
    expect(sellWithDellStatusFrom("2 - Engaged / Stalled")).toBe("2 - Engaged / Stalled");
  });
  it("renames the sheet column in place and rewrites only legacy cells", () => {
    const out = normalizeSellWithDell(["Name", "Sell With Dell - Maturity"], [
      { row: 2, cells: { Name: "A", "Sell With Dell - Maturity": "Embedded in Dell Offering" } },
      { row: 3, cells: { Name: "B", "Sell With Dell - Maturity": "" } },
    ]);
    expect(out.headers).toEqual(["Name", "Sell With Dell Status"]);
    expect(out.items[0]!.cells["Sell With Dell Status"]).toBe("Existing - Embedded in Dell Offering");
    expect(out.migration).toEqual({ column: 1, cells: [{ row: 2, before: "Embedded in Dell Offering", after: "Existing - Embedded in Dell Offering" }] });
  });
  it("needs no rewrite once the sheet already uses the new column", () => {
    expect(normalizeSellWithDell(["Sell With Dell Status"], [{ row: 2, cells: { "Sell With Dell Status": "3 - Trying to Engage" } }]).migration).toBeNull();
  });
});

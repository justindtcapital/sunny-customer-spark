import { describe, it, expect } from "vitest";
import { SWD_STATUS_OPTIONS, normalizeSellWithDell, sellWithDellStatusFrom } from "./sell-with-dell-status";
import { WORKSTREAM_FIELD_DEFS, storedValueFor } from "./portco-fields-schema";

const swd = () => WORKSTREAM_FIELD_DEFS.find((d) => d.name === "Sell With Dell Status")!;

describe("Sell With Dell Status", () => {
  it("is the only Sell With Dell field on workstreams", () => {
    const names = WORKSTREAM_FIELD_DEFS.map((d) => d.name);
    expect(names.filter((n) => /sell with dell/i.test(n))).toEqual(["Sell With Dell Status"]);
  });
  it("allows several choices at once", () => {
    expect(swd().type).toBe("multi_enum");
    expect(storedValueFor(swd(), ["2 - Engaged / Stalled", "Existing - Embedded in Dell Offering"])).toBe("2 - Engaged / Stalled, Existing - Embedded in Dell Offering");
  });
  it("offers the Sell-In choices first and the Existing choices at the bottom, without DTC Partner", () => {
    const sellIn = WORKSTREAM_FIELD_DEFS.find((d) => d.name === "Sell-In Status")!.options!;
    for (const o of sellIn) expect(SWD_STATUS_OPTIONS).toContain(o);
    expect(SWD_STATUS_OPTIONS.slice(0, 3)).toEqual(["1 - Engaged /Progressing", "2 - Engaged / Stalled", "3 - Trying to Engage"]);
    const firstExisting = SWD_STATUS_OPTIONS.findIndex((o) => o.startsWith("Existing - "));
    expect(SWD_STATUS_OPTIONS.slice(firstExisting)).toEqual([
      "Existing - Embedded in Dell Offering",
      "Existing - On Dell Paper / Revenue Generating",
      "Existing - Reference Architecture / Joint Solution",
      "Existing - Services Enabled / Dell Delivered",
    ]);
    expect(SWD_STATUS_OPTIONS.some((o) => /dtc partner/i.test(o))).toBe(false);
  });
  it("maps old maturity values, including inside a list", () => {
    expect(sellWithDellStatusFrom("Embedded in Dell Offering")).toBe("Existing - Embedded in Dell Offering");
    expect(sellWithDellStatusFrom("Preliminary Discussions")).toBe("3 - Trying to Engage");
    expect(sellWithDellStatusFrom("None: Field Collaboration Only")).toBe("Interested / Not Engaged");
    expect(sellWithDellStatusFrom("Formally Engaged, 1 - Engaged /Progressing")).toBe("1 - Engaged /Progressing");
  });
  it("still reads an old column name as the new field", () => {
    const out = normalizeSellWithDell(["Name", "Sell With Dell - Maturity"], [{ row: 2, cells: { Name: "A", "Sell With Dell - Maturity": "Embedded in Dell Offering" } }]);
    expect(out.headers).toEqual(["Name", "Sell With Dell Status"]);
    expect(out.items[0]!.cells["Sell With Dell Status"]).toBe("Existing - Embedded in Dell Offering");
    expect("Sell With Dell - Maturity" in out.items[0]!.cells).toBe(false);
  });
});

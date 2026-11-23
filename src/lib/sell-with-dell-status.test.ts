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

import { PROFILE_FIELD_DEFS } from "./portco-fields-schema";
import { applyStatusEdit, companyStatusAfterWorkstreamEdit, effectiveCompanyStatus, mergeStatuses, workstreamStatusesAfterCompanyEdit } from "./sell-with-dell-status";

const TRY = "3 - Trying to Engage";
const REF = "Existing - Reference Architecture / Joint Solution";
const EMB = "Existing - Embedded in Dell Offering";

describe("Sell With Dell Status on companies and workstreams", () => {
  it("company profiles use the same multi-choice field and choices as workstreams", () => {
    const company = PROFILE_FIELD_DEFS.filter((d) => /sell with dell/i.test(d.name));
    expect(company.map((d) => d.name)).toEqual(["Sell With Dell Status"]);
    expect(company[0]!.type).toBe("multi_enum");
    expect(company[0]!.options).toEqual(SWD_STATUS_OPTIONS);
  });
  it("a company shows every status its workstreams carry, plus its own (old names mapped)", () => {
    expect(effectiveCompanyStatus("Reference Architecture / Joint Solution", [TRY, ""])).toBe(`${TRY}, ${REF}`);
  });
  it("adding a status on a workstream adds it to the company", () => {
    expect(companyStatusAfterWorkstreamEdit({ company: "", before: "", after: TRY, otherWorkstreams: [] })).toBe(TRY);
  });
  it("removing a status on a workstream removes it from the company only if no other workstream has it", () => {
    expect(companyStatusAfterWorkstreamEdit({ company: `${TRY}, ${EMB}`, before: EMB, after: "", otherWorkstreams: [TRY] })).toBe(TRY);
    expect(companyStatusAfterWorkstreamEdit({ company: `${TRY}, ${EMB}`, before: EMB, after: "", otherWorkstreams: [EMB] })).toBe(`${TRY}, ${EMB}`);
  });
  it("a company-wide status not on any workstream survives workstream edits", () => {
    expect(companyStatusAfterWorkstreamEdit({ company: REF, before: "", after: TRY, otherWorkstreams: [] })).toBe(`${TRY}, ${REF}`);
  });
  it("removing a status on the company removes it from every workstream that has it", () => {
    expect(workstreamStatusesAfterCompanyEdit(`${TRY}, ${EMB}`, TRY, [EMB, `${TRY}, ${EMB}`, TRY])).toEqual(["", TRY, TRY]);
  });
  it("a company edit merges onto statuses added since the editor opened", () => {
    expect(applyStatusEdit(`${TRY}, ${EMB}`, [TRY], [TRY, REF])).toBe(`${TRY}, ${EMB}, ${REF}`);
    expect(applyStatusEdit(`${TRY}, ${EMB}`, [TRY], [])).toBe(EMB);
  });
  it("lists statuses once, in choice order", () => {
    expect(mergeStatuses(`${EMB}, ${TRY}`, TRY)).toBe(`${TRY}, ${EMB}`);
  });
});

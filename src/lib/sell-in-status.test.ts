import { describe, it, expect } from "vitest";
import { SELL_IN_FIELD, SELL_IN_OPTIONS, sellInStatusFrom, sellInSync } from "./sell-in-status";
import { PROFILE_FIELD_DEFS, WORKSTREAM_FIELD_DEFS, storedValueFor } from "./portco-fields-schema";

const onWorkstream = () => WORKSTREAM_FIELD_DEFS.find((d) => d.name === SELL_IN_FIELD)!;
const onCompany = () => PROFILE_FIELD_DEFS.find((d) => d.name === SELL_IN_FIELD)!;
const PROG = "4 - Engaged / Progressing";
const WORK = "2 - Working to Engage";
const GROW = "7 - Existing - Growing";

describe("Sell-In Status choices", () => {
  it("lists the seven numbered choices in Chris's order: four stages, then Existing - New / Static / Growing", () => {
    expect(SELL_IN_OPTIONS).toEqual([
      "1 - Interested",
      "2 - Working to Engage",
      "3 - Engaged / Stalled",
      "4 - Engaged / Progressing",
      "5 - Existing - New",
      "6 - Existing - Static",
      "7 - Existing - Growing",
    ]);
  });
  it("old and unnumbered wording reads as the numbered choices", () => {
    expect(sellInStatusFrom("1 - Engaged /Progressing")).toBe(PROG);
    expect(sellInStatusFrom("Engaged / Progressing")).toBe(PROG);
    expect(sellInStatusFrom("2 - Engaged / Stalled")).toBe("3 - Engaged / Stalled");
    expect(sellInStatusFrom("3 - Trying to Engage")).toBe(WORK);
    expect(sellInStatusFrom("Interested / Not Engaged")).toBe("1 - Interested");
    expect(sellInStatusFrom("Interested")).toBe("1 - Interested");
    expect(sellInStatusFrom("Existing – Growing")).toBe(GROW);
  });
  it("a workstream takes one choice", () => {
    expect(onWorkstream().type).toBe("enum");
    expect(storedValueFor(onWorkstream(), GROW)).toBe(GROW);
    expect(() => storedValueFor(onWorkstream(), [PROG, GROW])).toThrow(/one choice/);
  });
  it("a company holds every stage its workstreams are at, with the same choices", () => {
    expect(onCompany().type).toBe("multi_enum");
    expect(onCompany().options).toEqual(SELL_IN_OPTIONS);
    expect(storedValueFor(onCompany(), [PROG, GROW])).toBe(`${PROG}, ${GROW}`);
  });
});

describe("Sell-In Status company ↔ workstream sync", () => {
  it("the company shows each workstream's stage once, in choice order", () => {
    expect(sellInSync.effectiveCompanyStatus("", [GROW, WORK, PROG, PROG])).toBe(`${WORK}, ${PROG}, ${GROW}`);
  });
  it("old wording on the company merges with the new wording on workstreams", () => {
    expect(sellInSync.effectiveCompanyStatus("3 - Trying to Engage", [WORK])).toBe(WORK);
  });
  it("changing a workstream's stage moves the company off the old one unless another workstream is still there", () => {
    expect(sellInSync.companyStatusAfterWorkstreamEdit({ company: `${PROG}, ${WORK}`, before: WORK, after: GROW, otherWorkstreams: [PROG] })).toBe(`${PROG}, ${GROW}`);
    expect(sellInSync.companyStatusAfterWorkstreamEdit({ company: `${PROG}, ${WORK}`, before: WORK, after: GROW, otherWorkstreams: [WORK] })).toBe(`${WORK}, ${PROG}, ${GROW}`);
  });
  it("removing a stage on the company clears it from workstreams at that stage", () => {
    expect(sellInSync.workstreamStatusesAfterCompanyEdit(`${PROG}, ${GROW}`, PROG, [GROW, PROG])).toEqual(["", PROG]);
  });
  it("a company-wide stage with no workstream survives workstream edits", () => {
    expect(sellInSync.companyStatusAfterWorkstreamEdit({ company: GROW, before: "", after: WORK, otherWorkstreams: [] })).toBe(`${WORK}, ${GROW}`);
  });
});

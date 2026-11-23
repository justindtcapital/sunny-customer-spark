import { describe, it, expect } from "vitest";
import { SELL_IN_FIELD, SELL_IN_OPTIONS, sellInSync } from "./sell-in-status";
import { PROFILE_FIELD_DEFS, WORKSTREAM_FIELD_DEFS, storedValueFor } from "./portco-fields-schema";

const onWorkstream = () => WORKSTREAM_FIELD_DEFS.find((d) => d.name === SELL_IN_FIELD)!;
const onCompany = () => PROFILE_FIELD_DEFS.find((d) => d.name === SELL_IN_FIELD)!;
const PROG = "1 - Engaged /Progressing";
const TRY = "3 - Trying to Engage";
const GROW = "Existing - Growing";

describe("Sell-In Status choices", () => {
  it("lists the pipeline stages first, then Existing - Growing / Static / Concerned at the bottom", () => {
    expect(SELL_IN_OPTIONS).toEqual([
      "1 - Engaged /Progressing",
      "2 - Engaged / Stalled",
      "3 - Trying to Engage",
      "Interested / Not Engaged",
      "Not Moving Forward",
      "Existing - Growing",
      "Existing - Static",
      "Existing - Concerned",
    ]);
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
    expect(sellInSync.effectiveCompanyStatus("", [GROW, TRY, PROG, PROG])).toBe(`${PROG}, ${TRY}, ${GROW}`);
  });
  it("changing a workstream's stage moves the company off the old one unless another workstream is still there", () => {
    expect(sellInSync.companyStatusAfterWorkstreamEdit({ company: `${PROG}, ${TRY}`, before: TRY, after: GROW, otherWorkstreams: [PROG] })).toBe(`${PROG}, ${GROW}`);
    expect(sellInSync.companyStatusAfterWorkstreamEdit({ company: `${PROG}, ${TRY}`, before: TRY, after: GROW, otherWorkstreams: [TRY] })).toBe(`${PROG}, ${TRY}, ${GROW}`);
  });
  it("removing a stage on the company clears it from workstreams at that stage", () => {
    expect(sellInSync.workstreamStatusesAfterCompanyEdit(`${PROG}, ${GROW}`, PROG, [GROW, PROG])).toEqual(["", PROG]);
  });
  it("a company-wide stage with no workstream survives workstream edits", () => {
    expect(sellInSync.companyStatusAfterWorkstreamEdit({ company: GROW, before: "", after: TRY, otherWorkstreams: [] })).toBe(`${TRY}, ${GROW}`);
  });
});

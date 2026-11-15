import { describe, it, expect } from "vitest";
import { PROFILE_FIELD_DEFS, WORKSTREAM_FIELD_DEFS, planRowEdit, storedOwner, storedValueFor } from "./portco-fields-schema";

const def = (name: string) => [...PROFILE_FIELD_DEFS, ...WORKSTREAM_FIELD_DEFS].find((d) => d.name === name)!;

describe("PortCo field edits", () => {
  it("Lead Investor accepts only the fixed investor list", () => {
    expect(storedValueFor(def("Lead Investor"), "Scott")).toBe("Scott");
    expect(() => storedValueFor(def("Lead Investor"), "Bob")).toThrow();
  });
  it("owners must be on the Venture Pulse team and are stored by full name", () => {
    expect(storedOwner("julia")).toBe("Julia Beech");
    expect(() => storedOwner("Random Person")).toThrow();
  });
  it("refuses an edit when someone changed the field since it was opened", () => {
    expect(() => planRowEdit({ "DTC Priority": "2 - Nurture" }, [{ field: "DTC Priority", original: "1 - Needle Mover", value: "3 - Back-Burner" }], PROFILE_FIELD_DEFS)).toThrow(/changed by someone else/);
  });
  it("writes only cells that actually change", () => {
    const plan = planRowEdit({ "Company Stage": "Seed", "DTC Priority": "2 - Nurture" }, [
      { field: "Company Stage", original: "Seed", value: "Series A" },
      { field: "DTC Priority", original: "2 - Nurture", value: "2 - Nurture" },
    ], PROFILE_FIELD_DEFS);
    expect(plan).toEqual([{ field: "Company Stage", before: "Seed", after: "Series A" }]);
  });
  it("Dell Leverage - Sell Through is not a workstream status", () => {
    expect(() => storedValueFor(def("Workstream Status"), ["Stalled", "Dell Leverage - Sell Through"])).toThrow();
  });
});

describe("multi-choice profile edits sent as one string", () => {
  it("splits a comma-separated Dell Channel Aligned value into its choices", () => {
    const d = PROFILE_FIELD_DEFS.find((x) => x.name === "Dell Channel Aligned")!;
    expect(storedValueFor(d, "Dell OEM, Dell CSS")).toBe("Dell OEM, Dell CSS");
    expect(() => storedValueFor(d, "Dell OEM, Dell Bogus")).toThrow();
  });
});

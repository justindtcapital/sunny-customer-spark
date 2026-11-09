import { describe, expect, it } from "vitest";
import { parseVicSources, vicSourceInstructions } from "./vic-sources";

describe("V.I.C. external databases", () => {
  it("accepts only Apollo and Sumble", () => {
    expect(parseVicSources(["sumble", "apollo", "evil", 3])).toEqual(["apollo", "sumble"]);
    expect(parseVicSources("apollo")).toEqual([]);
  });
  it("adds no instruction when nothing is ticked", () => {
    expect(vicSourceInstructions([])).toBe("");
    expect(vicSourceInstructions(["apollo"])).toContain("apolloPeopleSearch");
  });
});

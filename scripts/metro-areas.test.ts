import { describe, expect, it } from "vitest";
import { expandLocations, metroLabel } from "../src/lib/metro-areas";

describe("metro expansion", () => {
  it("San Francisco includes Oakland and San Jose", () => {
    const out = expandLocations(["San Francisco"]);
    expect(out).toContain("Oakland, California, United States");
    expect(out).toContain("San Jose, California, United States");
  });
  it("aliases resolve", () => {
    expect(metroLabel("Bay Area")).toBe("San Francisco Bay Area");
    expect(metroLabel("NYC")).toBe("New York Metro");
  });
  it("unknown places pass through", () => {
    expect(expandLocations(["Toronto, Canada"])).toEqual(["Toronto, Canada"]);
  });
});

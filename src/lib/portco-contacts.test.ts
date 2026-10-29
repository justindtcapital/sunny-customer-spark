import { describe, expect, it } from "vitest";
import { isPortCoContact, matchesTemperatureFilter, portcoKeys } from "./portco-contacts";

const keys = portcoKeys(["MavenAGI", "Skan AI", "Mosaic OS"]);

describe("PortCo contacts", () => {
  it("matches people at a PortCo by company name variants", () => {
    expect(isPortCoContact({ company: "Maven AGI", sector: "" }, keys)).toBe(true);
    expect(isPortCoContact({ company: "Skan", sector: "" }, keys)).toBe(true);
  });
  it("matches the legacy Portfolio sector", () => {
    expect(isPortCoContact({ company: "Anything", sector: "Portfolio" }, keys)).toBe(true);
  });
  it("does not match other companies", () => {
    expect(isPortCoContact({ company: "Dell", sector: "" }, keys)).toBe(false);
  });
  it("PortCo people never match Hot/Warm/Cold/Council filters", () => {
    expect(matchesTemperatureFilter({ temperature: "Hot", portco: true }, ["Hot"])).toBe(false);
    expect(matchesTemperatureFilter({ temperature: "Hot", portco: true }, ["PortCo"])).toBe(true);
    expect(matchesTemperatureFilter({ temperature: "Hot" }, ["Hot"])).toBe(true);
  });
});

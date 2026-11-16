import { describe, it, expect } from "vitest";
import { DEFAULT_VISIBLE_TIERS, contactTier, toggleTier, tierVisible } from "./network-tiers";

describe("network tier toggles", () => {
  it("opens with Council through Cold on and prospects off", () => {
    expect(DEFAULT_VISIBLE_TIERS).toEqual(["Council", "Hot", "Warm", "Cold"]);
    expect(tierVisible({ temperature: "Cold", prospect: true }, DEFAULT_VISIBLE_TIERS)).toBe(false);
  });
  it("toggles any tier independently", () => {
    const on = toggleTier(DEFAULT_VISIBLE_TIERS, "Prospect");
    expect(tierVisible({ temperature: "Cold", prospect: true }, on)).toBe(true);
    const noWarm = toggleTier(on, "Warm");
    expect(tierVisible({ temperature: "Warm" }, noWarm)).toBe(false);
    expect(tierVisible({ temperature: "Hot" }, noWarm)).toBe(true);
  });
  it("PortCo people sit in no tier, even with a saved Council rating", () => {
    expect(contactTier({ temperature: "Council", kind: "PortCo" })).toBeNull();
    expect(contactTier({ temperature: "Council", kind: "Network" })).toBe("Council");
    expect(contactTier({ temperature: "Council", kind: "Dell" })).toBe("Council");
  });
  it("PortCo people stay listed whatever tiers are switched on", () => {
    expect(tierVisible({ temperature: "Council", kind: "PortCo" }, ["Cold"])).toBe(true);
  });
});

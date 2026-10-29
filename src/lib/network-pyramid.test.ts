import { describe, expect, it } from "vitest";
import { classifyMovement, dotBreakdown, marketFor, movementKpis, primaryDomainFor } from "./network-pyramid";
import { nextRelationshipLevel } from "./relationship-rating";

describe("network pyramid", () => {
  it("draws 189 as 3×50, 3×10, 1×5, 4×1", () => {
    expect(dotBreakdown(189).map((d) => d.count)).toEqual([3, 3, 1, 4]);
  });
  it("rolls New Jersey and NY state into New York", () => {
    expect(marketFor("Hoboken, New Jersey")).toBe("New York");
    expect(marketFor("Albany, NY")).toBe("New York");
  });
  it("rolls Palo Alto, San Jose and Menlo Park into San Francisco", () => {
    expect(["Palo Alto, CA", "San Jose", "Menlo Park, California"].map(marketFor)).toEqual(["San Francisco", "San Francisco", "San Francisco"]);
  });
  it("puts Austin in Austin but Dallas in Other US", () => {
    expect(marketFor("Austin, TX")).toBe("Austin");
    expect(marketFor("Dallas, Texas")).toBe("Other US");
  });
  it("splits Europe, other international and unknown", () => {
    expect(marketFor("London, UK")).toBe("Europe");
    expect(marketFor("Toronto, Canada")).toBe("Other International");
    expect(marketFor("")).toBe("Unknown");
  });
  it("uses one primary domain: explicit approved value first, then first matching area", () => {
    expect(primaryDomainFor("Logistics", ["AI"])).toBe("Logistics");
    expect(primaryDomainFor("", ["Cybersecurity", "Data"])).toBe("Security");
    expect(primaryDomainFor("", ["Fintech"])).toBe("Other");
  });
  it("classifies promotions, demotions, adds and removals", () => {
    expect(classifyMovement({ from: "Hot", to: "Council" })?.kind).toBe("promoted");
    expect(classifyMovement({ from: "Cold", to: "Prospecting" })?.kind).toBe("demoted");
    expect(classifyMovement({ from: "", to: "Cold" })?.kind).toBe("added");
    expect(classifyMovement({ from: "Warm", to: "Removed" })?.kind).toBe("removed");
  });
  it("counts trailing 30-day movement and dedupes added people", () => {
    const now = Date.parse("2026-10-29T00:00:00Z");
    const k = movementKpis(
      [
        { ts: "2026-10-20", email: "a@x.com", from: "Warm", to: "Hot" },
        { ts: "2026-10-21", email: "b@x.com", from: "", to: "Cold" },
        { ts: "2026-01-01", email: "c@x.com", from: "Hot", to: "Warm" },
      ],
      [{ email: "b@x.com", tier: "Cold", dateAdded: "2026-10-21" }, { email: "d@x.com", tier: "Cold", dateAdded: "2026-10-25" }],
      30, now,
    );
    expect(k.Hot.promotedIn).toBe(1);
    expect(k.Cold.added).toBe(2);
    expect(k.Hot.demotedOut).toBe(0);
  });
  it("Council sits above Hot for promote and demote", () => {
    expect(nextRelationshipLevel("Hot", "promote")).toBe("Council");
    expect(nextRelationshipLevel("Council", "demote")).toBe("Hot");
  });
});

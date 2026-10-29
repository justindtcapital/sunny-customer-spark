import { describe, expect, it } from "vitest";
import { nextRelationshipLevel } from "../src/lib/relationship-rating";

describe("manual bulk relationship ladder", () => {
  it("demotes Hot to Warm", () => expect(nextRelationshipLevel("Hot", "demote")).toBe("Warm"));
  it("demotes Warm to Cold", () => expect(nextRelationshipLevel("Warm", "demote")).toBe("Cold"));
  it("demotes Cold to Prospecting", () => expect(nextRelationshipLevel("Cold", "demote")).toBe("Prospecting"));
  it("promotes Cold to Warm", () => expect(nextRelationshipLevel("Cold", "promote")).toBe("Warm"));
  it("promotes Warm to Hot", () => expect(nextRelationshipLevel("Warm", "promote")).toBe("Hot"));
  it("promotes Hot to Council", () => expect(nextRelationshipLevel("Hot", "promote")).toBe("Council"));
  it("demotes Council to Hot", () => expect(nextRelationshipLevel("Council", "demote")).toBe("Hot"));
  it("blocks promotion above Council", () => expect(nextRelationshipLevel("Council", "promote")).toBeNull());
  it("allows direct transfer to Prospecting", () => expect(nextRelationshipLevel("Hot", "prospecting")).toBe("Prospecting"));
});
import { describe, expect, it } from "vitest";
import { nextRelationshipLevel } from "./relationship-rating";

describe("Prospect ↔ Cold moves", () => {
  it("promoting a Prospect puts them in the Network as Cold", () => {
    expect(nextRelationshipLevel("Prospect", "promote")).toBe("Cold");
  });
  it("demoting Cold moves them to Prospecting", () => {
    expect(nextRelationshipLevel("Cold", "demote")).toBe("Prospecting");
  });
  it("demoting a Prospect keeps them in Prospecting", () => {
    expect(nextRelationshipLevel("Prospect", "demote")).toBe("Prospecting");
  });
});

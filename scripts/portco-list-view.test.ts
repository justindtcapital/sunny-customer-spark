import { describe, expect, it } from "vitest";
import { matchesListFilter, priorityAbbrev } from "../src/lib/portco-list-view";

describe("priorityAbbrev", () => {
  it("abbreviates numbered priorities", () => {
    expect(priorityAbbrev("1 - Needle Mover")).toBe("NM");
    expect(priorityAbbrev("Back Burner")).toBe("BB");
    expect(priorityAbbrev("Nurture")).toBe("NU");
    expect(priorityAbbrev("")).toBe("");
  });
});

describe("matchesListFilter", () => {
  const c = { domain: "AI", priority: "1 - Needle Mover" };
  it("filters by domain and cleaned priority", () => {
    expect(matchesListFilter(c, { domain: "all", priority: "all" })).toBe(true);
    expect(matchesListFilter(c, { domain: "AI", priority: "Needle Mover" })).toBe(true);
    expect(matchesListFilter(c, { domain: "Data", priority: "all" })).toBe(false);
    expect(matchesListFilter(c, { domain: "all", priority: "Back Burner" })).toBe(false);
  });
});

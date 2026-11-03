import { describe, expect, it } from "vitest";
import { matchesListFilter, priorityAbbrev, priorityChip } from "../src/lib/portco-list-view";

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
    expect(matchesListFilter(c, { domain: "AI", priority: "NM" })).toBe(true);
    expect(matchesListFilter(c, { domain: "Data", priority: "all" })).toBe(false);
    expect(matchesListFilter(c, { domain: "all", priority: "BB" })).toBe(false);
  });
});

describe("priorityChip", () => {
  it("only maps the three known levels", () => {
    expect(priorityChip("1 - Needle Mover")).toBe("NM");
    expect(priorityChip("2 - Nurture")).toBe("NU");
    expect(priorityChip("3 - Back-Burner")).toBe("BB");
    expect(priorityChip("Exited")).toBeNull();
  });
});

import { applyProfileOverrides, isExitedStage } from "../src/lib/portco-list-view";
test("exited stage is hidden by default", () => {
  expect(isExitedStage("Exited")).toBe(true);
  expect(isExitedStage("Series B")).toBe(false);
});
test("team profile edits override Asana values", () => {
  expect(applyProfileOverrides({ "company stage": "Series B" }, { "Company Stage": "Exited" })).toEqual({ "Company Stage": "Exited" });
});

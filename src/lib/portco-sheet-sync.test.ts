import { describe, it, expect } from "vitest";
import { planPortcoMirror } from "./portco-sheet-sync";
const headers = ["Company Name", "Website", "Summary", "HQ", "Focus Area(s)", "URID", "Private notes"];
describe("PortCo shared sheet writes", () => {
  it("adds Hyperbolic with its approved description and stable ID", () => {
    const p = planPortcoMirror([headers], { name: "Hyperbolic", description: "Approved text.", urid: "h1" });
    expect(p.append).toBe(true); expect(p.row).toEqual(["Hyperbolic", "", "Approved text.", "", "", "h1", ""]);
  });
  it("updates a renamed company by stable ID without touching unrelated fields", () => {
    const p = planPortcoMirror([headers, ["Old", "site", "Summary", "", "", "h1", "keep"]], { urid: "h1", name: "Hyperbolic", description: "New." });
    expect(p.append).toBe(false); expect(p.row).toEqual(["Hyperbolic", "site", "New.", "", "", "h1", "keep"]);
  });
  it("retry matches case-insensitive names rather than appending duplicates", () => {
    expect(planPortcoMirror([headers, [" HYPERBOLIC "]], { name: "Hyperbolic" }).append).toBe(false);
  });
  it("clears explicitly supplied values but preserves unspecified summaries", () => {
    const p = planPortcoMirror([headers, ["Hyperbolic", "site", "Approved."]], { name: "Hyperbolic", website: "" });
    expect(p.row[1]).toBe(""); expect(p.row[2]).toBe("Approved.");
  });
  it("stops ambiguous duplicate updates", () => {
    expect(() => planPortcoMirror([headers, ["Hyperbolic"], ["Hyperbolic"]], { name: "Hyperbolic" })).toThrow("Multiple");
  });
});
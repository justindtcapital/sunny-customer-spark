import { it, expect } from "vitest";
import { consolidatePortcoRows } from "./portco-cleanup";
it("merges Hyperbolic HQ while retaining its original URID", () => {
  const plan = consolidatePortcoRows([["Company Name", "Website", "HQ", "URID"], ["Hyperbolic", "https://www.hyperbolic.ai/", "", "a"], ["Hyperbolic", "https://www.hyperbolic.ai/", "San Francisco, CA", "b"]]);
  expect(plan.rows[1]).toEqual(["Hyperbolic", "https://www.hyperbolic.ai/", "San Francisco, CA", "a"]); expect(plan.replacements).toEqual({ b: "a" });
});
it("preserves both recorded Pecan summaries verbatim", () => {
  const p = consolidatePortcoRows([["Company Name", "Summary"], ["Pecan", "First."], ["Pecan", "Second."]]);
  expect(p.rows[1][1]).toBe("First.\nSecond.");
});
it("does not merge same-name companies with conflicting websites", () => {
  expect(() => consolidatePortcoRows([["Company Name", "Website"], ["Pecan", "a"], ["Pecan", "b"]])).toThrow("Conflicting");
});
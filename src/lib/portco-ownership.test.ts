import { describe, expect, it } from "vitest";
import { niceCeil, ownershipLayout } from "./portco-ownership";
import type { MatrixPoint } from "./portco-matrix";

const pt = (key: string, investment: number | null, ownership: number | null) =>
  ({ key, name: key, investment, ownership }) as MatrixPoint;

describe("ownershipLayout", () => {
  it("plots only companies with both investment and ownership", () => {
    const l = ownershipLayout([pt("a", 8.7, 0.116), pt("b", null, 0.1), pt("c", 3, null)]);
    expect(l.plotted.map((p) => p.key)).toEqual(["a"]);
    expect(l.notPlotted.map((p) => p.key)).toEqual(["b", "c"]);
  });
  it("rounds axis ceilings up", () => {
    expect(niceCeil(8.7)).toBe(10);
    expect(niceCeil(0.116)).toBe(0.2);
    expect(niceCeil(23)).toBe(25);
  });
});

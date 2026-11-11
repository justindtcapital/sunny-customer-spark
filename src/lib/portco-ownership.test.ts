import { describe, expect, it } from "vitest";
import { fitAxis, formatInvestment, formatOwnership, niceCeil, ownershipLayout } from "./portco-ownership";
import type { MatrixPoint } from "./portco-matrix";

const pt = (key: string, investment: number | null, ownership: number | null) =>
  ({ key, name: key, investment, ownership }) as MatrixPoint;

describe("ownershipLayout", () => {
  it("plots only companies with both investment and ownership", () => {
    const l = ownershipLayout([pt("a", 8.7, 0.116), pt("b", null, 0.1), pt("c", 3, null)]);
    expect(l.plotted.map((p) => p.key)).toEqual(["a"]);
    expect(l.notPlotted.map((p) => p.key)).toEqual(["b", "c"]);
  });
  it("defaults to log axes", () => {
    const l = ownershipLayout([pt("a", 0.2, 0.002), pt("b", 51.5, 0.318)]);
    expect(l.investment.kind).toBe("log");
    expect(l.ownership.kind).toBe("log");
  });
  it("rounds axis ceilings up", () => {
    expect(niceCeil(8.7)).toBe(10);
    expect(niceCeil(0.116)).toBe(0.2);
    expect(niceCeil(23)).toBe(25);
  });
});

describe("under-$2M column", () => {
  const pts = [pt("tiny", 0.2, 0.003), pt("one", 1, 0.054), pt("two", 2, 0.032), pt("big", 51.5, 0.049)];
  it("log view moves companies under $2M into the left column and starts the axis at $2M", () => {
    const l = ownershipLayout(pts, "log");
    expect(l.lowBandBelow).toBe(2);
    expect(l.lowBand.map((p) => p.key)).toEqual(["tiny", "one"]);
    expect(l.investment.min).toBe(2);
    expect(l.investment.ticks).toEqual([2, 5, 10, 20, 50]);
  });
  it("exactly $2M stays on the axis", () => {
    expect(ownershipLayout(pts, "log").lowBand.some((p) => p.key === "two")).toBe(false);
  });
  it("linear view keeps everyone on one axis", () => {
    const l = ownershipLayout(pts, "linear");
    expect(l.lowBandBelow).toBeNull();
    expect(l.lowBand).toEqual([]);
  });
});

describe("under-1% row", () => {
  const pts = [pt("tiny", 8, 0.003), pt("half", 12, 0.008), pt("one", 6, 0.01), pt("big", 51.5, 0.049)];
  it("log view moves companies under 1% ownership into the bottom row and starts the axis at 1%", () => {
    const l = ownershipLayout(pts, "log");
    expect(l.lowOwnershipBelow).toBe(0.01);
    expect(l.lowOwnership.map((p) => p.key)).toEqual(["tiny", "half"]);
    expect(l.ownership.min).toBe(0.01);
    expect(l.ownership.ticks.map(formatOwnership)).toEqual(["1%", "2%", "5%"]);
  });
  it("exactly 1% stays on the axis", () => {
    expect(ownershipLayout(pts, "log").lowOwnership.some((p) => p.key === "one")).toBe(false);
  });
  it("linear view keeps everyone on one axis", () => {
    const l = ownershipLayout(pts, "linear");
    expect(l.lowOwnershipBelow).toBeNull();
    expect(l.lowOwnership).toEqual([]);
  });
});

describe("fitAxis", () => {
  it("linear investment stops at $60M for a $51.5M max, not $100M", () => {
    const a = fitAxis([0.2, 10, 51.5], "linear");
    expect(a.max).toBe(60);
    expect(a.ticks).toEqual([0, 10, 20, 30, 40, 50, 60]);
  });
  it("linear ownership stops at 35% for a 31.8% max, not 50%", () => {
    expect(fitAxis([0.002, 0.318], "linear").max).toBe(0.35);
  });
  it("log investment spans the data with 1-2-5 ticks", () => {
    const a = fitAxis([0.2, 10, 51.5], "log");
    expect(a.ticks).toEqual([0.2, 0.5, 1, 2, 5, 10, 20, 50]);
    expect(a.unit(a.min)).toBe(0);
    expect(a.unit(a.max)).toBeCloseTo(1);
    // $1M → $10M takes the same width as $10M → $100M would.
    expect(a.unit(10) - a.unit(1)).toBeCloseTo(a.unit(50) - a.unit(5));
  });
  it("log ownership ticks run 0.2% to 20%", () => {
    expect(fitAxis([0.002, 0.318], "log").ticks.map(formatOwnership)).toEqual(
      ["0.2%", "0.5%", "1%", "2%", "5%", "10%", "20%"],
    );
  });
  it("formats tick labels", () => {
    expect(formatInvestment(0.5)).toBe("$0.5M");
    expect(formatInvestment(20)).toBe("$20M");
  });
});

// Ownership & Investment view: pure plotting helpers (DTC $M invested vs ownership fraction).
import type { MatrixPoint } from "@/lib/portco-matrix";

export type AxisKind = "log" | "linear";

export interface Axis {
  kind: AxisKind;
  min: number;
  max: number;
  ticks: number[];
  /** Position of a value along the axis, 0 (min) to 1 (max). */
  unit: (v: number) => number;
}

export interface OwnershipLayout {
  plotted: MatrixPoint[];
  notPlotted: MatrixPoint[];
  investment: Axis;
  ownership: Axis;
  /** Log view: companies invested under this ($M) sit in a separate left column. */
  lowBandBelow: number | null;
  lowBand: MatrixPoint[];
  /** Log view: companies owning under this fraction sit in a separate bottom row. */
  lowOwnershipBelow: number | null;
  lowOwnership: MatrixPoint[];
}

/** Under this many $M, the log view groups companies into the left "Under $2M" column. */
export const LOW_INVESTMENT_BAND = 2;

/** Under this ownership fraction, the log view groups companies into the bottom "Under 1%" row. */
export const LOW_OWNERSHIP_BAND = 0.01;

/** "Nice" ceiling for an axis so ticks land on round numbers. */
export function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const round = (v: number) => Number(v.toPrecision(6));

/**
 * Axis fitted to the data. Linear starts at 0 and stops one round step past the
 * largest value; log hugs the smallest and largest values with 1-2-5 ticks, so
 * crowded small companies spread out and a single large one doesn't squash the rest.
 */
export function fitAxis(values: number[], kind: AxisKind, floor?: number): Axis {
  const vals = values.filter((v) => v > 0 && Number.isFinite(v));
  const lo = vals.length ? Math.min(...vals) : 1;
  const hi = vals.length ? Math.max(...vals) : 1;
  if (kind === "linear") {
    const step = niceCeil(hi / 8);
    const max = round(Math.ceil(hi / step - 1e-9) * step);
    const ticks: number[] = [];
    for (let t = 0; t <= max + step / 2; t += step) ticks.push(round(t));
    return { kind, min: 0, max, ticks, unit: (v) => v / max };
  }
  // Log: a little headroom either side; widen a degenerate range to one decade.
  let min = floor ?? lo / 1.15;
  let max = Math.max(hi, min) * 1.15;
  if (floor == null && max / min < 10) {
    const mid = Math.sqrt(min * max);
    min = mid / Math.sqrt(10);
    max = mid * Math.sqrt(10);
  }
  const ticks: number[] = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    for (const m of [1, 2, 5]) {
      const t = round(m * 10 ** e);
      if (t >= min && t <= max) ticks.push(t);
    }
  }
  const lmin = Math.log(min);
  const span = Math.log(max) - lmin;
  return { kind, min, max, ticks, unit: (v) => (Math.log(Math.max(v, min)) - lmin) / span };
}

/** Companies need both a positive investment and ownership to be placed; the rest are listed. */
export function ownershipLayout(points: MatrixPoint[], kind: AxisKind = "log"): OwnershipLayout {
  const plotted: MatrixPoint[] = [];
  const notPlotted: MatrixPoint[] = [];
  for (const p of points) {
    if (p.investment != null && p.investment > 0 && p.ownership != null && p.ownership > 0) plotted.push(p);
    else notPlotted.push(p);
  }
  const inv = (p: MatrixPoint) => p.investment ?? 0;
  const own = (p: MatrixPoint) => p.ownership ?? 0;
  const band =
    kind === "log" && plotted.some((p) => inv(p) < LOW_INVESTMENT_BAND) && plotted.some((p) => inv(p) >= LOW_INVESTMENT_BAND)
      ? LOW_INVESTMENT_BAND
      : null;
  const lowBand = band == null ? [] : plotted.filter((p) => inv(p) < band);
  const onAxis = band == null ? plotted : plotted.filter((p) => inv(p) >= band);
  const ownBand =
    kind === "log" && plotted.some((p) => own(p) < LOW_OWNERSHIP_BAND) && plotted.some((p) => own(p) >= LOW_OWNERSHIP_BAND)
      ? LOW_OWNERSHIP_BAND
      : null;
  const lowOwnership = ownBand == null ? [] : plotted.filter((p) => own(p) < ownBand);
  const onOwnAxis = ownBand == null ? plotted : plotted.filter((p) => own(p) >= ownBand);
  return {
    plotted,
    notPlotted,
    investment: fitAxis(onAxis.map(inv), kind, band ?? undefined),
    ownership: fitAxis(onOwnAxis.map(own), kind, ownBand ?? undefined),
    lowBandBelow: band,
    lowBand,
    lowOwnershipBelow: ownBand,
    lowOwnership,
  };
}

const trim = (v: number) => String(round(v));
export const formatInvestment = (v: number) => `$${trim(v)}M`;
export const formatOwnership = (v: number) => `${trim(v * 100)}%`;

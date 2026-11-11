// Ownership & Investment view: pure plotting helpers (DTC $M invested vs ownership fraction).
import type { MatrixPoint } from "@/lib/portco-matrix";

export interface OwnershipLayout {
  plotted: MatrixPoint[];
  notPlotted: MatrixPoint[];
  maxInvestment: number;
  maxOwnership: number;
}

/** "Nice" ceiling for an axis so ticks land on round numbers. */
export function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Companies need both a positive investment and ownership to be placed; the rest are listed. */
export function ownershipLayout(points: MatrixPoint[]): OwnershipLayout {
  const plotted: MatrixPoint[] = [];
  const notPlotted: MatrixPoint[] = [];
  for (const p of points) {
    if (p.investment != null && p.investment > 0 && p.ownership != null && p.ownership > 0) plotted.push(p);
    else notPlotted.push(p);
  }
  return {
    plotted,
    notPlotted,
    maxInvestment: niceCeil(Math.max(0, ...plotted.map((p) => p.investment ?? 0))),
    maxOwnership: niceCeil(Math.max(0, ...plotted.map((p) => p.ownership ?? 0))),
  };
}

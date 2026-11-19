// Signals radar: pure ring/column assignment for the quarter-circle header.
// Browser-safe. PortCo = a PortCo story; Network = an employer of Council/Hot/Warm
// people (enterprise watch); Market = everything else.
import { companyKey } from "@/lib/enterprise-watch";
import { INDUSTRIES, SEGMENTS, SOURCE_TYPES } from "@/lib/signal-feed";
import type { FilterableSignal } from "@/lib/signals-page";

export const RINGS = ["Market", "Network", "PortCo"] as const;
export type Ring = (typeof RINGS)[number];
export type RadarView = "domain" | "industry" | "source";

export interface RadarKeys { portco: Set<string>; watch: Set<string> }

export function radarKeys(portcos: string[], watch: string[]): RadarKeys {
  return { portco: new Set(portcos.map(companyKey).filter(Boolean)), watch: new Set(watch.map(companyKey).filter(Boolean)) };
}

export function ringFor(c: Pick<FilterableSignal, "company" | "sourceType">, keys: RadarKeys): Ring {
  const k = companyKey(c.company);
  if (k && keys.portco.has(k)) return "PortCo";
  if (c.sourceType === "PortCo News" || c.sourceType === "PortCo Blogs") return "PortCo";
  if (k && keys.watch.has(k)) return "Network";
  return "Market";
}

export function radarColumns(view: RadarView): string[] {
  if (view === "industry") return [...INDUSTRIES, "Other"];
  if (view === "source") return SOURCE_TYPES.filter((s) => s !== "LinkedIn");
  return [...SEGMENTS, "Other"];
}

export function columnFor(c: FilterableSignal, view: RadarView): string {
  const cols = radarColumns(view);
  const v = view === "industry" ? c.industry || "" : view === "source" ? c.sourceType : c.segmentBucket;
  return cols.includes(v) ? v : cols.includes("Other") ? "Other" : v;
}

export function radarCounts(cards: FilterableSignal[], view: RadarView, keys: RadarKeys) {
  const cells = new Map<string, number>();
  const rings = new Map<Ring, number>();
  for (const c of cards) {
    const r = ringFor(c, keys);
    rings.set(r, (rings.get(r) || 0) + 1);
    const k = `${r}|${columnFor(c, view)}`;
    cells.set(k, (cells.get(k) || 0) + 1);
  }
  return { cells, rings };
}

export function matchesRadar(c: FilterableSignal, sel: { ring?: string; view?: string; col?: string }, keys: RadarKeys): boolean {
  if (sel.ring && ringFor(c, keys) !== sel.ring) return false;
  if (sel.col && columnFor(c, (sel.view as RadarView) || "domain") !== sel.col) return false;
  return true;
}

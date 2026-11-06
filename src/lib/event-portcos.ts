// Event PortCo tags always use the official Portfolio Companies spelling, so each
// company appears once per event and its page links back to every event once.
// Pure — shared by event saves, the one-time cleanup and the PortCo Events tab.
import { scorePortcoNameMatch } from "./portco-names";
import type { PlannerEvent } from "./event-planner";
import type { PortfolioEvent } from "./types";

/** Human-approved spellings that fuzzy matching cannot decide on its own. */
export const APPROVED_EVENT_PORTCO_ALIASES: Record<string, string> = {
  maven: "MavenAGI",
  tnt: "Tag-N-Trac",
  "twine security": "Twine",
  "terra security": "Terra",
  domino: "Domino Data Lab",
  "maxiq (gyaan)": "MaxIQ",
};

const keyOf = (s: string) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();

/** Official name for one tag, or null when no single official company clearly matches. */
export function resolveEventPortco(name: string, official: string[]): string | null {
  const k = keyOf(name);
  if (!k) return null;
  const byKey = new Map(official.filter(Boolean).map((n) => [keyOf(n), n.trim().replace(/\s+/g, " ")]));
  const exact = byKey.get(k);
  if (exact) return exact;
  const alias = APPROVED_EVENT_PORTCO_ALIASES[k];
  if (alias && byKey.has(keyOf(alias))) return byKey.get(keyOf(alias))!;
  const scored = [...byKey.values()]
    .map((n) => ({ n, s: Math.max(scorePortcoNameMatch(name, n), scorePortcoNameMatch(name.replace(/\.(io|ai|com)$/i, ""), n)) }))
    .filter((x) => x.s >= 800)
    .sort((a, b) => b.s - a.s);
  if (!scored.length || (scored[1] && scored[1].s === scored[0].s)) return null;
  return scored[0].n;
}

/** Official, de-duplicated tags; unmatched tags are kept as typed and reported. */
export function canonicalEventPortcos(names: string[], official: string[]): { portcos: string[]; unresolved: string[] } {
  const portcos: string[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const typed = (raw || "").trim().replace(/\s+/g, " ");
    if (!typed) continue;
    const resolved = official.length ? resolveEventPortco(typed, official) : null;
    const name = resolved || typed;
    if (!resolved && official.length && !unresolved.includes(typed)) unresolved.push(typed);
    if (seen.has(keyOf(name))) continue;
    seen.add(keyOf(name));
    portcos.push(name);
  }
  return { portcos, unresolved };
}

/** Every Asana task ID an event represents (its own plus any merged into it). */
export function eventAsanaGids(e: Pick<PlannerEvent, "asanaGid" | "sourceRef">): string[] {
  const ids = [e.asanaGid, ...[...(e.sourceRef || "").matchAll(/asana\.com\/0\/\d+\/(\d+)/g)].map((m) => m[1])];
  return [...new Set(ids.filter(Boolean))];
}

function eventType(name: string): PortfolioEvent["type"] {
  if (/dinner/i.test(name)) return "dinner";
  if (/webinar|virtual/i.test(name)) return "webinar";
  return "conference";
}

/** Official company name (lowercase) → its events from the event list, one entry per event. Declined events are left out. */
export function trackerEventsByPortco(events: PlannerEvent[], official: string[], today: string): Record<string, PortfolioEvent[]> {
  const out: Record<string, PortfolioEvent[]> = {};
  for (const e of events) {
    if (e.status === "Declined" || !e.start) continue;
    for (const name of canonicalEventPortcos(e.portcos, official).portcos) {
      const k = keyOf(name);
      (out[k] ||= []).push({
        id: `tracker-${e.urid}`,
        date: e.start,
        name: e.name,
        type: eventType(e.name),
        status: e.start < today ? "completed" : "planned",
        sourceGids: eventAsanaGids(e),
      });
    }
  }
  return out;
}

/** Event-list entries win; Asana entries already represented (same task or same name and date) are dropped. */
export function mergeCompanyEvents(base: PortfolioEvent[], asana: PortfolioEvent[]): PortfolioEvent[] {
  const gids = new Set(base.flatMap((e) => e.sourceGids || []));
  const nameDate = new Set(base.map((e) => `${keyOf(e.name)}|${e.date}`));
  const ids = new Set<string>();
  const out: PortfolioEvent[] = [];
  for (const e of [...base, ...asana]) {
    if (ids.has(e.id)) continue;
    const gid = e.id.match(/^asana-(\d+)-/)?.[1];
    if (!base.includes(e) && ((gid && gids.has(gid)) || nameDate.has(`${keyOf(e.name)}|${e.date}`))) continue;
    ids.add(e.id);
    out.push(e);
  }
  return out;
}

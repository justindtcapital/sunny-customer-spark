import { eventSeriesKey, mergePlannerEvents, normalizeSector, categoryOfSubcategory, type PlannerEvent, type PlannerAttendee } from "./event-planner";
import { scorePortcoNameMatch } from "./portco-names";

type CompanySector = { name: string; sector: string; domain?: string };

function titleKey(name: string): string {
  return eventSeriesKey(name)
    .replace(/\bbriefings?\b/g, " ")
    .replace(/\bgbi impact\b/g, "gbi")
    .replace(/\bn h a i\b|\bnhai\b/g, "nhai")
    .replace(/\bconferenec\b/g, "conference")
    .replace(/\billuymn\b/g, "illumyn")
    .replace(/\bcybersecuity\b/g, "cybersecurity")
    .replace(/\btech leader s\b/g, "tech leaders")
    .replace(/\s+/g, " ").trim();
}

/** Same-day name variants only; conference breakouts, dinners and workshops stay separate. */
export function cleanupMatch(a: PlannerEvent, b: PlannerEvent): boolean {
  if (!a.start || a.start !== b.start) return false;
  const x = titleKey(a.name), y = titleKey(b.name);
  if (x === y) return true;
  const contains = (long: string, short: string) => long.startsWith(short + " ");
  if (/^vation\b/.test(x) && /^vation\b/.test(y)) return contains(x, y) || contains(y, x);
  if (/brief/i.test(a.name) || /brief/i.test(b.name)) return contains(x, y) || contains(y, x);
  if (/^gbi\b/.test(x) && /^gbi\b/.test(y)) return contains(x, y) || contains(y, x);
  if (/^nhai conference/.test(x) && /^nhai conference/.test(y)) return true;
  if (x.includes("illumyn impact") && y.includes("illumyn impact") && x.includes("dinner") && y.includes("dinner")) {
    return !(/\bsf\b/.test(x) !== /\bsf\b/.test(y));
  }
  return false;
}

export function resolveEventSectors(event: PlannerEvent, companies: CompanySector[]): string[] {
  const resolved: string[] = [];
  let complete = event.portcos.length > 0;
  for (const name of event.portcos) {
    const ranked = companies.map(c => ({ c, score: scorePortcoNameMatch(name, c.name) })).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < 200) { complete = false; continue; }
    const raw = best.c.sector;
    const sector = /cyber|security|secops|devsecops|data protection/i.test(raw) ? "Cyber"
      : /supply|logistic/i.test(raw) ? "Supply Chain"
      : /\bai\b|data|analytics|observability|mlops/i.test(raw) ? "Data/AI"
      : best.c.domain === "Security" ? "Cyber"
      : ["AI", "Data"].includes(best.c.domain || "") ? "Data/AI" : "";
    if (sector) resolved.push(sector); else complete = false;
  }
  return [...new Set(complete && resolved.length ? resolved : [...event.sectors.map(normalizeSector), ...resolved])];
}

export function planEventCleanup(events: PlannerEvent[], companies: CompanySector[]) {
  const replacements = new Map<string, string>();
  const updates = new Map<string, PlannerEvent>();
  for (const tracker of events.filter(e => e.source === "Tracker")) {
    if (replacements.has(tracker.urid)) continue;
    const matches = events.filter(e => e.urid !== tracker.urid && !replacements.has(e.urid) && cleanupMatch(tracker, e));
    let next = tracker;
    for (const loser of matches) {
      // Never combine competing Tracker decisions except the known NHAI spelling duplicate.
      if (loser.source === "Tracker" && !/^nhai conference/.test(titleKey(tracker.name))) continue;
      const competing = events.filter(e => e.source === "Tracker" && !replacements.has(e.urid) && cleanupMatch(e, loser));
      if (loser.source !== "Tracker" && competing.length !== 1) continue;
      next = mergePlannerEvents(next, loser);
      for (const field of ["notes", "actionsNeeded", "eventContact"] as const) {
        if (loser[field] && !next[field].includes(loser[field])) next[field] += `\n\n${loser[field]}`;
      }
      // Preserve old names and every Asana ID for legacy links and overlay matching.
      next.sourceRef += ` · Merged event: ${loser.name} · Merged URID: ${loser.urid}`;
      if (loser.asanaGid && !next.sourceRef.includes(loser.asanaGid)) next.sourceRef += ` · https://app.asana.com/0/0/${loser.asanaGid}`;
      replacements.set(loser.urid, tracker.urid);
    }
    if (next !== tracker) {
      next.sectors = resolveEventSectors(next, companies);
      updates.set(tracker.urid, next);
    }
  }
  for (const event of events) {
    if (replacements.has(event.urid)) continue;
    const next = { ...(updates.get(event.urid) || event) };
    if (next.subcategory === "Unassigned") {
      next.subcategory = /\bbrief/i.test(next.name) ? "DTC Curated Briefings" : "3rd Party Events";
      next.category = categoryOfSubcategory(next.subcategory);
      updates.set(next.urid, next);
    }
  }
  return { updates, replacements };
}

/** Attendance belongs to the keeper without losing status or any source rows. */
export function remapEventAttendees(attendees: PlannerAttendee[], replacements: Map<string, string>): PlannerAttendee[] {
  return attendees.map(a => ({ ...a, eventUrid: replacements.get(a.eventUrid) || a.eventUrid }));
}
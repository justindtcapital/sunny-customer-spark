// Event history linking — pure helpers (no I/O). Proposes links from past
// events and confirmed event activities to future Potential events. Never
// creates events; ambiguous matches always go to human review.
import { eventReferenceNames } from "./event-cleanup";
import type { PlannerEvent } from "./event-planner";

export type HistorySourceKind = "event" | "activity";

export interface HistorySource {
  kind: HistorySourceKind;
  /** Past event URID or harvested activity ID. */
  id: string;
  name: string;
  date: string;
  portcos: string[];
  category?: string;
  urls?: string[];
  /** Other names this source has been known by (earlier merges). */
  altNames?: string[];
  status?: string;
  url?: string;
  summary?: string;
  /** Activity type (event, meeting, email…); only "event" activities match by dates. */
  type?: string;
}

export interface HistoryLink {
  targetUrid: string;
  kind: HistorySourceKind;
  sourceId: string;
  sourceName: string;
  sourceDate: string;
  portcos: string[];
  reason: string;
  sourceUrl: string;
  linkedBy: string;
  linkedAt: string;
}

export interface HistoryCandidate { urid: string; name: string; start: string; reason: string }

export interface HistoryProposal {
  source: HistorySource;
  status: "clear" | "review" | "unmatched";
  candidates: HistoryCandidate[];
  note: string;
}

export const linkKey = (targetUrid: string, kind: string, sourceId: string) => `${targetUrid}|${kind}|${sourceId}`;

const GENERIC_WORDS = new Set([
  "summit", "dinner", "conference", "meetup", "event", "events", "reception", "lunch", "breakfast", "forum",
  "happy", "hour", "mixer", "panel", "webinar", "the", "a", "an", "of", "and", "annual", "day", "night",
  "party", "networking", "roundtable", "workshop", "session", "meeting", "call", "with", "for", "at", "in",
]);
const TICKET_HOSTS = new Set(["lu.ma", "luma.com", "eventbrite.com", "linkedin.com", "google.com", "docs.google.com", "zoom.us", "app.asana.com"]);

/** Lowercase, drop years/editions/punctuation so "RSAC 2026 (15th)" ≈ "RSAC 2027". */
export function normalizeEventName(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\bfy\s?\d{2,4}\b/g, " ")
    .replace(/\b\d+(st|nd|rd|th)\b/g, " ")
    .replace(/#\s?\d+/g, " ")
    .replace(/\b(edition|annual|ed\.)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Too generic to identify an event on its own name. */
export function isGenericName(normalized: string): boolean {
  const words = normalized.split(" ").filter(Boolean);
  if (normalized.length < 4) return true;
  return words.every((w) => GENERIC_WORDS.has(w) || /^\d+$/.test(w));
}

/** Identifying web host (+ first path segment on shared ticketing hosts). */
export function identityDomain(url: string): string {
  try {
    const u = new URL(/^https?:/.test(url) ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (!host.includes(".")) return "";
    if (TICKET_HOSTS.has(host)) return "";
    return host;
  } catch { return ""; }
}

const lc = (xs: string[]) => new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean));
const overlap = (a: string[], b: string[]) => { const s = lc(b); return [...lc(a)].some((x) => s.has(x)); };

export function eventToSource(e: PlannerEvent): HistorySource {
  const names = eventReferenceNames(e);
  return {
    kind: "event", id: e.urid, name: e.name, date: e.start, portcos: e.portcos, category: e.category,
    urls: [e.website, e.lumaUrl].filter(Boolean), altNames: names.slice(1), status: e.dtcStatus || e.status,
    url: e.website || e.lumaUrl || "",
  };
}

/** Does `title` mention the event name as whole words? */
function mentions(title: string, name: string): boolean {
  if (!name) return false;
  return ` ${title} `.includes(` ${name} `);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface PlanInput {
  /** Events that may receive history (future Potential events). */
  targets: PlannerEvent[];
  pastEvents: PlannerEvent[];
  /** Confirmed activities only. */
  activities: HistorySource[];
  existing: HistoryLink[];
}

/** Classify every source as clear / review / unmatched; already-linked pairs are dropped. */
export function planHistoryLinks({ targets, pastEvents, activities, existing }: PlanInput): {
  proposals: HistoryProposal[];
  alreadyLinked: number;
} {
  const linked = new Set(existing.map((l) => linkKey(l.targetUrid, l.kind, l.sourceId)));
  const tIndex = targets.map((t) => ({
    t,
    names: [...new Set(eventReferenceNames(t).map(normalizeEventName).filter(Boolean))],
    domains: new Set([t.website, t.lumaUrl].map(identityDomain).filter(Boolean)),
  }));
  let alreadyLinked = 0;
  const proposals: HistoryProposal[] = [];

  const pastCandidates = new Map<string, HistoryCandidate[]>();
  const pastGeneric = new Map<string, boolean>();

  const finish = (source: HistorySource, cands: HistoryCandidate[], generic: boolean, conflict: string) => {
    const fresh = cands.filter((c) => !linked.has(linkKey(c.urid, source.kind, source.id)));
    if (cands.length && !fresh.length) { alreadyLinked++; return; }
    if (cands.length > fresh.length) alreadyLinked++;
    if (!cands.length) { proposals.push({ source, status: "unmatched", candidates: [], note: "No matching future event" }); return; }
    const note = fresh.length > 1 ? `${fresh.length} possible events` : generic ? "Name too generic to link automatically" : conflict;
    proposals.push({ source, status: note ? "review" : "clear", candidates: fresh, note });
  };

  for (const p of pastEvents) {
    const src = eventToSource(p);
    const names = [...new Set([p.name, ...(src.altNames || [])].map(normalizeEventName).filter(Boolean))];
    const domains = new Set((src.urls || []).map(identityDomain).filter(Boolean));
    const generic = names.every(isGenericName);
    const cands: HistoryCandidate[] = [];
    let conflict = "";
    for (const { t, names: tn, domains: td } of tIndex) {
      if (t.urid === p.urid) continue;
      const nameHit = names.some((n) => tn.includes(n));
      const domainHit = [...domains].some((d) => td.has(d));
      if (!nameHit && !domainHit) continue;
      const reasons = [nameHit && "same event name", domainHit && "same website"].filter(Boolean).join(" + ");
      cands.push({ urid: t.urid, name: t.name, start: t.start, reason: reasons });
      if (p.category && t.category && p.category !== t.category) conflict = `Category differs (${p.category} vs ${t.category})`;
      else if (p.portcos.length && t.portcos.length && !overlap(p.portcos, t.portcos)) conflict ||= "PortCos differ";
      else if (!nameHit) conflict ||= "Matched on website only";
    }
    pastCandidates.set(p.urid, cands);
    pastGeneric.set(p.urid, generic);
    finish(src, cands, generic, conflict);
  }

  for (const a of activities) {
    const title = normalizeEventName(a.name);
    const cands = new Map<string, HistoryCandidate>();
    let generic = false;
    for (const { t, names: tn } of tIndex) {
      const hit = tn.find((n) => !isGenericName(n) && mentions(title, n));
      if (hit) cands.set(t.urid, { urid: t.urid, name: t.name, start: t.start, reason: "activity names the event" });
    }
    // Inside a past event's dates with a shared PortCo → inherit that event's matches.
    if (a.type === "event" && a.date && a.portcos.length) {
      for (const p of pastEvents) {
        if (!p.start || !overlap(a.portcos, p.portcos)) continue;
        if (a.date < addDays(p.start, -2) || a.date > addDays(p.end || p.start, 2)) continue;
        for (const c of pastCandidates.get(p.urid) || []) {
          if (!cands.has(c.urid)) cands.set(c.urid, { ...c, reason: `during ${p.name} (shared PortCo)` });
          if (pastGeneric.get(p.urid)) generic = true;
        }
      }
    }
    const list = [...cands.values()];
    const conflict = a.portcos.length ? "" : "Activity has no PortCo";
    if (!list.length) continue; // non-event activities stay out of the list
    finish(a, list, generic, conflict);
  }

  const order = { clear: 0, review: 1, unmatched: 2 } as const;
  proposals.sort((x, y) => order[x.status] - order[y.status] || x.source.name.localeCompare(y.source.name));
  return { proposals, alreadyLinked };
}

/** Drop links whose pair already exists (repeat runs / concurrent saves). */
export function newLinksOnly(links: HistoryLink[], existing: HistoryLink[]): HistoryLink[] {
  const seen = new Set(existing.map((l) => linkKey(l.targetUrid, l.kind, l.sourceId)));
  const out: HistoryLink[] = [];
  for (const l of links) {
    const k = linkKey(l.targetUrid, l.kind, l.sourceId);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}

/** Follow merged URIDs ("Merged URID: x" in Source Ref) so links survive event merges. */
export function resolveMergedUrid(urid: string, events: PlannerEvent[]): string {
  if (events.some((e) => e.urid === urid)) return urid;
  const keeper = events.find((e) => e.sourceRef.includes(`Merged URID: ${urid}`));
  return keeper ? keeper.urid : urid;
}

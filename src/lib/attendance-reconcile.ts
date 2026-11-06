// One-time attendee reconciliation — pure helpers (no I/O). Matches contact
// "Events" tags (free-text event names) to Event Planner events so tagged
// people appear in the event's attendee list. Proposes only; ambiguous names
// go to review and nothing is ever created or renamed.
import { eventReferenceNames } from "./event-cleanup";
import { eventSeriesKey, type PlannerAttendee, type PlannerEvent } from "./event-planner";

export interface AttendanceTag {
  email: string;
  name: string;
  eventName: string;
  date: string;
  kind: string;
}

export interface TagGroup {
  tagName: string;
  /** Clear when exactly one planner event matches. */
  status: "clear" | "review" | "unmatched";
  candidates: Array<{ urid: string; name: string; start: string; reason: string }>;
  people: AttendanceTag[];
  /** People already on the matched event (clear only). */
  alreadyLinked: number;
}

const full = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const yearOf = (s: string) => s.match(/\b(20\d{2})\b/)?.[1] || (s.match(/'(\d{2})\b/) ? `20${s.match(/'(\d{2})\b/)![1]}` : "");
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

const MEETING = /(<>|\bsync\b|\bmeeting\b|\bcall\b|checkpoint|\bdemo\b|coffee|catch ?up|\breview\b|handover|\b1:1\b|board meeting|\bconnect\b| \/ )/i;
/** Calendar meetings/1:1s that were logged as "events" — never attendance. */
export function isMeetingTag(name: string): boolean { return MEETING.test(name); }

const NOISE = new Set(["events", "event", "dinner", "dinners", "happy", "hour", "virtual", "reception", "party", "the", "conference", "summit", "usa", "impact", "and"]);
const ALIAS: Record<string, string> = { dtw: "dell technologies world", rsa: "rsa conference", blackhat: "black hat", "dell tech world": "dell technologies world" };
const core = (s: string) => {
  let f = full(s).replace(/\b20\d{2}\b/g, " ");
  for (const [a, b] of Object.entries(ALIAS)) f = f.replace(new RegExp(`\\b${a}\\b`, "g"), b);
  return f.split(" ").filter((w) => w && !NOISE.has(w)).join(" ");
};

/** Loose match for informal names ("RSA Events", "Ai4 Dinner") — always review. */
function looseCandidates(tagName: string, events: PlannerEvent[]): PlannerEvent[] {
  const c = core(tagName);
  if (c.length < 2) return [];
  return events.filter((e) => eventReferenceNames(e).some((n) => {
    const en = core(n);
    return !!en && (en === c || en.startsWith(c + " ") || c.startsWith(en + " ") || full(n).replace(/\s/g, "") === full(tagName).replace(/\s/g, ""));
  }));
}

export function matchEventName(tagName: string, tagDates: string[], events: PlannerEvent[]): TagGroup["candidates"] {
  const f = full(tagName);
  if (!f) return [];
  const exact = events.filter((e) => eventReferenceNames(e).some((n) => full(n) === f));
  if (exact.length === 1) return [{ urid: exact[0].urid, name: exact[0].name, start: exact[0].start, reason: "Same name" }];
  const key = eventSeriesKey(tagName);
  let pool = exact.length ? exact : key ? events.filter((e) => eventReferenceNames(e).some((n) => eventSeriesKey(n) === key)) : [];
  const yr = yearOf(tagName);
  if (pool.length > 1 && yr) {
    const sameYear = pool.filter((e) => e.start.startsWith(yr));
    if (sameYear.length) pool = sameYear;
  }
  const dated = tagDates.filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d));
  if (pool.length > 1 && dated.length) {
    const near = pool.filter((e) => e.start && dated.some((d) => days(d, e.start) <= 10));
    if (near.length) pool = near;
  }
  if (!pool.length) {
    pool = looseCandidates(tagName, events);
    if (pool.length > 1 && dated.length) {
      const near = pool.filter((e) => e.start && dated.some((d) => days(d, e.start) <= 10));
      if (near.length) pool = near;
    }
    // Informal names never auto-link: pad to force review even with one candidate.
    return pool.slice(0, 12).map((e) => ({ urid: e.urid, name: e.name, start: e.start, reason: "Similar name — confirm" }));
  }
  const reason = exact.length ? "Same name" : "Same event series";
  return pool.map((e) => ({ urid: e.urid, name: e.name, start: e.start, reason: pool.length === 1 && reason === "Same event series" ? (yr || dated.length ? "Same series and year/date" : "Same event series") : reason }));
}

const personKey = (urid: string, p: { email: string; name: string }) => `${urid}|${(p.email || p.name).toLowerCase().trim()}`;

export function planAttendanceReconcile(tags: AttendanceTag[], events: PlannerEvent[], existing: PlannerAttendee[]): TagGroup[] {
  const have = new Set(existing.map((a) => personKey(a.eventUrid, a)));
  const byTag = new Map<string, AttendanceTag[]>();
  for (const t of tags) {
    const k = t.eventName.trim();
    if (!k || (!t.email && !t.name)) continue;
    const list = byTag.get(k) || [];
    if (!list.some((p) => (p.email || p.name).toLowerCase() === (t.email || t.name).toLowerCase())) list.push(t);
    byTag.set(k, list);
  }
  const out: TagGroup[] = [];
  for (const [tagName, people] of byTag) {
    const candidates = matchEventName(tagName, people.map((p) => p.date), events);
    if (isMeetingTag(tagName) || !candidates.length) continue; // Events DB only
    const loose = candidates.every((c) => c.reason === "Similar name — confirm");
    const status = candidates.length === 1 && !loose ? "clear" : candidates.length > 1 ? "review" : "unmatched";
    const alreadyLinked = status === "clear" ? people.filter((p) => have.has(personKey(candidates[0].urid, p))).length : 0;
    out.push({ tagName, status, candidates, people, alreadyLinked });
  }
  return out.sort((a, b) => b.people.length - a.people.length || a.tagName.localeCompare(b.tagName));
}

/** Attendee rows for chosen (tag → event) pairs, skipping people already linked. */
export function attendeeRowsFor(groups: TagGroup[], choices: Record<string, string>, existing: PlannerAttendee[]): PlannerAttendee[] {
  const have = new Set(existing.map((a) => personKey(a.eventUrid, a)));
  const rows: PlannerAttendee[] = [];
  for (const g of groups) {
    const urid = choices[g.tagName];
    if (!urid || !g.candidates.some((c) => c.urid === urid)) continue;
    const ev = g.candidates.find((c) => c.urid === urid)!;
    for (const p of g.people) {
      const k = personKey(urid, p);
      if (have.has(k)) continue;
      have.add(k);
      rows.push({ eventUrid: urid, name: p.name, email: p.email, kind: p.kind || "Network", status: "Attended", date: p.date || ev.start });
    }
  }
  return rows;
}

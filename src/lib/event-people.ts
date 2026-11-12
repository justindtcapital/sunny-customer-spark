import { eventReferenceNames } from "./event-cleanup";
import type { PlannerAttendee, PlannerEvent } from "./event-planner";

/** One Event Tracker event as offered by the event picker: canonical name plus merged/old names. */
export interface PickerEvent {
  urid: string;
  name: string;
  date: string;
  aliases: string[];
}

/** Case/punctuation-insensitive, but years stay so different editions never match. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Picker catalog = Event Tracker rows only (no Asana-only or typed names), aliases from merges. */
export function trackerPickerEvents(events: PlannerEvent[]): PickerEvent[] {
  return events
    .filter((e) => e.urid && e.name.trim())
    .map((e) => {
      const own = norm(e.name);
      const aliases = [...new Set(eventReferenceNames(e).slice(1).map((a) => a.trim()).filter((a) => a && norm(a) !== own))];
      return { urid: e.urid, name: e.name.trim(), date: e.start || "", aliases };
    });
}

/**
 * Resolve a typed/stored event name to exactly one tracker event: its own name first,
 * then a merged (old) name. Unknown or ambiguous names resolve to nothing.
 */
export function resolveTrackerEvent<T extends { name: string; aliases: string[] }>(name: string, events: T[]): T | undefined {
  const k = norm(name);
  if (!k) return undefined;
  const direct = events.filter((e) => norm(e.name) === k);
  if (direct.length === 1) return direct[0];
  if (direct.length > 1) return undefined;
  const viaAlias = events.filter((e) => e.aliases.some((a) => norm(a) === k));
  return viaAlias.length === 1 ? viaAlias[0] : undefined;
}

/** Search text that matches a picker event by its name or any older name. */
export function pickerKeywords(e: PickerEvent): string[] {
  return [e.name, ...e.aliases];
}

/** The older name a query hit, when the canonical name itself didn't match. */
export function aliasHit(e: PickerEvent, query: string): string {
  const q = norm(query);
  if (!q || norm(e.name).includes(q)) return "";
  return e.aliases.find((a) => norm(a).includes(q)) || "";
}

export interface EventPersonLike {
  id: string;
  urid?: string;
  name: string;
  email: string;
  company?: string;
  eventsAttended?: string[];
  eventsInvited?: string[];
}

/** Raw person-event tag row (CRM "Events" tab). */
export interface EventTagRow {
  email: string;
  curid: string;
  eventName: string;
  type: string;
}

export interface EventPersonRow {
  key: string;
  name: string;
  email: string;
  company: string;
  /** Network | Prospect | Guest | Not in CRM */
  kind: string;
  /** Attended | Registered | Invited */
  status: string;
}

const STATUS_RANK: Record<string, number> = { attended: 3, registered: 2, invited: 1 };
const rank = (s: string) => STATUS_RANK[s.toLowerCase()] || 0;
const firstEmail = (e: string) => (e || "").split(/[;,]/)[0].trim().toLowerCase();

/**
 * Everyone linked to one event: tracker attendee rows, Network and Prospecting people whose
 * tags name the event (canonical or merged name), and raw tags whose person isn't in the CRM.
 * One row per person; the strongest status wins (Attended > Registered > Invited).
 */
export function eventPeople(
  event: PlannerEvent,
  attendees: PlannerAttendee[],
  network: EventPersonLike[],
  prospects: EventPersonLike[],
  tags: EventTagRow[] = [],
): EventPersonRow[] {
  const names = new Set(eventReferenceNames(event).map(norm));
  const rows = new Map<string, EventPersonRow>();
  const byEmail = new Map<string, string>();
  const keyFor = (email: string, name: string) => {
    const em = firstEmail(email);
    if (em && byEmail.has(em)) return byEmail.get(em)!;
    return em ? `e:${em}` : `n:${norm(name)}`;
  };
  const put = (r: Omit<EventPersonRow, "key">) => {
    const key = keyFor(r.email, r.name);
    const have = rows.get(key) || [...rows.values()].find((x) => !x.email && !r.email && norm(x.name) === norm(r.name));
    if (have) {
      if (rank(r.status) > rank(have.status)) have.status = r.status;
      if (have.kind === "Not in CRM" && r.kind !== "Not in CRM") Object.assign(have, { kind: r.kind, name: r.name, company: r.company || have.company });
      if (!have.company && r.company) have.company = r.company;
      return;
    }
    rows.set(key, { ...r, key });
    const em = firstEmail(r.email);
    if (em) byEmail.set(em, key);
  };

  for (const a of attendees) {
    if (a.eventUrid !== event.urid) continue;
    put({ name: a.name, email: a.email, company: "", kind: a.kind || "Network", status: a.status || "Attended" });
  }
  const people: Array<[EventPersonLike, string]> = [
    ...network.map((p) => [p, "Network"] as [EventPersonLike, string]),
    ...prospects.map((p) => [p, "Prospect"] as [EventPersonLike, string]),
  ];
  const byUrid = new Map<string, [EventPersonLike, string]>();
  const personByEmail = new Map<string, [EventPersonLike, string]>();
  for (const pk of people) {
    const [p, kind] = pk;
    if (p.urid) byUrid.set(p.urid.toLowerCase(), pk);
    for (const em of (p.email || "").split(/[;,]/)) if (em.trim()) personByEmail.set(em.trim().toLowerCase(), pk);
    const attended = (p.eventsAttended || []).some((x) => names.has(norm(x)));
    const invited = (p.eventsInvited || []).some((x) => names.has(norm(x)));
    if (!attended && !invited) continue;
    put({ name: p.name, email: p.email, company: p.company || "", kind, status: attended ? "Attended" : "Invited" });
  }
  for (const t of tags) {
    if (!names.has(norm(t.eventName))) continue;
    const status = (t.type || "attended").toLowerCase() === "invited" ? "Invited" : "Attended";
    const hit = byUrid.get((t.curid || "").toLowerCase()) || personByEmail.get((t.email || "").trim().toLowerCase());
    if (hit) put({ name: hit[0].name, email: hit[0].email, company: hit[0].company || "", kind: hit[1], status });
    else if (t.email.trim()) put({ name: t.email.trim(), email: t.email.trim(), company: "", kind: "Not in CRM", status });
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Campaigns linked to the event by its canonical or any merged name. */
export function campaignsForEvent<C extends { events: string[] }>(event: PlannerEvent, campaigns: C[]): C[] {
  const names = new Set(eventReferenceNames(event).map(norm));
  return campaigns.filter((c) => (c.events || []).some((n) => names.has(norm(n))));
}

/** Existing tracker attendee row with its 0-based data-row index (header excluded). */
export interface IndexedAttendee { index: number; eventUrid: string; name: string; email: string; status: string }
export interface AttendeeInput { eventUrid: string; name: string; email: string; status: string }

/**
 * Plan tracker attendee writes. Same event + same email, or same normalised full name,
 * is one person. New people are appended; an existing row is upgraded in place only when
 * the incoming status is stronger (Attended > Registered > Invited), so an upload of the
 * people who attended moves earlier invitees to Attended and never downgrades anyone.
 */
export function planAttendeeWrites<T extends AttendeeInput>(
  existing: IndexedAttendee[],
  incoming: T[],
): { append: T[]; upgrades: Array<{ index: number; status: string }> } {
  const n = (s: string) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
  const byKey = new Map<string, { index: number; status: string }>();
  const keys = (a: { eventUrid: string; email: string; name: string }) =>
    [n(a.email) ? `${a.eventUrid}|e:${n(a.email)}` : "", n(a.name) ? `${a.eventUrid}|n:${n(a.name)}` : ""].filter(Boolean);
  const appended = new Set<string>();
  for (const a of existing) {
    const slot = { index: a.index, status: a.status || "Attended" };
    for (const k of keys(a)) if (!byKey.has(k)) byKey.set(k, slot);
  }
  const append: T[] = [];
  const upgrades = new Map<number, string>();
  for (const a of incoming) {
    const ks = keys(a);
    if (!ks.length || ks.some((k) => appended.has(k))) continue;
    const hit = ks.map((k) => byKey.get(k)).find(Boolean);
    if (!hit) {
      append.push(a);
      ks.forEach((k) => appended.add(k));
      continue;
    }
    const status = a.status || "Attended";
    if (rank(status) > rank(upgrades.get(hit.index) || hit.status)) upgrades.set(hit.index, status);
  }
  return { append, upgrades: [...upgrades].map(([index, status]) => ({ index, status })) };
}

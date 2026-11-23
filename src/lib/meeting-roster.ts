// Pure helpers for the "People in this meeting" roster on note review cards:
// first-name / unknown-speaker matching and assigning next steps to people.

export interface DirPerson { name: string; email: string; company: string; where: string }

/** Transcript placeholders like "Speaker B", "Unknown", "Participant 2". */
export function isPlaceholderName(name: string): boolean {
  return /^(speaker|participant|guest|unknown|attendee)\b/i.test((name || "").trim());
}

function clean(s: string): string {
  return (s || "").replace(/\(.*?\)/g, " ").replace(/[^\p{L}\p{N}@.\s'-]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Likely CRM contacts for a name heard in a meeting. Email or full name match
 * exactly; a first name alone matches people with that first name, ranked by
 * company hints (tagged PortCos, attendee companies/domains). Placeholders match nobody.
 */
interface RosterIndex { byEmail: Map<string, DirPerson[]>; byName: Map<string, DirPerson[]>; byFirst: Map<string, DirPerson[]> }
// Built once per directory array so a note with many people doesn't rescan every contact.
const rosterIndexes = new WeakMap<object, RosterIndex>();
function rosterIndex(dir: DirPerson[]): RosterIndex {
  const cached = rosterIndexes.get(dir);
  if (cached) return cached;
  const add = (m: Map<string, DirPerson[]>, k: string, d: DirPerson) => { const l = m.get(k); if (l) l.push(d); else m.set(k, [d]); };
  const index: RosterIndex = { byEmail: new Map(), byName: new Map(), byFirst: new Map() };
  for (const d of dir) {
    add(index.byEmail, d.email, d);
    const n = clean(d.name);
    add(index.byName, n, d);
    add(index.byFirst, n.split(" ")[0]!, d);
  }
  rosterIndexes.set(dir, index);
  return index;
}

export function suggestPeople(person: { name: string; email?: string }, dir: DirPerson[], hints: string[] = [], max = 3): DirPerson[] {
  const index = rosterIndex(dir);
  const email = (person.email || "").trim().toLowerCase();
  if (email) {
    const hit = index.byEmail.get(email) || [];
    if (hit.length) return hit.slice(0, max);
  }
  const name = clean(person.name);
  if (!name || isPlaceholderName(name)) return [];
  const parts = name.split(" ");
  const exact = index.byName.get(name) || [];
  if (exact.length || parts.length >= 2) return exact.slice(0, max);
  const first = parts[0]!;
  if (first.length < 2) return [];
  const h = hints.map((x) => clean(x)).filter((x) => x.length >= 2);
  const score = (d: DirPerson) => {
    const co = clean(d.company), dom = d.email.split("@")[1] || "";
    return h.some((x) => (co && (co.includes(x) || x.includes(co))) || (dom && x.includes(dom.split(".")[0]!))) ? 1 : 0;
  };
  return (index.byFirst.get(first) || [])
    .map((d) => ({ d, s: score(d) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.d);
}

/** Index of the roster person a next step's "who" refers to (full or first name), or -1. */
export function resolveWho(who: string, roster: Array<{ name: string; heard?: string }>): number {
  const w = clean(who);
  if (!w) return -1;
  const full = roster.findIndex((r) => [r.name, r.heard].some((n) => n && clean(n) === w));
  if (full >= 0) return full;
  const first = w.split(" ")[0]!;
  const byFirst = roster.map((r, i) => ({ r, i })).filter(({ r }) =>
    [r.name, r.heard].some((n) => n && clean(n).split(" ")[0] === first));
  return byFirst.length === 1 ? byFirst[0]!.i : -1;
}

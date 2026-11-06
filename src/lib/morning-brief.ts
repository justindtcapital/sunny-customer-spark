// Pure helpers for the Morning Brief: parse Claude Cowork's daily email, match
// people/companies to Venture Pulse records and assemble the standing sections.
// No I/O here — the server module supplies the records.

export const BRIEF_SUBJECT = "Daily meeting brief – PortCo & Critical";
export const QUIET_DAYS = { workstream: 21, contact: 45, noteStep: 14 } as const;

export interface CoworkMeeting {
  time: string;
  title: string;
  tags: string[];
  platform: string;
  duration: string;
  text: string;
  /** People from Cowork's "Attendees:" line, with any email it supplied. */
  attendees: CoworkAttendee[];
}
export interface CoworkAttendee { name: string; role: string; email: string }
/** One row of Cowork's "New contacts to add" CSV block at the bottom of the email. */
export interface CoworkContact { name: string; email: string; company: string; title: string; meeting: string }
export interface CoworkBrief { meetings: CoworkMeeting[]; gaps: string; priorities: string[]; intro: string; contacts: CoworkContact[] }

/** Split one CSV line, honouring double quotes. */
function csvCells(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; continue; }
    if (ch === "," && !q) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const CONTACT_COLS: Record<string, keyof CoworkContact | "first" | "last"> = {
  "first name": "first", first: "first", "last name": "last", last: "last", name: "name", "full name": "name",
  email: "email", "email address": "email", company: "company", organization: "company",
  "job title": "title", title: "title", role: "title", meeting: "meeting",
};

/** Parse the CSV rows under "New contacts to add" (header row decides the columns). */
export function parseContactRows(lines: string[]): CoworkContact[] {
  let cols: (keyof CoworkContact | "first" | "last" | undefined)[] | null = null;
  const out: CoworkContact[] = [];
  for (const line of lines) {
    if (!line.includes(",")) continue;
    const cells = csvCells(line);
    const mapped = cells.map((c) => CONTACT_COLS[c.toLowerCase()]);
    if (!cols && mapped.filter(Boolean).length >= 2 && !EMAIL_ONE.test(line)) { cols = mapped; continue; }
    const use = cols || ["first", "last", "email", "company", "title", "meeting"];
    const row: Record<string, string> = {};
    use.forEach((k, i) => { if (k && cells[i]) row[k] = cells[i]; });
    const email = (row.email?.match(EMAIL_ONE)?.[0] || "").toLowerCase();
    const name = (row.name || [row.first, row.last].filter(Boolean).join(" ")).trim() || (email ? nameFromEmail(email) : "");
    // Prose notes after the table ("Matt Darcy is already in your Outlook contacts, so…") aren't rows.
    const rowLike = !!email || (cells.length >= 3 && name.split(/\s+/).length <= 4 && name.length <= 60);
    if (name && rowLike) out.push({ name, email, company: row.company || "", title: row.title || "", meeting: row.meeting || "" });
  }
  return out;
}

/** "12:00 PT Terragrit connect" belongs to the "12:00 PM PT" meeting. */
export const sameMeetingTime = (meetingTime: string, label: string) => {
  const a = /(\d{1,2}):(\d{2})/.exec(meetingTime), b = /(\d{1,2}):(\d{2})/.exec(label);
  return !!a && !!b && Number(a[1]) === Number(b[1]) && a[2] === b[2];
};

const HEADER = /^(\d{1,2}:\d{2}\s*[AP]M(?:\s*[A-Z]{1,4})?)\s*[:–-]\s*(.+?)\s*(?:\(([^)]*)\))?\s*$/i;
const EMAIL_SRC = "[a-z0-9._%+'-]+@[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.[a-z]{2,}";
const EMAIL_ONE = new RegExp(EMAIL_SRC, "i");
const EMAIL_ALL = new RegExp(EMAIL_SRC, "gi");

/** Split on commas/semicolons that sit outside (), <> and []. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if ("(<[".includes(ch)) depth++;
    else if (")>]".includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === "," || ch === ";")) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((p) => p.trim()).filter(Boolean);
}

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
/** "matt.darcy@x.com" → "Matt Darcy" when Cowork gives only an address. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0].replace(/\d+/g, "");
  const parts = local.split(/[._-]+/).filter((p) => p.length > 1);
  return parts.length >= 2 ? titleCase(parts.join(" ").toLowerCase()) : "";
}

/** Parse "Attendees: Matthew Darcy (Director, Strategic Alliances) <matt@x.com>, Vahan Petrosyan (role unknown)". */
export function parseAttendees(line: string): CoworkAttendee[] {
  const body = line.replace(/^attendees?\s*:\s*/i, "");
  return splitTopLevel(body).map((part) => {
    const email = (part.match(EMAIL_ONE)?.[0] || "").toLowerCase().replace(/^mailto:/, "");
    const rest = part.replace(/mailto:/gi, "").replace(EMAIL_ALL, " ").replace(/<\s*>|\[\s*\]/g, " ");
    const roleRaw = (rest.match(/\(([^)]*)\)/)?.[1] || "").replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "").trim();
    const role = /^(role )?unknown$|^n\/?a$/i.test(roleRaw) ? "" : roleRaw;
    let name = rest.replace(/\([^)]*\)/g, " ").replace(/^\s*and\s+/i, "").replace(/[<>[\]"“”]/g, " ").replace(/[\s,;:–—-]+$/g, "").replace(/\s+/g, " ").trim();
    if (!name && email) name = nameFromEmail(email);
    return { name, role, email };
  }).filter((a) => a.name.length >= 3 && /[A-Za-z]/.test(a.name));
}

/** "Name <email>" / "Name (email)" pairs written anywhere in Cowork's prose. */
export function emailsInText(text: string): CoworkAttendee[] {
  const re = new RegExp(`([A-Z][a-z'’-]+(?:\\s+[A-Z][a-z'’-]+){1,2})\\s*(?:\\(([^)@]{2,80})\\)\\s*)?[<(\\[]\\s*(?:mailto:)?(${EMAIL_SRC})\\s*[>)\\]]`, "g");
  return [...text.matchAll(re)].map((m) => ({ name: m[1], role: (m[2] || "").trim(), email: m[3].toLowerCase() }));
}

/** "Matt Darcy" vs "Matthew Darcy": same surname and one first name is a 3+ letter prefix of the other. */
export function sameNickname(a: string, b: string): boolean {
  const pa = norm(a).split(" "), pb = norm(b).split(" ");
  if (pa.length < 2 || pb.length < 2 || pa[pa.length - 1] !== pb[pb.length - 1]) return false;
  const [x, y] = [pa[0], pb[0]].sort((p, q) => p.length - q.length);
  return x.length >= 3 && y.startsWith(x);
}

/** Split Cowork's plain-text email into meetings, gaps and priorities. */
export function parseCoworkBrief(raw: string): CoworkBrief {
  const lines = raw.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const meetings: CoworkMeeting[] = [];
  const priorities: string[] = [];
  const gaps: string[] = [];
  const intro: string[] = [];
  const contactLines: string[] = [];
  let section: "intro" | "meeting" | "gaps" | "priorities" | "contacts" = "intro";
  for (const line of lines) {
    if (!line) continue;
    const h = HEADER.exec(line);
    if (h && line.length < 200) {
      const parts = (h[3] || "").split(",").map((s) => s.trim()).filter(Boolean);
      const tags = parts.filter((p) => /^(portco|critical|network)$/i.test(p));
      const duration = parts.find((p) => /\b(min|hr|hour)/i.test(p)) || "";
      const platform = parts.find((p) => !tags.includes(p) && p !== duration) || "";
      meetings.push({ time: h[1].toUpperCase().replace(/\s+/g, " "), title: h[2], tags, platform, duration, text: "", attendees: [] });
      section = "meeting";
      continue;
    }
    if (/^gaps:?$/i.test(line)) { section = "gaps"; continue; }
    if (/^top priorities:?$/i.test(line)) { section = "priorities"; continue; }
    if (/^(new )?contacts?( to add)?:?$/i.test(line) || /^new contacts\b.*:?$/i.test(line)) { section = "contacts"; continue; }
    if (section === "contacts") { contactLines.push(line); continue; }
    if (section === "meeting" && /^attendees?\s*:/i.test(line)) { const m = meetings[meetings.length - 1]; m.attendees.push(...parseAttendees(line)); continue; }
    if (section === "meeting") { const m = meetings[meetings.length - 1]; m.text = m.text ? `${m.text} ${line}` : line; }
    else if (section === "gaps") gaps.push(line);
    else if (section === "priorities") priorities.push(line.replace(/^\d+[.)]\s*/, ""));
    else intro.push(line);
  }
  return { meetings, gaps: gaps.join(" "), priorities, intro: intro.join(" "), contacts: parseContactRows(contactLines) };
}

const STOP = new Set(["Teams", "Zoom", "Google Meet", "Critical", "PortCo", "Review", "Before", "There", "This", "The", "On", "In", "He", "She", "They", "Confirm", "Check", "Find", "Decide", "Prep", "Industry Icons", "Santa Clara", "Tech Week", "Regional Manager", "Services Sales", "Strategic Alliances", "Global Head"]);
const MONTHS = /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/;

const ORG_WORD = /^(Labs?|Group|Capital|Partners|Ventures|Systems|Technologies|Networks|Realty|Compute|Security|Software|Solutions|Holdings|Inc|Corp|Company|Bank|Fund|University)$/;

/** Capitalized 2–3 word sequences that look like person names. */
export function candidateNames(text: string): string[] {
  const out = new Set<string>();
  const re = /\b([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){1,2})\b/g;
  for (const m of text.matchAll(re)) {
    const name = m[1];
    const words = name.split(/\s+/);
    if (STOP.has(name) || words.some((w) => MONTHS.test(w) || STOP.has(w) || ORG_WORD.test(w))) continue;
    out.add(name);
  }
  return [...out];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Official company names mentioned as whole words in the text. */
export function mentionedCompanies(text: string, names: string[]): string[] {
  const hay = ` ${norm(text)} `;
  return names.filter((n) => { const k = norm(n); return k.length >= 3 && hay.includes(` ${k} `); });
}

/** Company comparison key: ignores a leading "The" and legal suffixes ("The Redesign Group" = "Redesign Group Inc"). */
export const companyKey = (s: string) => norm(s).replace(/^the /, "").replace(/ (inc|llc|ltd|corp|corporation|co|plc|gmbh)$/, "");

/** First `max` sentences of a profile, never cut mid-sentence. */
export function firstSentences(text: string, max = 2): string {
  return text.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0, max).join(" ").trim();
}

const INTERNAL_ORGS = new Set(["dell", "dell technologies", "dell technologies capital", "dt capital", "dtc", "dts"]);
export const isInternalOrg = (name: string) => INTERNAL_ORGS.has(norm(name)) || /^dell\b/.test(norm(name));

/** PortCos the meeting is about (named in the title) vs. ones only mentioned in Cowork's notes. */
export function splitPortcos(title: string, text: string, names: string[], opts: { portcoTag: boolean; hasExternal: boolean }): { primary: string[]; mentioned: string[] } {
  const inTitle = mentionedCompanies(title, names);
  const inText = mentionedCompanies(text, names).filter((n) => !inTitle.includes(n));
  if (inTitle.length || opts.hasExternal || !opts.portcoTag) return { primary: inTitle, mentioned: inText };
  return { primary: inText.slice(0, 1), mentioned: inText.slice(1) };
}

/** Company named after the last comma of a meeting title ("Matt Darcy, Digital Realty"). */
export function titleCompany(title: string): string {
  const i = title.lastIndexOf(",");
  if (i < 0) return "";
  const c = title.slice(i + 1).trim();
  return c.length >= 2 && c.length <= 60 && !/\d{1,2}:\d{2}/.test(c) ? c : "";
}

const SCHEDULING = [
  /\b(invite|invitation|placeholder|reschedul\w*|slot)\b/i,
  /\b(offer(?:ed|s)?|propos(?:ed|es)|suggest(?:ed|s)?)\b[^.]*\b(move|times?|next week|\d{1,2}(:\d{2})?)\b/i,
  /\bmove (it|the (call|meeting))\b/i,
  /\b\d{1,2}(:\d{2})?\s*(ET|PT|CT|MT|EST|PST|EDT|PDT)\b/,
  /\bflight\b/i,
  /\b(confirm(?:ed)?|accepted)\b[^.]*\b(time|Monday|Tuesday|Wednesday|Thursday|Friday)\b/i,
  /\byou accepted\b/i,
];
/** Drop calendar back-and-forth (offered times, moves, invites) from Cowork's prose; keeps discussion and history. */
export function stripScheduling(text: string): string {
  return text.split(/(?<=[.!?])\s+(?=[A-Z(])/).filter((s) => !SCHEDULING.some((re) => re.test(s))).join(" ").trim();
}

export interface PersonRecord { id: string; name: string; company: string; email: string; title?: string; temperature?: string; lastContact?: string; urid?: string }
export interface PersonMatch { name: string; contact?: PersonRecord; possible?: PersonRecord[]; teammate?: boolean }

/**
 * Email first (Cowork's address for that person), then unique full-name match;
 * several same-name rows, or one nickname-compatible row ("Matthew" ↔ "Matt"), stay "possible".
 */
export function matchPeople(names: string[], contacts: PersonRecord[], isTeammate: (name: string) => boolean, emails: Record<string, string> = {}): PersonMatch[] {
  const byName = new Map<string, PersonRecord[]>();
  const byEmail = new Map<string, PersonRecord[]>();
  for (const c of contacts) {
    const k = norm(c.name); if (k) byName.set(k, [...(byName.get(k) || []), c]);
    const e = (c.email || "").trim().toLowerCase(); if (e) byEmail.set(e, [...(byEmail.get(e) || []), c]);
  }
  return names.map((name) => {
    if (isTeammate(name)) return { name, teammate: true };
    const email = emails[norm(name)];
    if (email) {
      const hits = byEmail.get(email) || [];
      if (hits.length === 1) return { name, contact: hits[0] };
      if (hits.length > 1) return { name, possible: hits };
    }
    const hits = byName.get(norm(name)) || [];
    if (hits.length === 1) return { name, contact: hits[0] };
    if (hits.length > 1) return { name, possible: hits };
    const nick = contacts.filter((c) => sameNickname(c.name, name));
    if (nick.length) return { name, possible: nick };
    return { name };
  });
}

/** Pull a role/company hint for an unknown person from Cowork's prose. */
export function personHints(name: string, text: string, meetingTitle: string): { title: string; company: string } {
  const first = name.split(/\s+/)[0];
  const role = new RegExp(`(?:${name}|${first}) is (?:the |a |an )?([A-Z][^.,;]{2,60})`).exec(text)?.[1]?.trim() || "";
  const inParen = new RegExp(`${name} \\(([^)]{2,60})\\)`).exec(text)?.[1]?.trim() || "";
  const header = meetingTitle.includes(",") && meetingTitle.toLowerCase().includes(first.toLowerCase()) ? meetingTitle.split(",").slice(1).join(",").trim() : "";
  const roleCompany = /(.+?),\s*(.+)/.exec(role);
  return { title: roleCompany ? roleCompany[1] : role || inParen, company: header || (roleCompany ? roleCompany[2] : "") };
}

const day = (s?: string) => (s || "").slice(0, 10);
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${day(b)}T12:00:00Z`) - Date.parse(`${day(a)}T12:00:00Z`)) / 86_400_000);
}
/** Sunday of the week containing `today` (weeks run Mon–Sun). */
export function weekEnd(today: string): string {
  const d = new Date(`${today}T12:00:00Z`);
  const add = (7 - d.getUTCDay()) % 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

export interface DueItem { id: string; summary: string; person: string; company: string; due: string; overdue: boolean }
/** Open actions due on or before this Sunday, overdue first then by date. */
export function dueThisWeek<T extends { id: string; summary: string; person: string; company: string; due: string }>(rows: T[], today: string): DueItem[] {
  const end = weekEnd(today);
  return rows.filter((r) => day(r.due) && day(r.due) <= end)
    .map((r) => ({ id: r.id, summary: r.summary, person: r.person, company: r.company, due: day(r.due), overdue: day(r.due) < today }))
    .sort((a, b) => a.due.localeCompare(b.due));
}

export interface QuietItem { kind: "workstream" | "contact" | "note-step"; label: string; detail: string; days: number; weight: number; link?: string }
export interface QuietInput {
  today: string;
  workstreams: { gid: string; company: string; name: string; lastActivity: string; status: string; priority: string; active: boolean; url?: string }[];
  contacts: { id: string; name: string; company: string; temperature?: string; lastContact?: string; portco?: boolean }[];
  noteSteps: { id: string; title: string; person: string; company: string; date: string; resolved: boolean }[];
  nmCompanies: Set<string>;
}
/** Things that have gone quiet, most important first, capped at `limit`. */
export function anticipatedFollowUps(input: QuietInput, limit = 8): QuietItem[] {
  const out: QuietItem[] = [];
  const { today } = input;
  for (const w of input.workstreams) {
    if (!w.active || !w.lastActivity) continue;
    const d = daysBetween(w.lastActivity, today);
    if (d >= QUIET_DAYS.workstream) out.push({ kind: "workstream", label: `${w.company} — ${w.name}`, detail: `No workstream update in ${d} days (${w.status || "status not set"})`, days: d, weight: (input.nmCompanies.has(norm(w.company)) ? 3 : 1) + (/high|p1/i.test(w.priority) ? 1 : 0), link: w.url });
  }
  for (const c of input.contacts) {
    if (!(c.temperature === "Hot" || c.temperature === "Warm" || c.temperature === "Council" || c.portco) || !c.lastContact) continue;
    const d = daysBetween(c.lastContact, today);
    if (d >= QUIET_DAYS.contact) out.push({ kind: "contact", label: `${c.name}${c.company ? `, ${c.company}` : ""}`, detail: `${c.portco ? "PortCo contact" : c.temperature} · last touch ${d} days ago`, days: d, weight: c.temperature === "Hot" || c.temperature === "Council" ? 3 : c.portco ? 2 : 1 });
  }
  for (const s of input.noteSteps) {
    if (s.resolved || !s.date) continue;
    const d = daysBetween(s.date, today);
    if (d >= QUIET_DAYS.noteStep) out.push({ kind: "note-step", label: s.title, detail: `Next step from notes${s.person ? ` with ${s.person}` : ""}, open ${d} days`, days: d, weight: input.nmCompanies.has(norm(s.company)) ? 3 : 2 });
  }
  return out.sort((a, b) => b.weight - a.weight || b.days - a.days).slice(0, limit);
}

/** Next events from today, skipping declined ones. */
export function nextEvents<T extends { start: string; end: string; dtcStatus?: string }>(events: T[], today: string, limit = 5, horizonDays = 30): T[] {
  return events.filter((e) => e.start && (e.end || e.start) >= today && daysBetween(today, e.start) <= horizonDays && !/declined/i.test(e.dtcStatus || ""))
    .sort((a, b) => a.start.localeCompare(b.start)).slice(0, limit);
}

/** Investment fields for the PortCo status strip ("Not recorded" when blank). */
export function investmentStrip(fields: Record<string, string> = {}, overrides: Record<string, string> = {}) {
  const lowered: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...fields, ...overrides })) if (v) lowered[k.toLowerCase().trim()] = v;
  const look = (...keys: string[]) => keys.map((k) => lowered[k.toLowerCase()]).find(Boolean) || "";
  const own = look("DTC Ownership");
  const n = parseFloat(own.replace(/[%,\s]/g, ""));
  const ownership = !own ? "" : isNaN(n) ? own : `${parseFloat((n <= 1 ? n * 100 : n).toFixed(2))}%`;
  const inv = look("DTC Investment ($M)", "DTC Investment");
  return {
    priority: look("DTC Priority"),
    stage: look("Company Stage", "Stage"),
    ownership: ownership || "Not recorded",
    investment: inv ? (/^\d/.test(inv) ? `$${inv}M` : inv) : "Not recorded",
    round: look("Latest Round", "Funding Round", "Last Round", "Round", "Series") || "Not recorded",
    investors: look("Lead Investor", "Lead Investors", "Co-Investors", "Investors") || "Not recorded",
  };
}

export interface WorkstreamText { gid: string; company: string; name: string; nextSteps?: string; notes?: string; dellStakeholders?: string; dellTargets?: string; targets?: string; traction?: string }
/**
 * Workstreams (any PortCo) whose name, next steps, notes or targets mention the meeting's
 * company or one of its people by full name. `excludeCompanies` drops the PortCos whose own
 * workstreams are already on the card. Whole-word matches only; 4+ letter company keys.
 */
export function relatedWorkstreams<T extends WorkstreamText>(rows: T[], opts: { companies: string[]; people: string[]; excludeCompanies?: string[] }, limit = 6): T[] {
  const keys = [...new Set(opts.companies.map(companyKey).filter((k) => k.length >= 4 && !isInternalOrg(k)))];
  const names = [...new Set(opts.people.map(norm).filter((n) => n.split(" ").length >= 2))];
  if (!keys.length && !names.length) return [];
  const skip = new Set((opts.excludeCompanies || []).map(companyKey));
  return rows.filter((w) => {
    if (skip.has(companyKey(w.company))) return false;
    const hay = ` ${norm([w.name, w.nextSteps, w.notes, w.dellStakeholders, w.dellTargets, w.targets, w.traction].filter(Boolean).join(" "))} `;
    return keys.some((k) => hay.includes(` ${k} `)) || names.some((n) => hay.includes(` ${n} `));
  }).slice(0, limit);
}

/** NM / NU / BB badge from a DTC priority value. */
export function priorityBadge(priority: string): "NM" | "NU" | "BB" | "" {
  if (/needle/i.test(priority)) return "NM";
  if (/nurture/i.test(priority)) return "NU";
  if (/back\s*burner/i.test(priority)) return "BB";
  return "";
}

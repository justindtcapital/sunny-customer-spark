/**
 * "Before → this action → next" for one follow-up in My Actions (pure, browser-safe).
 *
 * A follow-up scheduled when another one is completed points back at it
 * (recordId = the completed follow-up's id), so the chain can be shown both ways
 * and a workstream link carries forward without a second write.
 */

export interface ThreadOrigin {
  /** What kind of thing came before, e.g. "Meeting note", "Previous step". */
  label: string;
  title: string;
  /** YYYY-MM-DD, or "". */
  date: string;
  /** What happened / why this follow-up exists, in the team's words. */
  text: string;
}

const SOURCE_LABEL: Record<string, string> = {
  granola: "Meeting note", "drive-doc": "Meeting note", upload: "Uploaded note",
  "gmail-bd": "Email", "gmail-gtm": "Email", "gmail-workstreams": "Email", "gmail-network": "Network email", "gmail-news": "News email",
};

const day = (v?: string) => (v || "").slice(0, 10);
const AFTER = /^After "(.+?)"(?:\s+—\s+|$)/;

/** Drops machine wording ("Follow-up set from Action with V.I.C. (followup): …") so only the human words remain. */
export function originText(summary: string): string {
  return (summary || "")
    .replace(AFTER, "")
    // Harvest boilerplate that only repeats the note title and due date shown elsewhere.
    .replace(/^Follow-up from ".*?"(?:\s+—\s+due \S+)?\.?\s*/i, "")
    .replace(/^Follow-up (?:set|created) (?:from|via) (?:Action with V\.I\.C\.|Vic|V\.I\.C\.)(?: \([^)]*\))?:?\s*/i, "")
    .trim();
}

/** Where a harvested follow-up came from: the completed step before it, its source note, or how it was created. */
export function followUpOrigin(
  a: { recordId: string; summary: string; createdAt?: string },
  record?: { sourceType: string; title: string; date: string },
  prior?: { title: string; resolvedAt?: string; date?: string },
): ThreadOrigin {
  const text = originText(a.summary);
  if (prior) return { label: "Previous step", title: prior.title, date: day(prior.resolvedAt || prior.date), text };
  if (record) return { label: SOURCE_LABEL[record.sourceType] || "Note", title: record.title, date: day(record.date), text };
  const after = AFTER.exec(a.summary || "");
  if (after) return { label: "Previous step", title: after[1]!, date: day(a.createdAt), text };
  if (a.recordId.startsWith("ws:")) return { label: "Added on the workstream", title: "", date: day(a.createdAt), text };
  if (a.recordId.startsWith("vic:")) return { label: "Created with V.I.C.", title: "", date: day(a.createdAt), text };
  return { label: "Created", title: "", date: day(a.createdAt), text };
}

/**
 * Workstream a chained follow-up belongs to: walks back through earlier steps
 * (each one's saved workstream, else its ws:<gid> source) — a few hops at most.
 */
export function inheritedWorkstream(recordId: string, prior: (id: string) => { recordId: string; workstreamGid?: string } | undefined): string {
  let id = recordId;
  for (let hop = 0; hop < 6 && id; hop++) {
    if (id.startsWith("ws:")) return id.slice(3);
    const p = prior(id);
    if (!p) return "";
    if (p.workstreamGid) return p.workstreamGid;
    id = p.recordId;
  }
  return "";
}

type ThreadItem = { id: string; activityId?: string; recordId?: string; workstreamGid?: string; email?: string; due: string; summary: string; person: string };
const gidOf = (x: ThreadItem) => x.workstreamGid || (x.recordId?.startsWith("ws:") ? x.recordId.slice(3) : "");

/** The open follow-up that comes after this one: scheduled from it, else the next due on the same workstream or with the same person. */
export function nextInThread<T extends ThreadItem>(x: T, all: T[]): T | undefined {
  const others = all.filter((o) => o.id !== x.id);
  const byDue = (a: T, b: T) => (a.due || "9999").localeCompare(b.due || "9999");
  const own = x.activityId || x.id;
  const chained = others.filter((o) => o.recordId === own).sort(byDue)[0];
  if (chained) return chained;
  const gid = gidOf(x);
  const email = (x.email || "").toLowerCase();
  const later = (o: T) => !!o.due && (!x.due || o.due.slice(0, 10) >= x.due.slice(0, 10));
  return others.filter((o) => later(o) && ((gid && gidOf(o) === gid) || (!!email && (o.email || "").toLowerCase() === email))).sort(byDue)[0];
}

/** Quick follow-up dates offered after completing (YYYY-MM-DD, counted from today). */
export function quickFollowUpDates(today: string): { label: string; date: string }[] {
  const add = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const month = (() => {
    const [y, m, d] = today.split("-").map(Number) as [number, number, number];
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(d, last), 12)).toISOString().slice(0, 10);
  })();
  return [
    { label: "Tomorrow", date: add(1) },
    { label: "In 3 days", date: add(3) },
    { label: "1 week", date: add(7) },
    { label: "2 weeks", date: add(14) },
    { label: "1 month", date: month },
  ];
}

/** Suggested title for the follow-up scheduled after completing one. */
export function nextStepTitle(x: { summary: string; person: string; contactName?: string }, isTeammate: (name: string) => boolean = () => false): string {
  const raw = x.contactName || x.person;
  const who = raw && !isTeammate(raw) ? raw : "";
  const base = (x.summary || "").replace(/^follow[- ]?up( with)?:?\s*/i, "").trim();
  const t = who && !/[,;]/.test(who) && who.length <= 60 ? `Follow up with ${who}` : base ? `Follow up: ${base}` : "Follow up";
  return t.slice(0, 300);
}

/** Follow-up summary that keeps the chain readable even when the earlier step can't be looked up. */
export function nextStepSummary(priorTitle: string, note: string): string {
  const t = priorTitle.replace(/"/g, "'").trim().slice(0, 200);
  return `After "${t}"${note.trim() ? ` — ${note.trim().slice(0, 1500)}` : ""}`;
}

/** "Before" for any follow-up in the list: the server-read origin, else what its source record says. */
export function reminderBefore(x: { source: string; origin?: ThreadOrigin; date?: string; summary: string; originalNote?: string }): ThreadOrigin | null {
  if (x.origin) return x.origin;
  if (x.source === "Network") return { label: "Contact note", title: "", date: day(x.date), text: x.originalNote && x.originalNote !== x.summary ? x.originalNote : "" };
  if (x.source === "Campaign") return { label: "Campaign", title: x.summary, date: "", text: "" };
  if (x.source === "Prospecting") return { label: "Prospecting", title: x.summary, date: "", text: "" };
  return null;
}

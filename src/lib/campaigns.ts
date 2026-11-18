// Shared (client-safe) Campaign Builder model + pure helpers.
import { targetKeyOf } from "./types";

/** One per campaign type; older purposes still read. */
export const CAMPAIGN_PURPOSES = [
  "Event outreach",
  "Event follow-up",
  "Network outreach",
  "Business development",
] as const;

export const CAMPAIGN_TEAM = ["Chris Falloon", "Chris Hillock", "Shane Earley", "Julia Beech"];

/** "done" = legacy "actioned" (messages sent, results still open); "closed" = results final. */
export type CampaignStatus = "draft" | "saved" | "actioning" | "done" | "closed";
export type CampaignChannel = "email" | "linkedin" | "both";
export type MemberKind = "network" | "prospect";

export interface CampaignRecord {
  id: string;
  name: string;
  purpose: string;
  events: string[];
  portcos: string[];
  owner: string;
  channel: CampaignChannel;
  templateSubject: string;
  templateBody: string;
  status: CampaignStatus;
  created: string;
  updated: string;
  createdBy: string;
  memberCount?: number;
}

export interface CampaignMember {
  campaignId: string;
  personKey: string;
  kind: MemberKind;
  name: string;
  email: string;
  title: string;
  company: string;
  linkedin: string;
  added: string;
  subject: string;
  body: string;
  sentChannel: string;
  sentDate: string;
  followUpOwner: string;
  followUpDue: string;
}

/** A person staged in the wizard before being saved as a member. */
export interface CandidatePerson {
  name: string;
  email: string;
  title: string;
  company: string;
  linkedin: string;
  location?: string;
  sector?: string;
  /** Where they came from in this build round. */
  origin: "network" | "prospect" | "sumble" | "apollo" | "upload";
  /** Set for network/prospect rows that already exist in Venture Pulse. */
  urid?: string;
}

export function personKeyOf(p: { email?: string; name?: string; company?: string }): string {
  return targetKeyOf(p);
}

/** Merge candidates into a list, de-duplicating by email, then name|company.
 *  Existing entries win (an internal record beats a search hit for the same person). */
export function mergeCandidates(
  existing: CandidatePerson[],
  incoming: CandidatePerson[],
  alreadyMemberKeys: Set<string> = new Set(),
): { list: CandidatePerson[]; added: number; skipped: number } {
  const list = [...existing];
  const seen = new Set<string>();
  const seenNameCo = new Set<string>();
  const nameCo = (p: CandidatePerson) =>
    `${p.name.trim().toLowerCase()}|${p.company.trim().toLowerCase()}`;
  for (const p of list) {
    seen.add(personKeyOf(p));
    seenNameCo.add(nameCo(p));
  }
  let added = 0;
  let skipped = 0;
  for (const p of incoming) {
    if (!p.name.trim() && !p.email.trim()) {
      skipped++;
      continue;
    }
    const k = personKeyOf(p);
    if (seen.has(k) || seenNameCo.has(nameCo(p)) || alreadyMemberKeys.has(k)) {
      skipped++;
      continue;
    }
    seen.add(k);
    seenNameCo.add(nameCo(p));
    list.push(p);
    added++;
  }
  return { list, added, skipped };
}

export type FollowUpUnit = "days" | "weeks" | "months";

/** Due date (YYYY-MM-DD) `amount` units after `from`. */
export function followUpDueDate(from: Date, amount: number, unit: FollowUpUnit): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const n = Math.max(0, Math.floor(amount || 0));
  if (unit === "days") d.setUTCDate(d.getUTCDate() + n);
  else if (unit === "weeks") d.setUTCDate(d.getUTCDate() + n * 7);
  else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + n);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  return d.toISOString().slice(0, 10);
}

/** Fill {{first_name}}, {{name}}, {{title}}, {{company}} placeholders. */
export function fillTemplate(
  text: string,
  p: { name: string; title?: string; company?: string },
): string {
  const first = p.name.trim().split(/\s+/)[0] || "there";
  return text
    .replace(/\{\{\s*first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*name\s*\}\}/gi, p.name.trim() || first)
    .replace(/\{\{\s*title\s*\}\}/gi, (p.title || "").trim() || "your role")
    .replace(/\{\{\s*company\s*\}\}/gi, (p.company || "").trim() || "your company");
}

/** Outlook separates recipients with semicolons; it doesn't read commas. */
export const OUTLOOK_ADDRESS_SEPARATOR = ";";

/** Trimmed, de-duplicated (case-insensitive) addresses joined for Outlook. */
export function joinAddresses(emails: string[], separator = OUTLOOK_ADDRESS_SEPARATOR): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const e = (raw || "").trim();
    if (!e || !e.includes("@") || seen.has(e.toLowerCase())) continue;
    seen.add(e.toLowerCase());
    out.push(e);
  }
  return out.join(separator);
}

/** Outlook-friendly mailto link (opens a new message for editing). Recipients are
 *  separated by semicolons so Outlook recognises every address. */
export function mailtoLink(
  to: string | string[],
  subject: string,
  body: string,
  opts: { cc?: string[]; bcc?: string[] } = {},
): string {
  const enc = (s: string) => encodeURIComponent(s);
  const list = (xs: string[]) =>
    joinAddresses(xs)
      .split(OUTLOOK_ADDRESS_SEPARATOR)
      .filter(Boolean)
      .map(enc)
      .join(OUTLOOK_ADDRESS_SEPARATOR);
  const toList = list(Array.isArray(to) ? to : [to]);
  const params = [
    opts.cc?.length ? `cc=${list(opts.cc)}` : "",
    opts.bcc?.length ? `bcc=${list(opts.bcc)}` : "",
    `subject=${enc(subject)}`,
    `body=${enc(body.replace(/\r?\n/g, "\r\n"))}`,
  ].filter(Boolean);
  return `mailto:${toList}?${params.join("&")}`;
}

/** How a campaign's emails go out. */
export type CampaignSendMode = "individual" | "company" | "bcc";

export const CAMPAIGN_SEND_MODES: Array<{ value: CampaignSendMode; label: string; hint: string }> = [
  { value: "individual", label: "Individual emails", hint: "One email per person, using their own draft." },
  { value: "company", label: "One email per company", hint: "People at the same company share one email; they can see each other." },
  { value: "bcc", label: "One email, everyone in BCC", hint: "One email to you, with everyone blind-copied. Nobody sees the other recipients." },
];

/** "Ann", "Ann and Bo", "Ann, Bo and Cy". */
export function listNames(names: string[]): string {
  const xs = names.map((n) => n.trim()).filter(Boolean);
  if (xs.length <= 1) return xs[0] || "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** Fill the template for several people in one email (greets them all by first name). */
export function fillGroupTemplate(
  text: string,
  people: Array<{ name: string; title?: string; company?: string }>,
): string {
  if (people.length === 1) return fillTemplate(text, people[0]);
  const firsts = listNames(people.map((p) => p.name.trim().split(/\s+/)[0] || ""));
  const fulls = listNames(people.map((p) => p.name));
  const companies: string[] = [];
  for (const p of people) {
    const c = (p.company || "").trim();
    if (c && !companies.some((x) => x.toLowerCase() === c.toLowerCase())) companies.push(c);
  }
  return text
    .replace(/\{\{\s*first_name\s*\}\}/gi, firsts || "all")
    .replace(/\{\{\s*name\s*\}\}/gi, fulls || firsts || "all")
    .replace(/\{\{\s*title\s*\}\}/gi, "your role")
    .replace(/\{\{\s*company\s*\}\}/gi, companies.length === 1 ? companies[0] : "your company");
}

/** Placeholders like {{city}} still left in a message (to fix before sending). */
export function unfilledPlaceholders(text: string): string[] {
  return [...new Set((text.match(/\{\{\s*[\w.-]+\s*\}\}/g) || []).map((x) => x.replace(/\s+/g, "")))];
}

/** The value every person shares (e.g. the same personalised subject), else "". */
function sharedValue(values: string[]): string {
  const v = values[0] || "";
  return v.trim() && values.every((x) => x === v) ? v : "";
}

export interface CampaignEmailBatch {
  key: string;
  label: string;
  to: string[];
  bcc: string[];
  members: CampaignMember[];
  subject: string;
  body: string;
}

const companyGroupKey = (m: CampaignMember) => (m.company || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Split a campaign's members into the emails to open for a send mode. People
 * without an email are left out (counted in `skipped`). Individual emails and
 * one-person company emails use the person's own draft; shared emails use the
 * text all their drafts share (e.g. one personalised subject), else the template,
 * so nobody gets another person's personalised text. BCC mode addresses
 * the sender so the message has a visible recipient.
 */
export function campaignEmailBatches(
  members: CampaignMember[],
  mode: CampaignSendMode,
  draftFor: (m: CampaignMember) => { subject: string; body: string },
  template: { subject: string; body: string },
  sender = "",
): { batches: CampaignEmailBatch[]; skipped: number } {
  const withEmail = members.filter((m) => (m.email || "").includes("@"));
  const skipped = members.length - withEmail.length;
  if (mode === "bcc") {
    if (!withEmail.length) return { batches: [], skipped };
    return {
      skipped,
      batches: [
        {
          key: "bcc:all",
          label: `Everyone (${withEmail.length})`,
          to: sender.includes("@") ? [sender] : [],
          bcc: withEmail.map((m) => m.email),
          members: withEmail,
          subject: sharedValue(withEmail.map((m) => draftFor(m).subject)) || fillTemplate(template.subject, { name: "" }),
          body: sharedValue(withEmail.map((m) => draftFor(m).body)) || fillTemplate(template.body, { name: "" }),
        },
      ],
    };
  }
  if (mode === "individual") {
    return {
      skipped,
      batches: withEmail.map((m) => ({
        key: `person:${m.personKey}`,
        label: m.name || m.email,
        to: [m.email],
        bcc: [],
        members: [m],
        ...draftFor(m),
      })),
    };
  }
  const groups = new Map<string, CampaignMember[]>();
  for (const m of withEmail) {
    const k = companyGroupKey(m) || `person:${m.personKey}`;
    groups.set(k, [...(groups.get(k) || []), m]);
  }
  const batches: CampaignEmailBatch[] = [...groups.entries()].map(([k, ms]) => {
    const company = ms.find((m) => m.company.trim())?.company.trim() || "";
    const shared = ms.length > 1;
    return {
      key: `company:${k}`,
      label: shared ? `${company} (${ms.length})` : company ? `${company} · ${ms[0].name}` : ms[0].name || ms[0].email,
      to: ms.map((m) => m.email),
      bcc: [],
      members: ms,
      ...(shared
        ? {
            subject: sharedValue(ms.map((m) => draftFor(m).subject)) || fillGroupTemplate(template.subject, ms),
            body: sharedValue(ms.map((m) => draftFor(m).body)) || fillGroupTemplate(template.body, ms),
          }
        : draftFor(ms[0])),
    };
  });
  batches.sort((a, b) => b.members.length - a.members.length || a.label.localeCompare(b.label));
  return { batches, skipped };
}

/** Very small CSV parser (quoted fields supported) → candidate people. */
export function parseCandidateCsv(text: string): CandidatePerson[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === "\t") {
      cur.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
    } else field += c;
  }
  if (field || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim()));
  if (nonEmpty.length < 2) return [];
  const h = nonEmpty[0].map((x) => x.trim().toLowerCase());
  const find = (...names: RegExp[]) => h.findIndex((x) => names.some((n) => n.test(x)));
  const iFirst = find(/^first/);
  const iLast = find(/^last/);
  const iName = find(/^(full )?name$/, /^contact( name)?$/);
  const iEmail = find(/e-?mail/);
  const iCo = find(/company|organi[sz]ation|account/);
  const iTitle = find(/title|role|position/);
  const iLi = find(/linkedin/);
  const iLoc = find(/location|city/);
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] || "").trim() : "");
  return nonEmpty.slice(1).map((r) => ({
    name: get(r, iName) || `${get(r, iFirst)} ${get(r, iLast)}`.trim(),
    email: get(r, iEmail),
    company: get(r, iCo),
    title: get(r, iTitle),
    linkedin: get(r, iLi),
    location: get(r, iLoc),
    origin: "upload" as const,
  }));
}

export interface CampaignSummary {
  total: number;
  network: number;
  prospect: number;
  contacted: number;
  personalized: number;
  openFollowUps: number;
  followUpOwners: string[];
  nextFollowUp: string;
}

/** Size + progress numbers for one campaign's members. */
export function summarizeMembers(members: CampaignMember[]): CampaignSummary {
  const fu = members.filter((m) => m.followUpDue);
  const dues = fu.map((m) => m.followUpDue).sort();
  return {
    total: members.length,
    network: members.filter((m) => m.kind === "network").length,
    prospect: members.filter((m) => m.kind !== "network").length,
    contacted: members.filter((m) => m.sentDate || m.sentChannel).length,
    personalized: members.filter((m) => m.body.trim()).length,
    openFollowUps: fu.length,
    followUpOwners: [...new Set(fu.map((m) => m.followUpOwner).filter(Boolean))],
    nextFollowUp: dues[0] || "",
  };
}

/** 1-based sheet row numbers (header = row 1) of member rows for `campaignId`. */
export function memberRowsFor(campaignIds: string[], campaignId: string): number[] {
  const out: number[] = [];
  campaignIds.forEach((id, i) => {
    if ((id || "").trim() === campaignId) out.push(i + 2);
  });
  return out;
}

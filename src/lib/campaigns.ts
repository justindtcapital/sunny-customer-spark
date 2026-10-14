// Shared (client-safe) Campaign Builder model + pure helpers.
import { targetKeyOf } from "./types";

export const CAMPAIGN_PURPOSES = [
  "Outreach",
  "Business development",
  "Network building",
  "Event",
  "Event follow-up",
  "Demand gen",
  "PortCo demand gen",
  "General follow-up",
] as const;

export const CAMPAIGN_TEAM = ["Chris Falloon", "Chris Hillock", "Shane Earley", "Julia Beech"];

export type CampaignStatus = "draft" | "saved" | "actioning" | "done";
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

/** Outlook-friendly mailto link (opens a new message for editing). */
export function mailtoLink(to: string, subject: string, body: string): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, "%20");
  return `mailto:${encodeURIComponent(to.trim())}?subject=${enc(subject)}&body=${enc(body.replace(/\r?\n/g, "\r\n"))}`;
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

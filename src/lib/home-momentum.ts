import type { Contact, TargetLead, AsanaEvent, PortfolioCompany } from "./types";
import type { Workstream } from "./workstream-parse";
import { workstreamBarStatus } from "./workstream-parse";
import { parseToIsoDate } from "./sheet-date";
import { ownerMatches, teamProfile, isMyContact } from "./user-ownership";
import type { CampaignRecord, CampaignMember } from "./campaigns";

export type HomeScope = "mine" | "team";
export type HomePeriod = "week" | "month";
export const REPORTING_TIMEZONE = "America/Los_Angeles";

export function reportingDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: REPORTING_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function periodBounds(now: Date, period: HomePeriod) {
  const today = reportingDay(now);
  const date = new Date(`${today}T12:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  const monday = new Date(date.getTime() - offset * 86400000).toISOString().slice(0, 10);
  const weekEnd = new Date(Date.parse(`${monday}T12:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10);
  return { today, start: period === "week" ? monday : `${today.slice(0, 7)}-01`, monday, weekEnd };
}
export function dateKey(value?: string): string {
  if (!value) return "";
  if (value.includes("T")) {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? reportingDay(d) : "";
  }
  return parseToIsoDate(value) || "";
}
export function inPeriod(value: string | undefined, start: string, end: string) {
  const day = dateKey(value);
  return !!day && day >= start && day <= end;
}
export function activeWorkstream(w: Workstream): boolean {
  const status = workstreamBarStatus(w);
  if (["Working to Complete", "Stalled", "Early Conversations"].some((s) => s.toLowerCase() === status.toLowerCase())) return true;
  return status !== "Completed" && !/not started|not set|early|hold|blocked|stalled/i.test(status) && /active|progress|working|ongoing|started/i.test(status);
}
export interface HomeReminder {
  id: string;
  person: string;
  company: string;
  owner: string;
  due: string;
  source: "Network" | "Prospecting" | "Campaign" | "Notes";
  summary: string;
  email?: string;
  targetKey?: string;
  campaignId?: string;
  activityId?: string;
  sourceUrl?: string;
  originalNote?: string;
  date?: string;
}
export function reminderBucket(due: string, today: string, weekEnd: string): "due" | "overdue" | "undated" | "later" {
  const day = dateKey(due);
  return !day ? "undated" : day < today ? "overdue" : day <= weekEnd ? "due" : "later";
}
/** Campaigns store the same reminder on the person; show the person copy once. */
export function dedupeReminders(items: HomeReminder[]): HomeReminder[] {
  const direct = items.filter((i) => i.source !== "Campaign");
  const personKey = (i: HomeReminder) => (i.email || i.targetKey || i.person).trim().toLowerCase();
  const seen = new Set(direct.map((i) => `${personKey(i)}:${dateKey(i.due)}`));
  return [...direct, ...items.filter((i) => {
    if (i.source !== "Campaign") return false;
    const key = `${personKey(i)}:${dateKey(i.due)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })].sort((a, b) => (dateKey(a.due) || "9999").localeCompare(dateKey(b.due) || "9999") || a.person.localeCompare(b.person));
}

export interface MomentumInput {
  contacts: Contact[];
  targets: TargetLead[];
  companies: PortfolioCompany[];
  events: AsanaEvent[];
  workstreams: Workstream[];
  campaigns: CampaignRecord[];
  members: CampaignMember[];
  ownedGids: string[];
}
export function scopeMomentum(input: MomentumInput, scope: HomeScope, email: string) {
  const profile = teamProfile(email);
  const owned = new Set(input.ownedGids);
  const matches = (owner?: string) => scope === "team" || (!!profile && ownerMatches(owner, profile));
  const contacts = input.contacts.filter((c) => (c.sector || "").toLowerCase() !== "portfolio" && (scope === "team" || (!!profile && isMyContact(c, owned, profile))));
  const workstreams = input.workstreams.filter((w) => matches(w.owner));
  const campaigns = input.campaigns.filter((c) => matches(c.owner));
  const events = input.events.filter((e) => matches(e.owner));
  const companyNames = new Set([...workstreams.map((w) => w.company), ...campaigns.flatMap((c) => c.portcos), ...events.flatMap((e) => e.portcos)].map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, "")));
  return { ...input, contacts, workstreams, campaigns, events,
    targets: input.targets.filter((t) => matches(t.prime)),
    companies: input.companies.filter((c) => scope === "team" || companyNames.has(c.name.toLowerCase().replace(/[^a-z0-9]/g, ""))),
  };
}
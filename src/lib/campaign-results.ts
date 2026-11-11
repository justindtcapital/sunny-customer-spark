// Campaign types, results and close rules (pure, client-safe).
import { initialsOf } from "./workstream-parse";
import { canonicalOwnerName } from "./user-ownership";

export const CAMPAIGN_TYPES = ["Event", "EventFollowUp", "Network", "BD"] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

/** Display names for the three campaign types. */
export const CAMPAIGN_TYPE_LABEL: Record<CampaignType, string> = {
  Event: "Event outreach",
  EventFollowUp: "Event follow-up",
  Network: "Network outreach",
  BD: "Business development",
};

/**
 * Type worked out from the campaign's purpose — no stored field needed.
 * Four types: demand gen counts as Event outreach; anything else that isn't event or BD is Network outreach.
 */
export function campaignTypeOf(purpose: string): CampaignType {
  const p = (purpose || "").toLowerCase();
  if (/business|\bbd\b/.test(p)) return "BD";
  if (/event/.test(p) && /follow/.test(p)) return "EventFollowUp";
  if (/event|demand/.test(p)) return "Event";
  return "Network";
}

/** Both event types can mark people Attending and register them on close. */
export const isEventType = (t: CampaignType) => t === "Event" || t === "EventFollowUp";

/** Default purpose for a type picked in the quick "Add new" row. */
export const TYPE_DEFAULT_PURPOSE: Record<CampaignType, string> = {
  Event: "Event outreach",
  EventFollowUp: "Event follow-up",
  Network: "Network outreach",
  BD: "Business development",
};

/** Initials of the campaign owner by full canonical name (e.g. "CF", "SE"). */
export function ownerInitials(owner: string): string {
  const n = canonicalOwnerName(owner || "");
  return n ? initialsOf(n) : "";
}

export const CAMPAIGN_RESULTS = ["attending", "interested", "follow-up", "declined", "no-reply"] as const;
export type CampaignResult = (typeof CAMPAIGN_RESULTS)[number];

export const RESULT_LABEL: Record<CampaignResult, string> = {
  attending: "Attending",
  interested: "Interested",
  "follow-up": "Follow up",
  declined: "Declined / unavailable",
  "no-reply": "No reply",
};

export interface ResultRow {
  campaignId: string;
  personKey: string;
  result: CampaignResult | "";
  followUpOwner: string;
  followUpDue: string;
  by: string;
  at: string;
}

/** Append-only log → the latest result per (campaign, person). Later rows win. */
export function latestResults(rows: ResultRow[]): Map<string, ResultRow> {
  const out = new Map<string, ResultRow>();
  for (const r of rows) {
    const k = `${r.campaignId}|${r.personKey.toLowerCase()}`;
    const prev = out.get(k);
    if (!prev || (r.at || "") >= (prev.at || "")) out.set(k, r);
  }
  return out;
}

export function resultCounts(keys: string[], results: Map<string, ResultRow>, campaignId: string) {
  const c: Record<CampaignResult | "unmarked", number> = { attending: 0, interested: 0, "follow-up": 0, declined: 0, "no-reply": 0, unmarked: 0 };
  for (const k of keys) {
    const r = results.get(`${campaignId}|${k.toLowerCase()}`)?.result;
    c[r || "unmarked"]++;
  }
  return c;
}

const norm = (s: string) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

/** People to register to an event: dedupe against existing attendees by email, then full name. */
export function attendeesToRegister(
  people: Array<{ name: string; email: string }>,
  existing: Array<{ name: string; email: string }>,
): Array<{ name: string; email: string }> {
  const emails = new Set(existing.map((a) => norm(a.email)).filter(Boolean));
  const names = new Set(existing.map((a) => norm(a.name)).filter(Boolean));
  const out: Array<{ name: string; email: string }> = [];
  for (const p of people) {
    const e = norm(p.email), n = norm(p.name);
    if ((e && emails.has(e)) || (n && names.has(n))) continue;
    if (e) emails.add(e);
    if (n) names.add(n);
    out.push(p);
  }
  return out;
}

/** Closed campaigns leave the main list; legacy "done" means sent, still open for results. */
export const isClosedStatus = (s: string) => s === "closed";

/** Adding people only promotes a draft to "saved"; actioning/closed campaigns keep their status. */
export const statusAfterAddingPeople = (s: string) => (!s || s === "draft" ? "saved" : s);

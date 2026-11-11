// Network dashboard: pure aggregation (no I/O). Outreach = any touch (logged sent
// email, campaign send, logged activity, prospect outreach), deduped per person per day.
// Credit always goes to the contact's owner (Relationship Prime), per Chris (Nov 2026).
import type { CampaignRecord } from "@/lib/campaigns";
import { classifyMovement, type Movement, type PyramidTier } from "@/lib/network-pyramid";
import { TEAM_OWNER_NAMES, teamMemberFor } from "@/lib/user-ownership";

export const UNASSIGNED = "Unassigned";
export const DASHBOARD_OWNERS = [...TEAM_OWNER_NAMES, UNASSIGNED];
export const PERIODS = [30, 90, 180, 365] as const;
export const DEFAULT_PERIOD_DAYS = 90;

export type TouchSource = "Email" | "Campaign" | "Logged" | "Prospect outreach";
export interface Touch { person: string; date: string; source: TouchSource }

/** First address of a possibly multi-address cell, lowercased. */
export function personKey(email: string | undefined): string {
  return (email || "").split(/[;,\s]+/).map((e) => e.trim().toLowerCase()).find((e) => e.includes("@")) || "";
}

/** Team owners named in a Relationship Prime cell (shared cells credit each teammate). */
export function creditedOwners(prime: string | undefined): string[] {
  const raw = (prime || "").trim();
  if (!raw) return [UNASSIGNED];
  const whole = teamMemberFor(raw);
  if (whole) return TEAM_OWNER_NAMES.includes(whole.displayName) ? [whole.displayName] : [UNASSIGNED];
  const names = new Set<string>();
  for (const p of raw.split(/\s*[,;&/]\s*/)) {
    const n = teamMemberFor(p)?.displayName;
    if (n && TEAM_OWNER_NAMES.includes(n)) names.add(n);
  }
  return names.size ? [...names] : [UNASSIGNED];
}

export function dayOf(value: string | undefined): string {
  const t = Date.parse(value || "");
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}

/** Touches inside the window, one per person per day (first source wins). */
export function touchesInWindow(touches: Touch[], days: number, now = Date.now()): Touch[] {
  const since = dayOf(new Date(now - days * 86_400_000).toISOString());
  const today = dayOf(new Date(now).toISOString());
  const seen = new Map<string, Touch>();
  for (const t of touches) {
    const d = dayOf(t.date);
    if (!t.person || !d || d < since || d > today) continue;
    const k = `${t.person}|${d}`;
    if (!seen.has(k)) seen.set(k, { ...t, date: d });
  }
  return [...seen.values()];
}

export interface PersonInfo { prime: string; tier: PyramidTier | null; prospect: boolean }

export interface OwnerStats {
  owner: string;
  outreach: number;
  reached: number;
  prospectsReached: number;
  converted: number;
  conversionRate: number | null;
  coldBase: number;
  coldToWarm: number;
  coldToWarmRate: number | null;
  warmBase: number;
  warmToHot: number;
  warmToHotRate: number | null;
}

const rate = (n: number, d: number) => (d > 0 ? n / d : null);
const RANK: Record<PyramidTier, number> = { Prospect: 0, Cold: 1, Warm: 2, Hot: 3, Council: 4 };

/**
 * Per-owner outreach, Prospect → Network conversion and Cold→Warm / Warm→Hot promotion rates.
 * Conversion = of prospects reached in the window, the share moved into the Network on/after
 * their first touch. Promotion base = people Cold (or Warm) now + those promoted out in the window.
 */
export function networkDashboardStats(input: {
  people: Map<string, PersonInfo>;
  touches: Touch[];
  movements: Movement[];
  days: number;
  now?: number;
}): { rows: OwnerStats[]; total: OwnerStats } {
  const now = input.now ?? Date.now();
  const since = now - input.days * 86_400_000;
  const touches = touchesInWindow(input.touches, input.days, now);
  const owners = (person: string) => creditedOwners(input.people.get(person)?.prime);

  // Moves inside the window, by person.
  const conversions = new Map<string, string>(); // person → earliest conversion day
  const coldUp = new Set<string>(), warmUp = new Set<string>();
  for (const m of input.movements) {
    const t = Date.parse(m.ts);
    if (Number.isNaN(t) || t < since || t > now) continue;
    const c = classifyMovement(m);
    if (!c || c.kind !== "promoted" || !c.from || !c.to) continue;
    const p = personKey(m.email);
    if (!p) continue;
    if (c.from === "Prospect") { const d = dayOf(m.ts); const prev = conversions.get(p); if (!prev || d < prev) conversions.set(p, d); }
    if (c.from === "Cold" && RANK[c.to] >= RANK.Warm) coldUp.add(p);
    if (c.from === "Warm" && RANK[c.to] >= RANK.Hot) warmUp.add(p);
  }

  const blank = (owner: string): OwnerStats => ({ owner, outreach: 0, reached: 0, prospectsReached: 0, converted: 0, conversionRate: null, coldBase: 0, coldToWarm: 0, coldToWarmRate: null, warmBase: 0, warmToHot: 0, warmToHotRate: null });
  const by = new Map(DASHBOARD_OWNERS.map((o) => [o, blank(o)]));
  const total = blank("Everyone");
  const each = (person: string, fn: (s: OwnerStats) => void) => { for (const o of owners(person)) fn(by.get(o)!); fn(total); };

  const firstTouch = new Map<string, string>();
  for (const t of touches) {
    each(t.person, (s) => { s.outreach++; });
    const prev = firstTouch.get(t.person);
    if (!prev || t.date < prev) firstTouch.set(t.person, t.date);
  }
  for (const [person, first] of firstTouch) {
    const info = input.people.get(person);
    const conv = conversions.get(person);
    const wasProspect = !!info?.prospect || !!conv;
    each(person, (s) => {
      s.reached++;
      if (!wasProspect) return;
      s.prospectsReached++;
      if (conv && conv >= first) s.converted++;
    });
  }
  for (const [person, info] of input.people) {
    if (info.prospect) continue;
    const cold = info.tier === "Cold" || coldUp.has(person);
    const warm = info.tier === "Warm" || warmUp.has(person);
    each(person, (s) => {
      if (cold) s.coldBase++;
      if (coldUp.has(person)) s.coldToWarm++;
      if (warm) s.warmBase++;
      if (warmUp.has(person)) s.warmToHot++;
    });
  }
  const finish = (s: OwnerStats): OwnerStats => ({ ...s, conversionRate: rate(s.converted, s.prospectsReached), coldToWarmRate: rate(s.coldToWarm, s.coldBase), warmToHotRate: rate(s.warmToHot, s.warmBase) });
  return { rows: DASHBOARD_OWNERS.map((o) => finish(by.get(o)!)), total: finish(total) };
}

/** Monday (UTC) of the week containing the day. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Weekly outreach touches stacked by credited owner. */
export function weeklyOutreach(touches: Touch[], people: Map<string, PersonInfo>, days: number, now = Date.now()) {
  const rows = new Map<string, Record<string, number | string>>();
  for (const t of touchesInWindow(touches, days, now)) {
    const w = weekStart(t.date);
    if (!rows.has(w)) rows.set(w, { week: w, ...Object.fromEntries(DASHBOARD_OWNERS.map((o) => [o, 0])) });
    const r = rows.get(w)!;
    for (const o of creditedOwners(people.get(t.person)?.prime)) r[o] = (r[o] as number) + 1;
  }
  return [...rows.values()].sort((a, b) => String(a.week).localeCompare(String(b.week)));
}

export type CampaignBucket = "Open" | "Active" | "Closed";
export const CAMPAIGN_BUCKETS: CampaignBucket[] = ["Open", "Active", "Closed"];

/** draft/saved = Open, actioning = Active, done = Closed. */
export function campaignBucket(status: string): CampaignBucket {
  const s = (status || "").toLowerCase();
  return s === "done" ? "Closed" : s === "actioning" ? "Active" : "Open";
}

export function campaignStats(campaigns: Pick<CampaignRecord, "status" | "owner" | "createdBy">[]) {
  const totals: Record<CampaignBucket, number> = { Open: 0, Active: 0, Closed: 0 };
  const byOwner = new Map<string, Record<CampaignBucket, number>>();
  for (const c of campaigns) {
    const b = campaignBucket(c.status);
    totals[b]++;
    for (const o of creditedOwners(c.owner || c.createdBy)) {
      if (!byOwner.has(o)) byOwner.set(o, { Open: 0, Active: 0, Closed: 0 });
      byOwner.get(o)![b]++;
    }
  }
  return {
    totals,
    byOwner: DASHBOARD_OWNERS.filter((o) => byOwner.has(o) || o !== UNASSIGNED).map((owner) => ({ owner, ...(byOwner.get(owner) || { Open: 0, Active: 0, Closed: 0 }) })),
  };
}

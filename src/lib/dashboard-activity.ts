/**
 * Dashboard activity metrics for a scope of portfolio companies
 * (all / one lead investor / one company).
 *
 * Every count is available three ways:
 *   all  — everything on record
 *   ttm  — trailing twelve months
 *   t90  — trailing ninety days
 *
 * Plus a 12-month monthly series for the small activity charts.
 */

import type { Contact, PortfolioEvent } from "@/lib/types";
import { portCoKey } from "@/lib/portco-canonical";
import { parseToIsoDate } from "@/lib/sheet-date";

export interface Windowed {
  all: number;
  ttm: number;
  t90: number;
}

export interface MonthlyPoint {
  /** "Mar 25" */
  label: string;
  /** "2025-03" */
  month: string;
  introductions: number;
  interactions: number;
  events: number;
  connections: number;
}

export interface ScopeActivity {
  introductions: Windowed;
  connections: Windowed;
  interactions: Windowed;
  events: Windowed;
  monthly: MonthlyPoint[];
}

function ms(iso: string): number | null {
  const clean = parseToIsoDate(iso);
  if (!clean) return null;
  const t = Date.parse(`${clean}T12:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

function emptyWindowed(): Windowed {
  return { all: 0, ttm: 0, t90: 0 };
}

function bump(w: Windowed, t: number | null, ttmFrom: number, t90From: number, by = 1) {
  w.all += by;
  if (t === null) return;
  if (t >= ttmFrom) w.ttm += by;
  if (t >= t90From) w.t90 += by;
}

function monthKey(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(year: number, month0: number): string {
  const names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${names[month0]} ${String(year).slice(2)}`;
}

export function computeScopeActivity(
  keys: Set<string>,
  contacts: Contact[],
  eventsByPortco: Record<string, PortfolioEvent[]>,
  now: Date = new Date(),
): ScopeActivity {
  const nowMs = now.getTime();
  const ttmFrom = nowMs - 365 * 24 * 3600 * 1000;
  const t90From = nowMs - 90 * 24 * 3600 * 1000;

  const introductions = emptyWindowed();
  const connections = emptyWindowed();
  const interactions = emptyWindowed();
  const events = emptyWindowed();

  // 12 rolling months, oldest first.
  const buckets = new Map<string, MonthlyPoint>();
  const order: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    order.push(key);
    buckets.set(key, {
      month: key,
      label: monthLabel(d.getUTCFullYear(), d.getUTCMonth()),
      introductions: 0,
      interactions: 0,
      events: 0,
      connections: 0,
    });
  }
  const addMonthly = (t: number | null, field: keyof MonthlyPoint) => {
    if (t === null) return;
    const b = buckets.get(monthKey(t));
    if (b && typeof b[field] === "number") (b[field] as number) += 1;
  };

  for (const c of contacts) {
    const engagements = (c.portCoEngagements || []).filter((e) =>
      keys.has(portCoKey(e.portco || "")),
    );
    const legacyIntros = (c.portCoIntros || [])
      .map((n) => portCoKey(n))
      .filter((k) => keys.has(k));

    if (engagements.length === 0 && legacyIntros.length === 0) continue;

    // Connection: dated by the earliest touch we know about for this scope.
    const touchTimes = engagements
      .map((e) => ms(e.date || ""))
      .filter((t): t is number => t !== null);
    const firstTouch = touchTimes.length
      ? Math.min(...touchTimes)
      : ms(c.dateAdded || "") ?? null;
    bump(connections, firstTouch, ttmFrom, t90From);
    addMonthly(firstTouch, "connections");

    if (engagements.length > 0) {
      for (const e of engagements) {
        const isIntro = (e.sources || []).some((s) =>
          String(s).toLowerCase().includes("introduction"),
        );
        if (!isIntro) continue;
        const t = ms(e.date || "");
        bump(introductions, t, ttmFrom, t90From);
        addMonthly(t, "introductions");
      }
    } else {
      introductions.all += legacyIntros.length;
    }

    for (const i of c.interactions || []) {
      const t = ms(i.date || "");
      bump(interactions, t, ttmFrom, t90From);
      addMonthly(t, "interactions");
    }
  }

  // Events: distinct event name per scope, dated from the Asana event row.
  const seenEvents = new Map<string, number | null>();
  for (const key of keys) {
    for (const e of eventsByPortco[key] || []) {
      const name = (e.name || "").trim().toLowerCase();
      if (!name) continue;
      const t = ms(e.date || "");
      const prev = seenEvents.get(name);
      if (prev === undefined) seenEvents.set(name, t);
      else if (t !== null && (prev === null || t < prev)) seenEvents.set(name, t);
    }
  }
  for (const t of seenEvents.values()) {
    bump(events, t, ttmFrom, t90From);
    addMonthly(t, "events");
  }

  return {
    introductions,
    connections,
    interactions,
    events,
    monthly: order.map((k) => buckets.get(k)!),
  };
}

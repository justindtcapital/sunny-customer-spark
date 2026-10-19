// Event Planner — pure helpers (no I/O). Shared by server and UI; unit-tested.

export type PlannerStatus = "Confirmed" | "Potential" | "Declined";
export const PLANNER_STATUSES: PlannerStatus[] = ["Confirmed", "Potential", "Declined"];

export interface PlannerEvent {
  urid: string;
  name: string;
  /** YYYY-MM-DD ("" when unknown). */
  start: string;
  /** YYYY-MM-DD; equals start for one-day events. */
  end: string;
  location: string;
  category: string;
  subcategory: string;
  status: PlannerStatus;
  sectors: string[];
  portcos: string[];
  partners: string[];
  owner: string;
  format: string;
  website: string;
  lumaUrl: string;
  /** Where the record came from: Tracker, Asana, CSV, Link, Manual. */
  source: string;
  sourceRef: string;
  asanaGid: string;
  networkCount: number;
  notes: string;
  actionsNeeded: string;
  eventContact: string;
  createdBy: string;
  updated: string;
}

export interface PlannerAttendee {
  eventUrid: string;
  name: string;
  email: string;
  /** Network | Prospect | Guest */
  kind: string;
  /** Invited | Registered | Attended */
  status: string;
  date: string;
}

// ── Categories (rows) → subcategories (tile colour) ─────────────
export interface PlannerSubcategory {
  name: string;
  /** Token key into the CSS palette (--planner-<key>). */
  color: string;
}
export interface PlannerCategory {
  name: string;
  subcategories: PlannerSubcategory[];
}

export const PLANNER_CATEGORIES: PlannerCategory[] = [
  {
    name: "DTC Led Events",
    subcategories: [
      { name: "DTC Customer Advisory Council", color: "violet" },
      { name: "DTC Event (No Partnership)", color: "purple" },
      { name: "DTC Event (with Partner)", color: "plum" },
    ],
  },
  {
    name: "DTC Partnered Events",
    subcategories: [
      { name: "3rd Party Events", color: "lime" },
      { name: "GBI Roundtable", color: "sky" },
      { name: "Other", color: "rose" },
    ],
  },
  {
    name: "Briefings",
    subcategories: [
      { name: "DTC Curated Briefings", color: "blue" },
      { name: "Vation Briefs", color: "amber" },
      { name: "Virtual Pitches (Sagetap)", color: "orange" },
    ],
  },
  { name: "Unassigned", subcategories: [{ name: "Unassigned", color: "slate" }] },
];

export function subcategoryColor(sub: string): string {
  for (const c of PLANNER_CATEGORIES)
    for (const s of c.subcategories) if (s.name.toLowerCase() === sub.trim().toLowerCase()) return s.color;
  return "slate";
}

export function categoryOfSubcategory(sub: string): string {
  for (const c of PLANNER_CATEGORIES)
    if (c.subcategories.some((s) => s.name.toLowerCase() === sub.trim().toLowerCase())) return c.name;
  return "Unassigned";
}

// ── Sectors (dot colour) ─────────────────────────────────────────
export const PLANNER_SECTORS = ["Cyber", "Data/AI", "Supply Chain", "Industry", "Multiple"] as const;

export function normalizeSector(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return "";
  if (/(cyber|security|sec\b)/.test(s)) return "Cyber";
  if (/(\bai\b|data|ml\b|llm|genai)/.test(s)) return "Data/AI";
  if (/supply|logistic/.test(s)) return "Supply Chain";
  if (/multi/.test(s)) return "Multiple";
  if (/industry|retail|manufactur|finserv|health/.test(s)) return "Industry";
  return raw.trim();
}

export function sectorDotColor(sector: string): string {
  switch (normalizeSector(sector)) {
    case "Cyber":
      return "cyber";
    case "Data/AI":
      return "data";
    case "Supply Chain":
      return "supply";
    case "Industry":
      return "industry";
    default:
      return "other";
  }
}

// ── Tracker mapping (FY tabs → planner) ─────────────────────────
export function mapTrackerStatus(raw: string): PlannerStatus {
  const s = raw.trim().toLowerCase();
  if (s === "executed" || s === "accepted" || s === "confirmed") return "Confirmed";
  if (s === "declined") return "Declined";
  return "Potential";
}

export function mapTrackerCategory(trackerCategory: string, name: string): string {
  const c = trackerCategory.trim().toLowerCase();
  const n = name.toLowerCase();
  if (/sagetap/.test(n)) return "Virtual Pitches (Sagetap)";
  if (/vation/.test(n)) return "Vation Briefs";
  if (/gbi/.test(n)) return "GBI Roundtable";
  if (/advisory council|\bcac\b/.test(n)) return "DTC Customer Advisory Council";
  if (c === "briefing") return "DTC Curated Briefings";
  if (c === "dtc lead") return "DTC Event (No Partnership)";
  if (c === "dinner") return "DTC Event (with Partner)";
  if (c === "dtc sponsored" || c === "practitioner") return "3rd Party Events";
  if (c === "pay-to-play") return "Other";
  return "Unassigned";
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(y: number, m: number, d: number): string {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parse tracker dates like "1/6-1/8", "2/4", "24-Feb", "3/30-31", "2026-03-04". */
export function parseTrackerDate(raw: string, year: number, monthHint = ""): { start: string; end: string } {
  const s = (raw || "").trim();
  if (!s) {
    const mi = MONTHS.indexOf(monthHint.trim().slice(0, 3).toLowerCase());
    return mi >= 0 ? { start: iso(year, mi + 1, 1), end: iso(year, mi + 1, 1) } : { start: "", end: "" };
  }
  const isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoM) return { start: isoM[0], end: isoM[0] };
  const dm = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})/);
  if (dm) {
    const m = MONTHS.indexOf(dm[2].toLowerCase()) + 1;
    const d = iso(year, m, +dm[1]);
    return { start: d, end: d };
  }
  const range = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?(?:\s*[-–]\s*(?:(\d{1,2})\/)?(\d{1,2}))?/);
  if (range) {
    const m1 = +range[1];
    const start = iso(year, m1, +range[2]);
    const end = range[4] ? iso(year, range[3] ? +range[3] : m1, +range[4]) || start : start;
    return { start, end: end < start ? start : end };
  }
  return { start: "", end: "" };
}

export function splitList(v: string): string[] {
  return (v || "")
    .split(/[;,|]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// ── Time windows ─────────────────────────────────────────────────
export type PlannerZoom = "week" | "month" | "year";

function parse(d: string): Date {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: string, n: number): string {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmt(x);
}

export interface PlannerColumn {
  key: string;
  label: string;
  start: string;
  end: string;
}
export interface PlannerWindow {
  zoom: PlannerZoom;
  start: string;
  end: string;
  label: string;
  columns: PlannerColumn[];
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Monday of the week containing `anchor`. */
export function weekStart(anchor: string): string {
  const d = parse(anchor);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(anchor, -dow);
}

export function plannerWindow(zoom: PlannerZoom, anchor: string): PlannerWindow {
  const a = parse(anchor);
  const y = a.getUTCFullYear();
  const m = a.getUTCMonth();
  if (zoom === "year") {
    const columns = MONTH_LABELS.map((label, i) => {
      const s = fmt(new Date(Date.UTC(y, i, 1)));
      const e = fmt(new Date(Date.UTC(y, i + 1, 0)));
      return { key: s, label, start: s, end: e };
    });
    return { zoom, start: `${y}-01-01`, end: `${y}-12-31`, label: String(y), columns };
  }
  if (zoom === "month") {
    const start = fmt(new Date(Date.UTC(y, m, 1)));
    const end = fmt(new Date(Date.UTC(y, m + 1, 0)));
    const columns: PlannerColumn[] = [];
    let ws = weekStart(start);
    while (ws <= end) {
      const we = addDays(ws, 6);
      const s = ws < start ? start : ws;
      const e = we > end ? end : we;
      columns.push({ key: s, label: `${+s.slice(8)}–${+e.slice(8)}`, start: s, end: e });
      ws = addDays(ws, 7);
    }
    return { zoom, start, end, label: `${MONTH_LABELS[m]} ${y}`, columns };
  }
  const start = weekStart(anchor);
  const end = addDays(start, 6);
  const columns = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    return { key: d, label: `${DOW[parse(d).getUTCDay()]} ${+d.slice(8)}`, start: d, end: d };
  });
  const sm = MONTH_LABELS[+start.slice(5, 7) - 1];
  const em = MONTH_LABELS[+end.slice(5, 7) - 1];
  const label = `${sm} ${+start.slice(8)} – ${em === sm ? "" : em + " "}${+end.slice(8)}, ${end.slice(0, 4)}`;
  return { zoom, start, end, label, columns };
}

/** Move the anchor one step back (-1) or forward (+1) at the current zoom. */
export function stepAnchor(zoom: PlannerZoom, anchor: string, dir: -1 | 1): string {
  if (zoom === "week") return addDays(weekStart(anchor), 7 * dir);
  const a = parse(anchor);
  if (zoom === "month") return fmt(new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + dir, 1)));
  return fmt(new Date(Date.UTC(a.getUTCFullYear() + dir, 0, 1)));
}

export function overlaps(e: Pick<PlannerEvent, "start" | "end">, start: string, end: string): boolean {
  if (!e.start) return false;
  const s = e.start;
  const en = e.end && e.end >= s ? e.end : s;
  return s <= end && en >= start;
}

/** Column an event is placed in (its first overlapping column). */
export function columnFor(e: PlannerEvent, w: PlannerWindow): string | null {
  const c = w.columns.find((col) => overlaps(e, col.start, col.end));
  return c ? c.key : null;
}

export interface RowTotals {
  events: number;
  network: number;
  portcos: number;
  sectors: Record<string, number>;
}

/** Totals for the events visible in the window (dashboard summary per row). */
export function windowTotals(events: PlannerEvent[], w: Pick<PlannerWindow, "start" | "end">): RowTotals {
  const t: RowTotals = { events: 0, network: 0, portcos: 0, sectors: {} };
  const portcos = new Set<string>();
  for (const e of events) {
    if (!overlaps(e, w.start, w.end)) continue;
    t.events++;
    t.network += e.networkCount || 0;
    e.portcos.forEach((p) => portcos.add(p.toLowerCase()));
    for (const s of new Set(e.sectors.map(normalizeSector).filter(Boolean)))
      t.sectors[s] = (t.sectors[s] || 0) + 1;
  }
  t.portcos = portcos.size;
  return t;
}

// ── Prior years ──────────────────────────────────────────────────
export function eventSeriesKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b|'\d{2}\b/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function priorYears(e: PlannerEvent, all: PlannerEvent[]): PlannerEvent[] {
  const key = eventSeriesKey(e.name);
  if (!key || !e.start) return [];
  const yr = e.start.slice(0, 4);
  return all
    .filter((x) => x.urid !== e.urid && x.start && x.start.slice(0, 4) < yr && eventSeriesKey(x.name) === key)
    .sort((a, b) => b.start.localeCompare(a.start));
}

// ── CSV import ──────────────────────────────────────────────────
export const IMPORT_FIELDS = [
  "name",
  "start",
  "end",
  "location",
  "subcategory",
  "status",
  "sectors",
  "portcos",
  "partners",
  "owner",
  "format",
  "website",
  "lumaUrl",
  "notes",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  name: "Event name",
  start: "Start date",
  end: "End date",
  location: "Location",
  subcategory: "Category",
  status: "Status",
  sectors: "Sector / Type",
  portcos: "PortCo(s)",
  partners: "Partners",
  owner: "Owner / DTC coverage",
  format: "Format",
  website: "Website",
  lumaUrl: "Luma / RSVP link",
  notes: "Notes",
};

/** Best-guess column → field mapping from CSV headers. */
export function guessImportMapping(headers: string[]): Record<number, ImportField | ""> {
  const out: Record<number, ImportField | ""> = {};
  const used = new Set<ImportField>();
  const rules: [ImportField, RegExp][] = [
    ["lumaUrl", /luma|rsvp|sidecar|registration/],
    ["website", /website|url|link/],
    ["end", /end/],
    ["start", /date|start|when/],
    ["name", /event|name|title/],
    ["location", /location|city|venue|where/],
    ["subcategory", /category/],
    ["status", /status/],
    ["sectors", /sector|type|industry|focus/],
    ["portcos", /portco|portfolio/],
    ["partners", /partner|sponsor|reseller/],
    ["owner", /owner|coverage|lead/],
    ["format", /format|virtual|in.?person/],
    ["notes", /note|comment|description/],
  ];
  headers.forEach((h, i) => {
    const s = h.trim().toLowerCase();
    const hit = rules.find(([f, re]) => !used.has(f) && re.test(s));
    out[i] = hit ? hit[0] : "";
    if (hit) used.add(hit[0]);
  });
  return out;
}

export function duplicateKey(e: Pick<PlannerEvent, "name" | "start">): string {
  return `${eventSeriesKey(e.name)}|${e.start}`;
}

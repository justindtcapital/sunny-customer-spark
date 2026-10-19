// Event Planner storage — the shared "Event Tracker" spreadsheet is the event
// database. VP-managed rows live in the "Events DB" tab (seeded once from the
// FY tabs, which stay untouched); attendance lives in "Event Attendees".
import { getAccessToken, sheetsFetch, colLetters } from "./sheets.server";
import {
  mapTrackerCategory,
  mapTrackerStatus,
  normalizeSector,
  parseTrackerDate,
  trackerYearFor,
  splitList,
  categoryOfSubcategory,
  duplicateKey,
  type PlannerAttendee,
  type PlannerEvent,
  type PlannerStatus,
} from "@/lib/event-planner";
import type { AsanaEvent } from "@/lib/types";

const DEFAULT_TRACKER_ID = "1awv_VNFHvndOfu4DnyrM4PnMPb65UOms-sJym7AlG0M";
export const EVENTS_TAB = "Events DB";
export const ATTENDEES_TAB = "Event Attendees";

export const EVENT_HEADERS = [
  "URID", "Name", "Start", "End", "Location", "Category", "Subcategory", "Status",
  "Sectors", "PortCos", "Partners", "Owner", "Format", "Website", "Luma URL",
  "Source", "Source Ref", "Asana GID", "Network Count", "Notes", "Actions Needed",
  "Event Contact", "Created By", "Created", "Updated", "DTC Status",
];
export const ATTENDEE_HEADERS = ["Event URID", "Name", "Email", "Kind", "Status", "Date"];

function sheetId(): string {
  return process.env["EVENT_TRACKER_SHEET_ID"] || DEFAULT_TRACKER_ID;
}
function base(): string {
  return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId())}`;
}

const cache = new Map<string, { at: number; rows: string[][] }>();
const TTL = 30_000;

async function readTab(tab: string, fresh = false): Promise<string[][]> {
  const c = cache.get(tab);
  if (!fresh && c && Date.now() - c.at < TTL) return c.rows;
  const token = await getAccessToken();
  const res = await sheetsFetch(`${base()}/values/${encodeURIComponent(tab + "!A1:AZ5000")}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Event tracker read failed for "${tab}" [${res.status}]: ${await res.text()}`);
  const rows = ((await res.json()) as { values?: string[][] }).values || [];
  cache.set(tab, { at: Date.now(), rows });
  return rows;
}

async function listTabs(): Promise<string[]> {
  const token = await getAccessToken();
  const res = await sheetsFetch(`${base()}?fields=sheets.properties.title`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Event tracker metadata failed [${res.status}]: ${await res.text()}`);
  const j = (await res.json()) as { sheets?: { properties: { title: string } }[] };
  return (j.sheets || []).map((s) => s.properties.title);
}

async function ensureTab(tab: string, headers: string[]): Promise<void> {
  const tabs = await listTabs();
  const token = await getAccessToken();
  if (!tabs.includes(tab)) {
    const res = await sheetsFetch(`${base()}:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }),
    });
    if (!res.ok) throw new Error(`Could not create tab "${tab}": ${await res.text()}`);
  }
  const rows = await readTab(tab, true);
  if ((rows[0] || []).length < headers.length) await writeRange(tab, 1, 0, [headers]);
}

async function writeRange(tab: string, row1: number, col0: number, values: string[][]): Promise<void> {
  const token = await getAccessToken();
  const range = `${tab}!${colLetters(col0)}${row1}`;
  const res = await sheetsFetch(`${base()}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Event tracker write failed [${res.status}]: ${await res.text()}`);
  cache.delete(tab);
}

async function appendRows(tab: string, rows: string[][]): Promise<void> {
  if (!rows.length) return;
  const token = await getAccessToken();
  const res = await sheetsFetch(
    `${base()}/values/${encodeURIComponent(tab + "!A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: rows }),
    },
  );
  if (!res.ok) throw new Error(`Event tracker append failed [${res.status}]: ${await res.text()}`);
  cache.delete(tab);
}

// ── Row <-> object ───────────────────────────────────────────────
function toRow(e: PlannerEvent, created: string): string[] {
  return [
    e.urid, e.name, e.start, e.end, e.location, e.category, e.subcategory, e.status,
    e.sectors.join("; "), e.portcos.join("; "), e.partners.join("; "), e.owner, e.format,
    e.website, e.lumaUrl, e.source, e.sourceRef, e.asanaGid, String(e.networkCount || ""),
    e.notes, e.actionsNeeded, e.eventContact, e.createdBy, created, e.updated, e.dtcStatus || "",
  ];
}

function fromRow(r: string[], idx: Record<string, number>): PlannerEvent {
  const g = (h: string) => (r[idx[h]] ?? "").toString().trim();
  const status = g("Status") as PlannerStatus;
  return {
    urid: g("URID"), name: g("Name"), start: g("Start"), end: g("End") || g("Start"),
    location: g("Location"), category: g("Category") || categoryOfSubcategory(g("Subcategory")),
    subcategory: g("Subcategory") || "Unassigned",
    status: (["Confirmed", "Potential", "Declined"] as const).includes(status) ? status : "Potential",
    sectors: splitList(g("Sectors")), portcos: splitList(g("PortCos")), partners: splitList(g("Partners")),
    owner: g("Owner"), format: g("Format"), website: g("Website"), lumaUrl: g("Luma URL"),
    source: g("Source"), sourceRef: g("Source Ref"), asanaGid: g("Asana GID"),
    networkCount: Number(g("Network Count")) || 0, notes: g("Notes"), actionsNeeded: g("Actions Needed"),
    eventContact: g("Event Contact"), createdBy: g("Created By"), updated: g("Updated"), dtcStatus: g("DTC Status"),
  };
}

function headerIndex(rows: string[][]): Record<string, number> {
  const idx: Record<string, number> = {};
  (rows[0] || []).forEach((h, i) => (idx[(h || "").trim()] = i));
  return idx;
}

export async function readPlannerEvents(fresh = false): Promise<PlannerEvent[]> {
  const rows = await readTab(EVENTS_TAB, fresh).catch(() => [] as string[][]);
  const idx = headerIndex(rows);
  return rows.slice(1).filter((r) => (r[idx["URID"]] || "").trim()).map((r) => fromRow(r, idx));
}

export async function readAttendees(): Promise<PlannerAttendee[]> {
  const rows = await readTab(ATTENDEES_TAB).catch(() => [] as string[][]);
  return rows.slice(1).filter((r) => r[0]).map((r) => ({
    eventUrid: r[0] || "", name: r[1] || "", email: r[2] || "", kind: r[3] || "", status: r[4] || "", date: r[5] || "",
  }));
}

export function blankEvent(): PlannerEvent {
  return {
    urid: crypto.randomUUID(), name: "", start: "", end: "", location: "", category: "Unassigned",
    subcategory: "Unassigned", status: "Potential", sectors: [], portcos: [], partners: [], owner: "",
    format: "", website: "", lumaUrl: "", source: "Manual", sourceRef: "", asanaGid: "", networkCount: 0,
    notes: "", actionsNeeded: "", eventContact: "", createdBy: "", updated: "", dtcStatus: "",
  };
}

function clean(e: Partial<PlannerEvent>, by: string): PlannerEvent {
  const b = { ...blankEvent(), ...e };
  b.name = b.name.trim();
  b.end = b.end && b.end >= b.start ? b.end : b.start;
  b.category = categoryOfSubcategory(b.subcategory);
  b.sectors = [...new Set(b.sectors.map(normalizeSector).filter(Boolean))];
  b.createdBy = b.createdBy || by;
  b.updated = new Date().toISOString();
  return b;
}

/** Add events, skipping (name, start) duplicates already in the DB. */
export async function addPlannerEvents(
  inputs: Partial<PlannerEvent>[],
  by: string,
): Promise<{ added: number; skipped: string[] }> {
  await ensureTab(EVENTS_TAB, EVENT_HEADERS);
  const existing = new Set((await readPlannerEvents(true)).map(duplicateKey));
  const now = new Date().toISOString();
  const rows: string[][] = [];
  const skipped: string[] = [];
  for (const i of inputs) {
    const e = clean({ ...i, urid: crypto.randomUUID() }, by);
    if (!e.name) continue;
    const k = duplicateKey(e);
    if (existing.has(k)) {
      skipped.push(e.name);
      continue;
    }
    existing.add(k);
    rows.push(toRow(e, now));
  }
  await appendRows(EVENTS_TAB, rows);
  return { added: rows.length, skipped };
}

/** Write only changed cells of one event after re-reading its current row. */
export async function updatePlannerEvent(
  urid: string,
  patch: Partial<PlannerEvent>,
  expectedUpdated: string,
): Promise<PlannerEvent> {
  const rows = await readTab(EVENTS_TAB, true);
  const idx = headerIndex(rows);
  const i = rows.findIndex((r, n) => n > 0 && (r[idx["URID"]] || "").trim() === urid);
  if (i < 1) throw new Error("That event no longer exists.");
  const current = fromRow(rows[i], idx);
  if (expectedUpdated && current.updated && current.updated !== expectedUpdated)
    throw new Error("Someone else just changed this event. Reload and try again.");
  const next = clean({ ...current, ...patch, urid }, current.createdBy);
  const created = rows[i][idx["Created"]] || "";
  const newRow = toRow(next, created);
  const old = rows[i];
  // Write a contiguous span covering changed columns only.
  const changed = newRow.map((v, c) => (v !== (old[c] ?? "") ? c : -1)).filter((c) => c >= 0);
  if (changed.length) {
    const lo = Math.min(...changed), hi = Math.max(...changed);
    const span = newRow.slice(lo, hi + 1).map((v, k) => (changed.includes(lo + k) ? v : old[lo + k] ?? ""));
    await writeRange(EVENTS_TAB, i + 1, lo, [span]);
  }
  return next;
}

export async function addAttendees(rows: PlannerAttendee[]): Promise<number> {
  await ensureTab(ATTENDEES_TAB, ATTENDEE_HEADERS);
  const have = new Set((await readAttendees()).map((a) => `${a.eventUrid}|${(a.email || a.name).toLowerCase()}`));
  const out = rows.filter((a) => {
    const k = `${a.eventUrid}|${(a.email || a.name).toLowerCase()}`;
    if (have.has(k)) return false;
    have.add(k);
    return true;
  });
  await appendRows(ATTENDEES_TAB, out.map((a) => [a.eventUrid, a.name, a.email, a.kind, a.status, a.date]));
  return out.length;
}

function trackerDate(raw: string, monthHint: string, year: number, maxMonth: number) {
  const first = parseTrackerDate(raw, year, monthHint);
  const month = first.start ? Number(first.start.slice(5, 7)) : 0;
  const y = trackerYearFor(month, maxMonth, year);
  return { ...(y === year ? first : parseTrackerDate(raw, y, monthHint)), month };
}

/** Re-derive DTC Status, dates and briefing category from the FY tabs; rewrites only changed rows. */
export async function repairPlannerEvents(): Promise<{ changed: number }> {
  await ensureTab(EVENTS_TAB, EVENT_HEADERS);
  const rows = await readTab(EVENTS_TAB, true);
  const idx = headerIndex(rows);
  const fy = new Map<string, { status: string; start: string; end: string }>();
  for (const tab of (await listTabs()).filter((t) => /^FY\s?\d{4}$/i.test(t))) {
    const r = await readTab(tab, true);
    const h = (r[0] || []).map((x) => (x || "").trim().toLowerCase());
    const di = h.findIndex((x) => /^date/.test(x)), si = h.findIndex((x) => /status/.test(x)), mi = h.findIndex((x) => /^month/.test(x));
    const ym = (r[0]?.[di] || "").match(/(20\d{2})/);
    const year = ym ? Number(ym[1]) : Number(tab.replace(/\D/g, "")) - 1;
    let maxMonth = 0;
    for (let n = 1; n < r.length; n++) {
      const d = trackerDate((r[n][di] || "").trim(), (r[n][mi] || "").trim(), year, maxMonth);
      maxMonth = Math.max(maxMonth, d.month);
      fy.set(`${tab}!${n + 1}`, { status: (r[n][si] || "").trim(), start: d.start, end: d.end });
    }
  }
  let changed = 0;
  const out = rows.slice(1).map((r) => {
    if (!(r[idx["URID"]] || "").trim()) return r.map((v) => v ?? "");
    const e = fromRow(r, idx);
    const next = { ...e };
    const ref = e.source === "Tracker" ? fy.get(e.sourceRef.split(" · ")[0]) : undefined;
    if (ref) {
      next.dtcStatus = ref.status;
      if (ref.start) { next.start = ref.start; next.end = ref.end || ref.start; }
    }
    if (/brief/i.test(e.name) && !/vation|sagetap/i.test(e.name)) {
      next.subcategory = "DTC Curated Briefings";
      next.category = categoryOfSubcategory(next.subcategory);
    }
    const created = r[idx["Created"]] || "";
    const before = toRow(e, created);
    const after = toRow(next, created);
    if (after.join("\u0001") !== before.join("\u0001")) changed++;
    return after;
  });
  if (changed) await writeRange(EVENTS_TAB, 2, 0, out);
  return { changed };
}

// ── One-time seed from FY tabs ──────────────────────────────────
export async function seedFromTracker(by: string): Promise<{ added: number; skipped: number }> {
  const tabs = (await listTabs()).filter((t) => /^FY\s?\d{4}$/i.test(t));
  const inputs: Partial<PlannerEvent>[] = [];
  for (const tab of tabs) {
    const fy = Number(tab.replace(/\D/g, ""));
    const rows = await readTab(tab, true);
    const h = (rows[0] || []).map((x) => (x || "").trim().toLowerCase());
    const col = (re: RegExp) => h.findIndex((x) => re.test(x));
    const c = {
      month: col(/^month/), name: col(/^event/), date: col(/^date/), loc: col(/^location/), type: col(/^type/),
      status: col(/status/), source: col(/^source/), cat: col(/^category/), portco: col(/portco/),
      actions: col(/actions/), cov: col(/coverage/), partners: col(/partner/), contact: col(/contact/),
      notes: col(/^notes/), sidecar: col(/sidecar/), web: col(/website/),
    };
    const yearMatch = (rows[0]?.[c.date] || "").match(/(20\d{2})/);
    const year = yearMatch ? Number(yearMatch[1]) : fy - 1;
    let maxMonth = 0;
    for (let n = 1; n < rows.length; n++) {
      const r = rows[n];
      const g = (k: number) => (k >= 0 ? (r[k] || "").trim() : "");
      const name = g(c.name);
      if (!name) continue;
      const d = trackerDate(g(c.date), g(c.month), year, maxMonth);
      maxMonth = Math.max(maxMonth, d.month);
      inputs.push({
        name, start: d.start, end: d.end, location: g(c.loc),
        subcategory: mapTrackerCategory(g(c.cat), name), status: mapTrackerStatus(g(c.status)), dtcStatus: g(c.status),
        sectors: [g(c.type)].filter(Boolean), portcos: splitList(g(c.portco)), partners: splitList(g(c.partners)),
        owner: g(c.cov), website: g(c.web), lumaUrl: g(c.sidecar), notes: g(c.notes),
        actionsNeeded: g(c.actions), eventContact: g(c.contact),
        source: "Tracker", sourceRef: `${tab}!${n + 1}${g(c.source) ? ` · ${g(c.source)}` : ""}`,
      });
    }
  }
  const r = await addPlannerEvents(inputs, by);
  return { added: r.added, skipped: r.skipped.length };
}

// ── Asana sync (kept running during transition) ─────────────────
function asanaSubcategory(e: AsanaEvent): string {
  const lead = (e.lead || "").toLowerCase();
  if (e.type === "dinner") return lead.includes("partner") ? "DTC Event (with Partner)" : "DTC Event (No Partnership)";
  if (lead === "dtc") return "DTC Event (No Partnership)";
  if (e.type === "meeting") return "DTC Curated Briefings";
  return mapTrackerCategory("", e.name) !== "Unassigned" ? mapTrackerCategory("", e.name) : "3rd Party Events";
}

/** Add Asana events not yet in the DB (matched by gid, then name+date). Never overwrites. */
export async function syncAsanaEvents(asana: AsanaEvent[], by: string): Promise<{ added: number }> {
  const db = await readPlannerEvents(true);
  const gids = new Set(db.map((e) => e.asanaGid).filter(Boolean));
  const keys = new Set(db.map(duplicateKey));
  const inputs = asana
    .filter((a) => !a.gid.startsWith("app-") && a.name && !gids.has(a.gid))
    .filter((a) => !keys.has(duplicateKey({ name: a.name, start: a.date })))
    .map((a) => ({
      name: a.name, start: a.date, end: a.date, subcategory: asanaSubcategory(a),
      status: (a.status === "completed" || a.date ? "Confirmed" : "Potential") as PlannerStatus,
      sectors: a.sectors || [], portcos: a.portcos || [], owner: a.owner || "",
      format: a.format || "", networkCount: a.attendeeCount || 0,
      source: "Asana", sourceRef: `https://app.asana.com/0/0/${a.gid}`, asanaGid: a.gid,
    }));
  const r = await addPlannerEvents(inputs, by);
  return { added: r.added };
}

// ── Add from link ───────────────────────────────────────────────
export async function extractEventFromUrl(url: string): Promise<Partial<PlannerEvent>> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured");
  let text = "";
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 VenturePulse" }, signal: AbortSignal.timeout(12000) });
    const html = await res.text();
    const meta = [...html.matchAll(/<meta[^>]+(?:property|name)="(og:[^"]+|description|twitter:[^"]+)"[^>]+content="([^"]*)"/gi)]
      .map((m) => `${m[1]}: ${m[2]}`).join("\n");
    const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n").slice(0, 4000);
    const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 7000);
    text = `${meta}\n${ld}\n${body}`;
  } catch {
    text = "(page unreachable)";
  }
  const today = new Date().toISOString().slice(0, 10);
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      store: false,
      reasoning: { effort: "low" },
      instructions: `Extract event details as JSON from the page. Today is ${today}. Dates YYYY-MM-DD ("" if unknown; pick the next future occurrence if the year is missing). location: "City" or "City, Country". format: in-person, virtual or hybrid. sector: one of Cyber, Data/AI, Supply Chain, Industry, Multiple, or "". notes: 1-2 plain sentences on what the event is and who attends.`,
      input: `URL: ${url}\n${text}`,
      text: { format: { type: "json_schema", name: "event", strict: true, schema: {
        type: "object", additionalProperties: false,
        required: ["name", "start", "end", "location", "format", "sector", "notes"],
        properties: {
          name: { type: "string" }, start: { type: "string" }, end: { type: "string" },
          location: { type: "string" }, format: { type: "string" }, sector: { type: "string" }, notes: { type: "string" },
        },
      } } },
    }),
  });
  if (!res.ok) throw new Error(`Could not read that page (AI ${res.status})`);
  const j = (await res.json()) as { output?: { content?: { type: string; text?: string }[] }[]; output_text?: string };
  const raw = j.output_text || j.output?.flatMap((o) => o.content || []).find((c) => c.type === "output_text")?.text || "{}";
  const o = JSON.parse(raw) as Record<string, string>;
  const isLuma = /lu\.ma|luma\.com/i.test(url);
  return {
    name: o.name || "", start: o.start || "", end: o.end || o.start || "", location: o.location || "",
    format: o.format || "", sectors: o.sector ? [o.sector] : [], notes: o.notes || "",
    website: isLuma ? "" : url, lumaUrl: isLuma ? url : "", source: "Link", sourceRef: url, status: "Potential",
  };
}

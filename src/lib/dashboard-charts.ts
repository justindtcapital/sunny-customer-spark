// Charts built with V.I.C.: V.I.C. only returns a ChartSpec over these whitelisted
// datasets; the browser computes the numbers from real rows. Browser-safe, no I/O.
import { z } from "zod";

export type DashboardKey = "events" | "network";
export type FieldValue = string | number | string[];
export type ChartRecord = Record<string, FieldValue> & { _date?: string };

export interface DatasetDef {
  label: string;
  dashboard: DashboardKey;
  description: string;
  /** Group/split/filter fields → plain description for V.I.C. */
  fields: Record<string, string>;
  /** Number fields that can be summed. */
  numbers?: Record<string, string>;
  /** Fields whose values sort chronologically. */
  timeFields?: string[];
}

export const CHART_DATASETS = {
  events: {
    label: "Events", dashboard: "events",
    description: "One row per event on the Event Tracker (dated by start).",
    fields: { month: "Start month, YYYY-MM", year: "Start year", type: "Event type (Dell-led, pay-to-play, briefing…)", category: "Event category", city: "City", domain: "Domains/sectors (multi)", portco: "PortCos involved (multi)", partner: "Partners (multi)", status: "DTC status (Completed, Confirmed, Considering…)", owner: "Event owner", format: "Format" },
    numbers: { attendees: "Number of recorded attendees" },
    timeFields: ["month", "year"],
  },
  outreach: {
    label: "Outreach", dashboard: "network",
    description: "One row per outreach touch (sent email, campaign send, logged activity, prospect outreach), one per person per day.",
    fields: { month: "Touch month, YYYY-MM", week: "Week starting (Monday), YYYY-MM-DD", teammate: "Teammate who did the outreach (gets credit)", owner: "Contact owner (Relationship Prime)", source: "Email, Campaign, Logged or Prospect outreach", tier: "Person's current level (Council, Hot, Warm, Cold, Prospect)", domain: "Person's primary domain", market: "Person's market/city" },
    timeFields: ["month", "week"],
  },
  movements: {
    label: "Level changes", dashboard: "network",
    description: "One row per logged rating change (Rating History).",
    fields: { month: "Change month, YYYY-MM", owner: "Contact owner (gets credit)", kind: "Added, Removed, Promoted, Demoted", from: "Previous level", to: "New level", path: "From → To" },
    timeFields: ["month"],
  },
  campaigns: {
    label: "Campaigns", dashboard: "network",
    description: "One row per campaign.",
    fields: { status: "Open, Active or Closed", owner: "Campaign owner", channel: "email, linkedin or both", month: "Created month, YYYY-MM" },
    numbers: { members: "People in the campaign" },
    timeFields: ["month"],
  },
  people: {
    label: "People", dashboard: "network",
    description: "One row per person in Network and Prospecting (current state, not dated).",
    fields: { tier: "Level (Council, Hot, Warm, Cold, Prospect)", owner: "Owner (Relationship Prime)", domain: "Primary domain", market: "Market/city", type: "PortCo, Dell, Partner or Network", company: "Company" },
  },
} satisfies Record<string, DatasetDef>;

export type DatasetKey = keyof typeof CHART_DATASETS;
export const DATASET_KEYS = Object.keys(CHART_DATASETS) as DatasetKey[];
export const datasetsFor = (d: DashboardKey) => DATASET_KEYS.filter((k) => CHART_DATASETS[k].dashboard === d);

export const chartSpecSchema = z.object({
  title: z.string().min(1).max(120),
  dataset: z.enum(DATASET_KEYS as [DatasetKey, ...DatasetKey[]]),
  chart: z.enum(["bar", "stacked", "line", "pie"]),
  x: z.string().min(1),
  series: z.string().nullable(),
  measure: z.enum(["count", "sum"]),
  sumField: z.string().nullable(),
  filters: z.array(z.object({ field: z.string(), values: z.array(z.string()).min(1) })).max(5),
  days: z.number().int().min(1).max(3650).nullable(),
  limit: z.number().int().min(1).max(50).nullable(),
});
export type ChartSpec = z.infer<typeof chartSpecSchema>;

/** Field names used by the spec must belong to its dataset. Returns problems in plain words. */
export function specProblems(spec: ChartSpec, dashboard?: DashboardKey): string[] {
  const def: DatasetDef = CHART_DATASETS[spec.dataset];
  const out: string[] = [];
  if (dashboard && def.dashboard !== dashboard) out.push(`${def.label} isn't available on this dashboard.`);
  const ok = (f: string) => f in def.fields;
  if (!ok(spec.x)) out.push(`Can't group ${def.label} by "${spec.x}".`);
  if (spec.series && !ok(spec.series)) out.push(`Can't split ${def.label} by "${spec.series}".`);
  if (spec.measure === "sum" && !(spec.sumField && def.numbers && spec.sumField in def.numbers)) out.push(`Can't add up "${spec.sumField}" for ${def.label}.`);
  for (const f of spec.filters) if (!ok(f.field)) out.push(`Can't filter ${def.label} by "${f.field}".`);
  return out;
}

const values = (v: FieldValue | undefined): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : v === undefined || v === "" ? [] : [String(v)];

export interface ChartData { rows: ({ label: string; total: number } & Record<string, number | string>)[]; series: string[] }

/** Group (and optionally split) records into chart rows. Multi-value fields count once per value. */
export function buildChartData(records: ChartRecord[], spec: ChartSpec, now = Date.now()): ChartData {
  const def: DatasetDef = CHART_DATASETS[spec.dataset];
  const since = spec.days ? new Date(now - spec.days * 86_400_000).toISOString().slice(0, 10) : "";
  const want = spec.filters.map((f) => ({ field: f.field, set: new Set(f.values.map((v) => v.toLowerCase())) }));
  const grid = new Map<string, Map<string, number>>();
  const seriesSet = new Set<string>();
  for (const r of records) {
    if (since && (!r._date || r._date < since)) continue;
    if (!want.every((f) => values(r[f.field]).some((v) => f.set.has(v.toLowerCase())))) continue;
    const amount = spec.measure === "sum" ? Number(r[spec.sumField || ""]) || 0 : 1;
    const xs = values(r[spec.x]);
    const ss = spec.series ? values(r[spec.series]) : ["value"];
    for (const x of xs.length ? xs : ["(blank)"]) for (const s of ss.length ? ss : ["(blank)"]) {
      if (!grid.has(x)) grid.set(x, new Map());
      grid.get(x)!.set(s, (grid.get(x)!.get(s) || 0) + amount);
      seriesSet.add(s);
    }
  }
  const timeAxis = (def.timeFields || []).includes(spec.x);
  let rows = [...grid].map(([label, m]) => {
    const row: { label: string; total: number } & Record<string, number | string> = { label, total: 0 };
    for (const [s, n] of m) { row[s] = n; row.total += n; }
    return row;
  });
  rows.sort(timeAxis ? (a, b) => a.label.localeCompare(b.label) : (a, b) => b.total - a.total || a.label.localeCompare(b.label));
  const limit = spec.limit ?? (timeAxis ? 50 : 12);
  rows = timeAxis ? rows.slice(-limit) : rows.slice(0, limit);
  const totals = new Map<string, number>();
  for (const r of rows) for (const s of seriesSet) totals.set(s, (totals.get(s) || 0) + (Number(r[s]) || 0));
  const series = [...seriesSet].filter((s) => (totals.get(s) || 0) > 0).sort((a, b) => (totals.get(b) || 0) - (totals.get(a) || 0));
  for (const r of rows) for (const s of series) r[s] = Number(r[s]) || 0;
  return { rows, series };
}

/** Plain-language summary of what a spec shows, for review before saving. */
export function describeSpec(spec: ChartSpec): string {
  const def: DatasetDef = CHART_DATASETS[spec.dataset];
  const what = spec.measure === "sum" ? `Total ${spec.sumField}` : `${def.label} count`;
  const parts = [`${what} by ${spec.x}`];
  if (spec.series) parts.push(`split by ${spec.series}`);
  if (spec.filters.length) parts.push(`only ${spec.filters.map((f) => `${f.field} = ${f.values.join(" / ")}`).join(", ")}`);
  parts.push(spec.days ? `last ${spec.days} days` : "all dates");
  return parts.join(" · ");
}

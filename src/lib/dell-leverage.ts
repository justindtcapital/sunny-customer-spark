/**
 * Dell Leverage Dashboard — pure, browser-safe helpers for a QBR with Dell.
 * Built only from the Dell motions on workstreams (Sell-In Status, Sell With Dell Status, the
 * "Dell Leverage" GTM category), Dell BU (Dell Targets), Dell Stakeholders, Dell Products Aligned and
 * the PortCo Change Log. DTC priorities, ROI/opportunity ratings, investment, owners and notes are
 * never copied into a DellRow, so nothing internal can reach the page or a shared screen.
 */
import { resolveStakeholders } from "./workstream-stakeholders";
import { SWD_STATUS_OPTIONS, sellWithDellStatusFrom } from "./sell-with-dell-status";
import { SELL_IN_OPTIONS, sellInStatusFrom } from "./sell-in-status";
import type { Contact } from "./types";

export type DellMotion = "Sell-In" | "Sell-With";
export const DELL_MOTIONS: readonly DellMotion[] = ["Sell-In", "Sell-With"];

export type DellStage =
  | "Interested"
  | "Working to Engage"
  | "Engaged / Stalled"
  | "Engaged / Progressing"
  | "Existing"
  | "Not Moving Forward"
  | "Not set";

/** Funnel order, earliest first. "Not Moving Forward" (old wording, shown only while used) and "Not set" sit outside the funnel. */
export const PIPELINE_STAGES: readonly DellStage[] = ["Interested", "Working to Engage", "Engaged / Stalled", "Engaged / Progressing", "Existing"];
export const ALL_STAGES: readonly DellStage[] = [...PIPELINE_STAGES, "Not Moving Forward", "Not set"];

/** "… Existing - …" choices, in the same order as the status lists. */
export const SELL_WITH_OUTCOMES = SWD_STATUS_OPTIONS.filter((o) => o.includes("Existing"));
export const SELL_IN_OUTCOMES = SELL_IN_OPTIONS.filter((o) => o.includes("Existing"));

export const NO_BU = "BU not set";
/** Dell-facing engagement notes on a workstream (drafted by V.I.C., approved by a person). Internal "Notes" never reach a DellRow. */
export const DELL_NOTES_FIELD = "Dell Engagement Notes";
/** Dell-facing asks of Dell leaders, stored one per line ("• …"). */
export const DELL_ASKS_FIELD = "Dell Asks";
export const DELL_LEVERAGE_CATEGORY = "Dell Leverage - Sell Through";

/** Workstream fields that must never appear on the Dell Leverage Dashboard. */
export const EXCLUDED_FIELDS = [
  "DTC Priority", "Workstream Priority", "DTC Dell Leverage Priority", "DTC - Dell Leverage Opportunity",
  "DTC Investment ($M)", "DTC Ownership", "Owner", "Notes", "Available Credits",
] as const;

export interface DellStakeholder { name: string; status: "linked" | "ambiguous" | "unlinked"; title?: string; urid?: string }

export interface DellRow {
  /** workstream id + motion (a workstream with both motions gives two rows). */
  id: string;
  workstreamId: string;
  company: string;
  domain: string;
  name: string;
  motion: DellMotion;
  statuses: string[];
  stage: DellStage;
  /** "Existing - …" values on this motion. */
  outcomes: string[];
  bu: string;
  stakeholders: DellStakeholder[];
  products: string[];
  /** Dell-facing notes (DELL_NOTES_FIELD), safe to show Dell. */
  engagementNotes: string;
  /** Dell-facing asks (DELL_ASKS_FIELD), one per item. */
  asks: string[];
  completed: boolean;
  updatedAt: string;
}

/** Only these Workstream properties are read; everything else is ignored. */
export interface DellWorkstreamInput {
  gid: string;
  company: string;
  name: string;
  sellInStatus: string;
  maturity: string;
  category: string;
  dellTargets: string;
  dellStakeholders: string;
  fields: Record<string, string>;
  completed: boolean;
  lastActivity: string;
}

const clean = (s: string) => (s || "").replace(/\s+/g, " ").trim();
const list = (s: string) => clean(s).split(/\s*,\s*/).filter(Boolean);

/** One stored status → stage. A leading "N - " number is ignored so old and new numbering both read. */
export function stageOf(status: string): DellStage {
  const s = clean(status).toLowerCase().replace(/^\d+\s*-\s*/, "");
  if (!s) return "Not set";
  if (s.startsWith("existing")) return "Existing";
  if (s.includes("progressing")) return "Engaged / Progressing";
  if (s.includes("stalled")) return "Engaged / Stalled";
  if (s.includes("trying") || s.includes("working to engage")) return "Working to Engage";
  if (s.includes("interested")) return "Interested";
  if (s.includes("not moving")) return "Not Moving Forward";
  return "Not set";
}

const RANK: Record<DellStage, number> = {
  "Not set": -1, "Not Moving Forward": 0, Interested: 1, "Working to Engage": 2, "Engaged / Stalled": 3, "Engaged / Progressing": 4, Existing: 5,
};
export const stageRank = (s: DellStage) => RANK[s];

/** The furthest stage among a motion's statuses (Existing beats any pipeline stage). */
export function primaryStage(statuses: string[]): DellStage {
  let best: DellStage = "Not set";
  for (const s of statuses) { const st = stageOf(s); if (RANK[st] > RANK[best]) best = st; }
  return best;
}

/** Workstreams → one row per Dell motion. Workstreams without any Dell motion are left out. */
export function dellRowsFrom(
  workstreams: DellWorkstreamInput[],
  opts: { contacts?: Contact[] | null; domainOf?: (company: string) => string } = {},
): DellRow[] {
  const out: DellRow[] = [];
  for (const w of workstreams) {
    if (!w.gid) continue;
    const si = list(sellInStatusFrom(w.sellInStatus));
    const swd = list(sellWithDellStatusFrom(w.maturity));
    const motions: Array<[DellMotion, string[]]> = [];
    if (si.length) motions.push(["Sell-In", si]);
    if (swd.length || clean(w.category) === DELL_LEVERAGE_CATEGORY) motions.push(["Sell-With", swd]);
    if (!motions.length) continue;
    const stakeholders: DellStakeholder[] = opts.contacts
      ? resolveStakeholders(w.dellStakeholders, opts.contacts).map((l) => l.status === "linked"
        ? { name: l.contact.name || l.name, status: "linked", title: l.contact.title || "", urid: l.contact.urid || l.contact.id || "" }
        : { name: l.name, status: l.status })
      : resolveStakeholders(w.dellStakeholders, []).map((l) => ({ name: l.name, status: "unlinked" as const }));
    const products = list(w.fields?.["Dell Products Aligned"] || "");
    for (const [motion, statuses] of motions) {
      out.push({
        id: `${w.gid}:${motion}`,
        workstreamId: w.gid,
        company: clean(w.company),
        domain: opts.domainOf?.(w.company) || "Other",
        name: clean(w.name),
        motion,
        statuses,
        stage: primaryStage(statuses),
        outcomes: statuses.filter((s) => stageOf(s) === "Existing"),
        bu: clean(w.dellTargets) || NO_BU,
        stakeholders,
        products,
        engagementNotes: (w.fields?.[DELL_NOTES_FIELD] || "").trim(),
        asks: parseAsks(w.fields?.[DELL_ASKS_FIELD] || ""),
        completed: !!w.completed,
        updatedAt: clean(w.lastActivity).slice(0, 10),
      });
    }
  }
  return out.sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name) || a.motion.localeCompare(b.motion));
}

// ─── Filters ────────────────────────────────────────────────────────

export interface DellFilter {
  motion: DellMotion | "Both";
  bu: string | null;
  domain: string | null;
  stage: DellStage | null;
  /** One company, picked from the company board. */
  company: string | null;
  missingStakeholders: boolean;
  includeCompleted: boolean;
}
export const DEFAULT_DELL_FILTER: DellFilter = { motion: "Both", bu: null, domain: null, stage: null, company: null, missingStakeholders: false, includeCompleted: true };

export const hasLinkedStakeholder = (r: DellRow) => r.stakeholders.some((s) => s.status === "linked");

export function filterDellRows(rows: DellRow[], f: DellFilter, skip: Array<keyof DellFilter> = []): DellRow[] {
  const on = (k: keyof DellFilter) => !skip.includes(k);
  return rows.filter((r) =>
    (!on("motion") || f.motion === "Both" || r.motion === f.motion)
    && (!on("bu") || !f.bu || r.bu === f.bu)
    && (!on("domain") || !f.domain || r.domain === f.domain)
    && (!on("stage") || !f.stage || r.stage === f.stage)
    && (!on("company") || !f.company || r.company === f.company)
    && (!on("missingStakeholders") || !f.missingStakeholders || !hasLinkedStakeholder(r))
    && (!on("includeCompleted") || f.includeCompleted || !r.completed));
}

// ─── Summaries ──────────────────────────────────────────────────────

export interface Coverage { covered: number; named: number; total: number }

export interface DellSummary {
  workstreams: number;
  active: number;
  byMotion: Record<DellMotion, number>;
  companies: number;
  progressing: number;
  stalled: number;
  existing: number;
  /** stalled / (stalled + progressing); null when nobody is engaged. */
  stalledShare: number | null;
  coverage: Coverage;
  coverageByMotion: Record<DellMotion, Coverage>;
  stakeholderReach: number;
}

function coverageOf(rows: DellRow[]): Coverage {
  const byWs = new Map<string, DellRow>();
  for (const r of rows) byWs.set(r.workstreamId, r);
  const ws = [...byWs.values()];
  return { covered: ws.filter(hasLinkedStakeholder).length, named: ws.filter((r) => r.stakeholders.length > 0).length, total: ws.length };
}

export function summarizeDell(rows: DellRow[]): DellSummary {
  const ids = new Set(rows.map((r) => r.workstreamId));
  const activeIds = new Set(rows.filter((r) => !r.completed).map((r) => r.workstreamId));
  const motionIds = (m: DellMotion) => new Set(rows.filter((r) => r.motion === m).map((r) => r.workstreamId)).size;
  const count = (s: DellStage) => rows.filter((r) => r.stage === s).length;
  const progressing = count("Engaged / Progressing");
  const stalled = count("Engaged / Stalled");
  const people = new Set(rows.flatMap((r) => r.stakeholders.filter((s) => s.status === "linked").map((s) => s.urid || s.name.toLowerCase())));
  return {
    workstreams: ids.size,
    active: activeIds.size,
    byMotion: { "Sell-In": motionIds("Sell-In"), "Sell-With": motionIds("Sell-With") },
    companies: new Set(rows.map((r) => r.company.toLowerCase())).size,
    progressing,
    stalled,
    existing: count("Existing"),
    stalledShare: progressing + stalled ? stalled / (progressing + stalled) : null,
    coverage: coverageOf(rows),
    coverageByMotion: { "Sell-In": coverageOf(rows.filter((r) => r.motion === "Sell-In")), "Sell-With": coverageOf(rows.filter((r) => r.motion === "Sell-With")) },
    stakeholderReach: people.size,
  };
}

/** Counts per stage, split by motion (every stage listed, zeros included). */
export function stageCounts(rows: DellRow[]): Array<{ stage: DellStage; "Sell-In": number; "Sell-With": number; total: number }> {
  return ALL_STAGES.map((stage) => {
    const si = rows.filter((r) => r.stage === stage && r.motion === "Sell-In").length;
    const sw = rows.filter((r) => r.stage === stage && r.motion === "Sell-With").length;
    return { stage, "Sell-In": si, "Sell-With": sw, total: si + sw };
  });
}

export interface BoardCompany { company: string; motions: DellMotion[]; workstreams: number }

/**
 * Company board: each status column lists the companies with a workstream at that status (a company
 * shows in every column it has work in), alphabetical, with the motions it holds there. Empty
 * "Not Moving Forward" / "Not set" columns are left out; the pipeline columns always show.
 */
export function companyStageBoard(rows: DellRow[]): Array<{ stage: DellStage; companies: BoardCompany[]; workstreams: number }> {
  return ALL_STAGES.map((stage) => {
    const mine = rows.filter((r) => r.stage === stage);
    const by = new Map<string, { motions: Set<DellMotion>; ids: Set<string> }>();
    for (const r of mine) {
      const e = by.get(r.company) ?? { motions: new Set<DellMotion>(), ids: new Set<string>() };
      e.motions.add(r.motion); e.ids.add(r.workstreamId); by.set(r.company, e);
    }
    const companies = [...by.entries()].map(([company, e]) => ({ company, motions: DELL_MOTIONS.filter((m) => e.motions.has(m)), workstreams: e.ids.size }))
      .sort((a, b) => a.company.localeCompare(b.company));
    return { stage, companies, workstreams: new Set(mine.map((r) => r.workstreamId)).size };
  }).filter((c) => (PIPELINE_STAGES as DellStage[]).includes(c.stage) || c.companies.length > 0);
}

/** BU × stage counts; BUs alphabetical with "BU not set" last (never ordered by importance). */
export function buHeatmap(rows: DellRow[]): Array<{ bu: string; total: number; companies: number; cells: Record<DellStage, number> }> {
  const bus = [...new Set(rows.map((r) => r.bu))].sort((a, b) => (a === NO_BU ? 1 : b === NO_BU ? -1 : a.localeCompare(b)));
  return bus.map((bu) => {
    const mine = rows.filter((r) => r.bu === bu);
    const cells = Object.fromEntries(ALL_STAGES.map((s) => [s, mine.filter((r) => r.stage === s).length])) as Record<DellStage, number>;
    return { bu, total: mine.length, companies: new Set(mine.map((r) => r.company.toLowerCase())).size, cells };
  });
}

/** Live-with-Dell outcomes: Sell-With outcomes and Sell-In account health, zeros included. */
export function existingOutcomes(rows: DellRow[]): { sellWith: Array<{ outcome: string; count: number }>; sellIn: Array<{ outcome: string; count: number }> } {
  const tally = (motion: DellMotion, options: readonly string[]) => options.map((outcome) => ({
    outcome,
    count: rows.filter((r) => r.motion === motion && r.outcomes.some((o) => o.toLowerCase() === outcome.toLowerCase())).length,
  }));
  return { sellWith: tally("Sell-With", SELL_WITH_OUTCOMES), sellIn: tally("Sell-In", SELL_IN_OUTCOMES) };
}

export interface StakeholderPerson { name: string; title: string; linked: boolean; workstreams: Array<{ company: string; name: string; motion: DellMotion }> }

/** Dell people named on these rows, one entry per person (linked first, then alphabetical). */
export function peopleOf(rows: DellRow[]): StakeholderPerson[] {
  const people = new Map<string, StakeholderPerson>();
  for (const r of rows) for (const s of r.stakeholders) {
    const key = s.status === "linked" ? `u:${s.urid || s.name.toLowerCase()}` : `n:${s.name.toLowerCase()}`;
    const p = people.get(key) || { name: s.name, title: s.title || "", linked: s.status === "linked", workstreams: [] };
    if (!p.workstreams.some((w) => w.company === r.company && w.name === r.name && w.motion === r.motion)) p.workstreams.push({ company: r.company, name: r.name, motion: r.motion });
    people.set(key, p);
  }
  return [...people.values()].sort((a, b) => Number(b.linked) - Number(a.linked) || a.name.localeCompare(b.name));
}

/** Per BU: Dell people named on its workstreams (linked first) and how many workstreams have nobody linked. */
export function stakeholderMap(rows: DellRow[]): Array<{ bu: string; people: StakeholderPerson[]; gaps: number; workstreams: number }> {
  return buHeatmap(rows).map(({ bu }) => {
    const mine = rows.filter((r) => r.bu === bu);
    const wsIds = new Set(mine.map((r) => r.workstreamId));
    const gapIds = new Set(mine.filter((r) => !hasLinkedStakeholder(r)).map((r) => r.workstreamId));
    return {
      bu,
      people: peopleOf(mine),
      gaps: gapIds.size,
      workstreams: wsIds.size,
    };
  });
}

/** Dell products by how many workstreams name them (ties alphabetical). */
export function productCounts(rows: DellRow[]): Array<{ product: string; count: number }> {
  const byProduct = new Map<string, Set<string>>();
  for (const r of rows) for (const p of r.products) byProduct.set(p, (byProduct.get(p) || new Set()).add(r.workstreamId));
  return [...byProduct.entries()].map(([product, ids]) => ({ product, count: ids.size })).sort((a, b) => b.count - a.count || a.product.localeCompare(b.product));
}

// ─── Movement since last QBR (PortCo Change Log) ────────────────────

export interface StatusChange { at: string; kind: string; recordId: string; company: string; field: string; before: string; after: string }
export type MovementKind = "advanced" | "slipped" | "new" | "closed";
export interface Movement { kind: MovementKind; workstreamId: string; company: string; name: string; motion: DellMotion; from: DellStage; to: DellStage; at: string }

const MOTION_FOR_FIELD: Record<string, DellMotion> = {
  "sell-in status": "Sell-In",
  "sell with dell status": "Sell-With",
  "sell with dell - maturity": "Sell-With",
};

/**
 * Status moves between `from` and `to` (inclusive ISO dates): for each workstream motion, the value
 * before its first change in the window against the value after its last one. Renames that keep the
 * same stage and edits undone inside the window are not movement.
 */
export function movementInWindow(changes: StatusChange[], rows: DellRow[], from: string, to: string): Movement[] {
  const names = new Map(rows.map((r) => [r.workstreamId, r]));
  const groups = new Map<string, StatusChange[]>();
  for (const c of changes) {
    const motion = MOTION_FOR_FIELD[clean(c.field).toLowerCase()];
    const day = clean(c.at).slice(0, 10);
    if (!motion || clean(c.kind).toLowerCase() !== "workstream" || !c.recordId || !day || day < from || day > to) continue;
    const key = `${c.recordId}|${motion}`;
    groups.set(key, [...(groups.get(key) || []), c]);
  }
  const out: Movement[] = [];
  for (const [key, entries] of groups) {
    const [workstreamId, motion] = key.split("|") as [string, DellMotion];
    entries.sort((a, b) => a.at.localeCompare(b.at));
    const first = entries[0]!;
    const last = entries[entries.length - 1]!;
    const norm = (v: string) => list(motion === "Sell-With" ? sellWithDellStatusFrom(v) : sellInStatusFrom(v));
    const before = norm(first.before);
    const after = norm(last.after);
    const fromStage = primaryStage(before);
    const toStage = primaryStage(after);
    let kind: MovementKind | null = null;
    if (!before.length && after.length) kind = toStage === "Not Moving Forward" ? "closed" : "new";
    else if (before.length && (!after.length || toStage === "Not Moving Forward")) kind = fromStage === "Not Moving Forward" ? null : "closed";
    else if (RANK[toStage] > RANK[fromStage]) kind = "advanced";
    else if (RANK[toStage] < RANK[fromStage]) kind = "slipped";
    if (!kind) continue;
    const row = names.get(workstreamId);
    out.push({ kind, workstreamId, company: row?.company || first.company, name: row?.name || "", motion, from: fromStage, to: toStage, at: clean(last.at).slice(0, 10) });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at) || a.company.localeCompare(b.company));
}

/** Change Log rows (header row first) → status changes for the Dell fields only. */
export function statusChangesFromLog(rows: string[][]): StatusChange[] {
  const headers = (rows[0] || []).map((h) => clean(h).toLowerCase());
  const col = (n: string) => headers.indexOf(n.toLowerCase());
  const idx = { at: col("At"), kind: col("Kind"), id: col("Record ID"), co: col("Company"), field: col("Field"), before: col("Before"), after: col("After") };
  const get = (r: string[], i: number) => (i >= 0 ? clean(r[i] || "") : "");
  return rows.slice(1)
    .map((r) => ({ at: get(r, idx.at), kind: get(r, idx.kind), recordId: get(r, idx.id), company: get(r, idx.co), field: get(r, idx.field), before: get(r, idx.before), after: get(r, idx.after) }))
    .filter((c) => MOTION_FOR_FIELD[c.field.toLowerCase()] && c.kind.toLowerCase() === "workstream");
}

// ─── Detail panels ──────────────────────────────────────────────────

export interface DellWorkstream {
  workstreamId: string;
  company: string;
  name: string;
  bu: string;
  motions: Array<{ motion: DellMotion; statuses: string[]; stage: DellStage }>;
  stakeholders: DellStakeholder[];
  products: string[];
  engagementNotes: string;
  asks: string[];
  completed: boolean;
  updatedAt: string;
}

/** Rows → one entry per workstream (its Sell-In and Sell-With motions merged), furthest stage first. */
export function workstreamsOf(rows: DellRow[]): DellWorkstream[] {
  const by = new Map<string, DellWorkstream>();
  for (const r of rows) {
    const w = by.get(r.workstreamId) ?? {
      workstreamId: r.workstreamId, company: r.company, name: r.name, bu: r.bu, motions: [], stakeholders: r.stakeholders,
      products: r.products, engagementNotes: r.engagementNotes, asks: r.asks, completed: r.completed, updatedAt: r.updatedAt,
    };
    if (!w.motions.some((m) => m.motion === r.motion)) w.motions.push({ motion: r.motion, statuses: r.statuses, stage: r.stage });
    by.set(r.workstreamId, w);
  }
  const top = (w: DellWorkstream) => Math.max(...w.motions.map((m) => RANK[m.stage]));
  return [...by.values()].sort((a, b) => top(b) - top(a) || a.name.localeCompare(b.name));
}

/** Status pop-up: the companies with work at `stage`, alphabetical, each with only its workstreams at that stage. */
export function companiesAtStage(rows: DellRow[], stage: DellStage): Array<{ company: string; workstreams: DellWorkstream[]; people: StakeholderPerson[] }> {
  const mine = rows.filter((r) => r.stage === stage);
  const companies = [...new Set(mine.map((r) => r.company))].sort((a, b) => a.localeCompare(b));
  return companies.map((company) => {
    const theirs = mine.filter((r) => r.company === company);
    return { company, workstreams: workstreamsOf(theirs), people: peopleOf(theirs) };
  });
}

/** Company pop-up: the company's Dell BUs (alphabetical, "BU not set" last) with the workstreams in each. */
export function companyRelationships(rows: DellRow[], company: string): Array<{ bu: string; workstreams: DellWorkstream[] }> {
  const mine = rows.filter((r) => r.company === company);
  return buHeatmap(mine).map(({ bu }) => ({ bu, workstreams: workstreamsOf(mine.filter((r) => r.bu === bu)) }));
}

// ─── V.I.C. engagement-note drafts ──────────────────────────────────

/** Words that mark internal DTC judgment; a drafted sentence containing one is dropped before anyone sees it. */
const INTERNAL_TERMS = /\b(needle[- ]mover|nurture|back[- ]burner|must do|should do|could do|roi|priority|priorities|prioriti[sz]e|investment|invested|ownership|valuation|cap table|term sheet|board seat|dtc[- ]internal)\b/i;

/**
 * A V.I.C. draft made safe to show Dell: sentences naming internal priorities, ROI, investment or
 * ownership are removed, whitespace is tidied and the note is capped at 600 characters.
 */
export function sanitizeDellNote(text: string): string {
  const sentences = clean(text).split(/(?<=[.!?])\s+/).filter((x) => x && !INTERNAL_TERMS.test(x));
  let out = "";
  for (const x of sentences) {
    if ((out ? out.length + 1 : 0) + x.length > 600) break;
    out = out ? `${out} ${x}` : x;
  }
  return out;
}

// ─── Engagement list (the table under the company board) ────────────

/**
 * Rows → the engagement list: companies alphabetical, each with its workstreams (Sell-In and
 * Sell-With merged), furthest stage first. Only the motions present in `rows` are kept, so a status
 * or motion filter shows just the matching side of each workstream.
 */
export function engagementList(rows: DellRow[]): Array<{ company: string; workstreams: DellWorkstream[] }> {
  const companies = [...new Set(rows.map((r) => r.company))].sort((a, b) => a.localeCompare(b));
  return companies.map((company) => ({ company, workstreams: workstreamsOf(rows.filter((r) => r.company === company)) }));
}

/** Position on the stage track (0 = Interested … 4 = Existing); -1 for "Not Moving Forward" / "Not set". */
export const trackIndex = (stage: DellStage) => (PIPELINE_STAGES as DellStage[]).indexOf(stage);

/** A V.I.C. draft in two parts → one Dell-facing note: current state, then "Next steps: …" on its own line. */
export function composeDellNote(current: string, next: string): string {
  const c = sanitizeDellNote(current);
  const n = sanitizeDellNote(next.replace(/^\s*next steps?\s*:\s*/i, ""));
  if (!c) return n ? `Next steps: ${n}` : "";
  return n ? `${c}\nNext steps: ${n}` : c;
}

/** Stored asks → items: one per line or "•" bullet, bullet marks and blanks dropped, repeats removed. */
export function parseAsks(text: string): string[] {
  const seen = new Set<string>();
  return (text || "").split(/\n|•/).map((x) => x.replace(/^\s*[-*\u2022]\s*/, "").replace(/\s+/g, " ").trim())
    .filter((x) => x && !seen.has(x.toLowerCase()) && !!seen.add(x.toLowerCase()));
}

/** Items → the stored "Dell Asks" text, one "• ask" per line. */
export const formatAsks = (asks: string[]) => parseAsks(asks.join("\n")).map((a) => `• ${a}`).join("\n");

/** V.I.C.-suggested asks made Dell-safe: internal sentences dropped, at most 3, each capped at 160 characters. */
export const sanitizeDellAsks = (asks: string[]) => parseAsks(asks.map((a) => sanitizeDellNote(a).slice(0, 160)).join("\n")).slice(0, 3);

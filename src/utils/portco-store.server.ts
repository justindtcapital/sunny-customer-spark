/**
 * Venture Pulse storage for PortCo profiles and workstreams ("PortCo Profiles" and "Workstreams"
 * Sheets tabs). Replaces Asana as the source of truth: every write lands here, never in Asana.
 * Edits re-read the row fresh, refuse conflicting changes, write only changed cells and log them.
 */
import { appendSheetRows, colLetters, ensureTab, fetchSheetTab, updateSheetCells } from "./sheets.server";
import type { Workstream, WorkstreamSegment } from "@/lib/workstream-parse";
import type { FieldChange } from "@/lib/asana-field-payload";
import { PORTDEV_OPS } from "@/lib/portco-import";
import { PROFILE_FIELD_DEFS, WORKSTREAM_FIELD_DEFS, cellChangesFromFieldChanges, fieldMeta, planRowEdit, storedOwner, type CellChange } from "@/lib/portco-fields-schema";

export const PROFILES_TAB = "PortCo Profiles";
export const WORKSTREAMS_TAB = "Workstreams";
export const CHANGE_LOG_TAB = "PortCo Change Log";

export const PROFILE_HEADERS = ["PortCo URID", "Company", "Owner", ...PROFILE_FIELD_DEFS.map((d) => d.name), "Archived Fields", "Asana GID", "Updated At", "Updated By"];
export const WORKSTREAM_HEADERS = ["Workstream ID", "PortCo URID", "Company", "Segment", "Name", "Owner", "Completed", "Completed At", "Created At", "Due Date", "Notes", ...WORKSTREAM_FIELD_DEFS.map((d) => d.name), "Archived Fields", "Asana GID", "Asana Name", "Updated At", "Updated By"];
export const CHANGE_LOG_HEADERS = ["At", "By", "Kind", "Record ID", "Company", "Field", "Before", "After"];

interface SheetRow { row: number; cells: Record<string, string> }

function parseTab(rows: string[][]): { headers: string[]; items: SheetRow[] } {
  const headers = (rows[0] || []).map((h) => h.trim());
  const items = rows.slice(1).map((r, i) => ({ row: i + 2, cells: Object.fromEntries(headers.map((h, j) => [h, (r[j] ?? "").trim()])) }))
    .filter((x) => Object.values(x.cells).some(Boolean));
  return { headers, items };
}

function parseJson(cell: string): Record<string, string> {
  if (!cell) return {};
  try {
    const v = JSON.parse(cell);
    return v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string")) as Record<string, string> : {};
  } catch {
    return {};
  }
}

const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();

async function logChanges(kind: "profile" | "workstream", id: string, company: string, by: string, changes: { field: string; before: string; after: string }[]) {
  if (!changes.length) return;
  await ensureTab(CHANGE_LOG_TAB, CHANGE_LOG_HEADERS);
  const at = nowIso();
  await appendSheetRows(CHANGE_LOG_TAB, changes.map((c) => [at, by, kind, id, company, c.field, c.before, c.after]), true);
}

async function writeCells(tab: string, headers: string[], row: number, values: Record<string, string>) {
  const updates = Object.entries(values).map(([h, value]) => {
    const idx = headers.indexOf(h);
    if (idx < 0) throw new Error(`The "${tab}" tab is missing the "${h}" column.`);
    return { range: `${colLetters(idx)}${row}`, value };
  });
  await updateSheetCells(tab, updates, true);
}

// ─── PortCo profiles ────────────────────────────────────────────────

export interface PortcoProfile {
  row: number;
  urid: string;
  company: string;
  owner: string;
  fields: Record<string, string>;
  archived: Record<string, string>;
  updatedAt: string;
  updatedBy: string;
}

function toProfile(x: SheetRow): PortcoProfile {
  const fields: Record<string, string> = {};
  for (const d of PROFILE_FIELD_DEFS) if (x.cells[d.name]) fields[d.name] = x.cells[d.name]!;
  return { row: x.row, urid: x.cells["PortCo URID"] || "", company: x.cells["Company"] || "", owner: x.cells["Owner"] || "", fields, archived: parseJson(x.cells["Archived Fields"] || ""), updatedAt: x.cells["Updated At"] || "", updatedBy: x.cells["Updated By"] || "" };
}

export async function readProfiles(fresh = false): Promise<PortcoProfile[]> {
  const rows = await fetchSheetTab(PROFILES_TAB, fresh).catch((e) => {
    if (/Unable to parse range/i.test(String(e))) return [] as string[][];
    throw e;
  });
  return parseTab(rows).items.map(toProfile).filter((p) => p.company);
}

/** Same shape the Asana field map had: lowercased company name → kept profile values. */
export async function fetchPortcoProfileFields(): Promise<Map<string, { name: string; fields: Record<string, string> }>> {
  const { buildPortfolioCompanies } = await import("./sheets.server");
  const [profiles, companies] = await Promise.all([readProfiles(), buildPortfolioCompanies().catch(() => [])]);
  // A renamed PortCo keeps its profile: the URID wins over the name stored on the profile row.
  const nameByUrid = new Map(companies.filter((c) => c.urid).map((c) => [c.urid!, c.name]));
  const out = new Map<string, { name: string; fields: Record<string, string> }>();
  for (const p of profiles) {
    const name = (p.urid && nameByUrid.get(p.urid)) || p.company;
    out.set(name.trim().toLowerCase(), { name, fields: p.fields });
  }
  return out;
}

/** Save profile edits for one PortCo; creates its profile row the first time. */
export async function saveProfileFields(input: { urid?: string; company: string; changes: CellChange[] }, by: string): Promise<PortcoProfile> {
  await ensureTab(PROFILES_TAB, PROFILE_HEADERS);
  const { headers, items } = parseTab(await fetchSheetTab(PROFILES_TAB, true));
  const key = input.company.trim().toLowerCase();
  let hit = items.find((x) => (input.urid && x.cells["PortCo URID"] === input.urid) || (x.cells["Company"] || "").toLowerCase() === key);
  if (!hit) {
    const { buildPortfolioCompanies } = await import("./sheets.server");
    const co = (await buildPortfolioCompanies(true)).find((c) => (input.urid && c.urid === input.urid) || c.name.trim().toLowerCase() === key);
    if (!co) throw new Error(`"${input.company}" isn't a PortCo in Venture Pulse.`);
    await appendSheetRows(PROFILES_TAB, [PROFILE_HEADERS.map((h) => (h === "PortCo URID" ? co.urid || "" : h === "Company" ? co.name : ""))], true);
    const again = parseTab(await fetchSheetTab(PROFILES_TAB, true));
    hit = again.items.find((x) => (x.cells["Company"] || "").toLowerCase() === co.name.trim().toLowerCase());
    if (!hit) throw new Error("Couldn't create the profile row — try again.");
  }
  const plan = planRowEdit(hit.cells, input.changes, PROFILE_FIELD_DEFS);
  if (plan.length) {
    await writeCells(PROFILES_TAB, headers.length ? headers : PROFILE_HEADERS, hit.row, { ...Object.fromEntries(plan.map((p) => [p.field, p.after])), "Updated At": nowIso(), "Updated By": by });
    await logChanges("profile", hit.cells["PortCo URID"] || hit.cells["Company"] || "", hit.cells["Company"] || "", by, plan);
  }
  for (const p of plan) hit.cells[p.field] = p.after;
  return toProfile(hit);
}

// ─── Workstreams ────────────────────────────────────────────────────

const FIELD_FOR: Array<[keyof Workstream, string]> = [
  ["workstreamStatus", "Workstream Status"], ["workstreamPriority", "Workstream Priority"],
  ["category", "GTM Strategy Category"], ["sellInStatus", "Sell-In Status"],
  ["maturity", "Sell With Dell - Maturity"], ["gtmMaturity", "Sell With Dell - Maturity"],
  ["dellTargets", "Dell Targets"], ["targets", "Dell Targets"],
  ["dellStakeholders", "Dell Stakeholders"], ["sageTapStatus", "SageTap Status"],
];

function toWorkstream(x: SheetRow): Workstream {
  const c = x.cells;
  const fields: Record<string, string> = {};
  for (const d of WORKSTREAM_FIELD_DEFS) if (c[d.name]) fields[d.name] = c[d.name]!;
  const editable: Workstream["editable"] = {};
  const value = (f: string) => c[f] || "";
  for (const [k, f] of FIELD_FOR) editable[k] = fieldMeta(WORKSTREAM_FIELD_DEFS.find((d) => d.name === f)!, value(f));
  const seg = (c["Segment"] || "").toUpperCase();
  const segment: WorkstreamSegment = seg === "BD" ? "BD" : seg === "GTM" ? "GTM" : "Other";
  const company = c["Company"] || "";
  const status = value("Workstream Status");
  return {
    gid: c["Workstream ID"] || "",
    companyKey: company.toLowerCase(),
    company,
    segment,
    name: c["Name"] || "",
    rawName: c["Name"] || "",
    status: "",
    workstreamStatus: status,
    workstreamPriority: value("Workstream Priority"),
    category: value("GTM Strategy Category"),
    sellInStatus: value("Sell-In Status"),
    maturity: value("Sell With Dell - Maturity"),
    dellTargets: value("Dell Targets"),
    dellStakeholders: value("Dell Stakeholders"),
    nextSteps: "",
    traction: "",
    momentum: "",
    channel: "",
    targets: value("Dell Targets"),
    sageTapStatus: value("SageTap Status"),
    lastPitchReviewed: "",
    gtmMaturity: value("Sell With Dell - Maturity"),
    salesMaturity: "",
    notes: c["Notes"] || "",
    fields,
    editable,
    owner: c["Owner"] || "",
    completed: /^true$/i.test(c["Completed"] || "") || /^(complete|completed)$/i.test(status),
    createdAt: c["Created At"] || "",
    completedAt: c["Completed At"] || "",
    lastActivity: (c["Updated At"] || c["Created At"] || "").slice(0, 10),
  };
}

async function workstreamRows(fresh: boolean) {
  const rows = await fetchSheetTab(WORKSTREAMS_TAB, fresh).catch((e) => {
    if (/Unable to parse range/i.test(String(e))) return [] as string[][];
    throw e;
  });
  return parseTab(rows);
}

export async function readWorkstreams(fresh = false): Promise<Workstream[]> {
  return (await workstreamRows(fresh)).items.map(toWorkstream).filter((w) => w.gid && w.name);
}

/** Dropped Asana fields kept per workstream, for the table's column chooser. */
export async function readWorkstreamArchives(): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  for (const x of (await workstreamRows(false)).items) {
    const a = parseJson(x.cells["Archived Fields"] || "");
    if (x.cells["Workstream ID"] && Object.keys(a).length) out[x.cells["Workstream ID"]] = a;
  }
  return out;
}

export interface WorkstreamUpdate {
  gid: string;
  changes: FieldChange[];
  completed?: boolean;
  title?: { original: string; value: string };
  owner?: { original: string; value: string };
  notes?: { original: string; value: string };
}

export async function updateWorkstream(input: WorkstreamUpdate, by: string): Promise<Workstream> {
  const { headers, items } = await workstreamRows(true);
  const hit = items.find((x) => x.cells["Workstream ID"] === input.gid);
  if (!hit) throw new Error("That workstream no longer exists — refresh and try again.");
  const cellChanges = cellChangesFromFieldChanges(input.changes);
  if (input.owner) cellChanges.push({ field: "Owner", original: input.owner.original, value: input.owner.value });
  const plan = planRowEdit(hit.cells, cellChanges, WORKSTREAM_FIELD_DEFS);
  const check = (field: string, edit?: { original: string; value: string }) => {
    if (!edit) return;
    const before = hit.cells[field] || "";
    if (before.trim() !== edit.original.trim()) throw new Error(`The workstream ${field.toLowerCase()} was changed by someone else — refresh and try again.`);
    const after = edit.value.trim();
    if (field === "Name" && !after) throw new Error("Workstream title cannot be empty.");
    if (after !== before.trim()) plan.push({ field, before, after });
  };
  check("Name", input.title);
  check("Notes", input.notes);
  if (typeof input.completed === "boolean") {
    const before = hit.cells["Completed"] || "FALSE";
    const after = input.completed ? "TRUE" : "FALSE";
    if (before.toUpperCase() !== after) {
      plan.push({ field: "Completed", before, after });
      plan.push({ field: "Completed At", before: hit.cells["Completed At"] || "", after: input.completed ? today() : "" });
    }
  }
  if (plan.length) {
    await writeCells(WORKSTREAMS_TAB, headers, hit.row, { ...Object.fromEntries(plan.map((p) => [p.field, p.after])), "Updated At": nowIso(), "Updated By": by });
    await logChanges("workstream", input.gid, hit.cells["Company"] || "", by, plan);
    for (const p of plan) hit.cells[p.field] = p.after;
    hit.cells["Updated At"] = nowIso();
  }
  return toWorkstream(hit);
}

/** Create a workstream under a PortCo (or the team's PortDev Ops bucket). */
export async function createWorkstream(input: { company: string; segment: "GTM" | "BD"; name: string; owner?: string }, by: string): Promise<Workstream> {
  const name = input.name.trim();
  if (!name) throw new Error("Workstream name is required");
  let company = input.company.trim();
  let urid = "";
  if (company.toLowerCase() !== PORTDEV_OPS.toLowerCase()) {
    const { buildPortfolioCompanies } = await import("./sheets.server");
    const co = (await buildPortfolioCompanies()).find((c) => c.name.trim().toLowerCase() === company.toLowerCase());
    if (!co) throw new Error(`"${company}" isn't a PortCo in Venture Pulse.`);
    company = co.name;
    urid = co.urid || "";
  } else company = PORTDEV_OPS;
  await ensureTab(WORKSTREAMS_TAB, WORKSTREAM_HEADERS);
  const id = `ws-${crypto.randomUUID()}`;
  const at = nowIso();
  const cells: Record<string, string> = {
    "Workstream ID": id, "PortCo URID": urid, Company: company, Segment: input.segment, Name: name,
    Owner: input.owner ? storedOwner(input.owner) : "", Completed: "FALSE", "Created At": today(), "Updated At": at, "Updated By": by,
  };
  await appendSheetRows(WORKSTREAMS_TAB, [WORKSTREAM_HEADERS.map((h) => cells[h] ?? "")], true);
  await logChanges("workstream", id, company, by, [{ field: "Created", before: "", after: `${input.segment} · ${name}` }]);
  return toWorkstream({ row: 0, cells });
}

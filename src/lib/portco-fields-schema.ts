/**
 * Venture Pulse field schema for PortCo profiles and workstreams (replaces Asana custom fields).
 * Browser-safe and pure: option lists are fixed here; values are stored by option name.
 */
import type { FieldChange, WorkstreamFieldMeta } from "./asana-field-payload";
import { LEAD_INVESTORS } from "./portco-import";
import { teamMemberFor, CORE_TEAM } from "./user-ownership";
import { SWD_STATUS_FIELD, SWD_STATUS_OPTIONS } from "./sell-with-dell-status";

export type PortcoFieldType = "enum" | "multi_enum" | "number" | "date" | "text";
export interface PortcoFieldDef { name: string; type: PortcoFieldType; options?: readonly string[] }

const SAGETAP = ["Pending Setup / Onboarding", "Onboarded / No Campaigns", "Onboarded / Active Campaigns", "Experienced / Ongoing User", "Frustrated User", "Paused/Not Active Right Now", "Campaign/Credits Ended"];

export const PROFILE_FIELD_DEFS: readonly PortcoFieldDef[] = [
  { name: "DTC Priority", type: "enum", options: ["1 - Needle Mover", "2 - Nurture", "3 - Back-Burner", "Exited"] },
  { name: "DTC Investment ($M)", type: "number" },
  { name: "DTC Ownership", type: "number" },
  { name: "Lead Investor", type: "enum", options: LEAD_INVESTORS },
  { name: "Company Stage", type: "enum", options: ["Seed", "SAFE", "Series A", "Series B", "Series C", "Series D", "Late Stage", "Exited"] },
  { name: "GTM Marketing/PMF", type: "enum", options: ["1 - Premature", "2 - Basic", "3 - Moderate", "4 - Proven & Refining", "5 - Mature & Scaleable"] },
  { name: "Sales Maturity", type: "enum", options: ["1 - Founder Led Sales", "2 - Immature / Emerging", "3 - Repeatable / Tooled", "4 - Enterprise Ready", "5 - Mature & Scaling"] },
  { name: "Help / Influence", type: "enum", options: ["Needs", "Wants", "Accepts", "Resists", "n/a"] },
  { name: "SageTap Status", type: "enum", options: SAGETAP },
  { name: SWD_STATUS_FIELD, type: "multi_enum", options: SWD_STATUS_OPTIONS },
  { name: "Dell Channel Aligned", type: "multi_enum", options: ["Dell OEM", "Dell CSS", "Dell ETC", "Dell Services", "Dell DP3", "Dell GTO"] },
  { name: "Last Pitch Reviewed", type: "date" },
  { name: "Sales Momentum", type: "text" },
  { name: "DTC - Sales Assist Activity", type: "text" },
];

export const WORKSTREAM_FIELD_DEFS: readonly PortcoFieldDef[] = [
  { name: "Workstream Status", type: "multi_enum", options: ["Complete", "Stalled", "Working to Complete", "Early Conversations", "No Success"] },
  { name: "Workstream Priority", type: "enum", options: ["1: High - Must Do", "2: Med - Should Do", "3: Low - Could Do"] },
  { name: "Sell-In Status", type: "enum", options: ["1 - Engaged /Progressing", "2 - Engaged / Stalled", "3 - Trying to Engage", "Not Moving Forward", "Interested / Not Engaged"] },
  { name: "GTM Strategy Category", type: "enum", options: ["Dell Leverage - Sell Through", "Other Partner - Sell Through", "Strategy Work - General", "PMF / Messaging Work"] },
  { name: "Dell Stakeholders", type: "text" },
  { name: "Dell Targets", type: "enum", options: ["Dell - A/P", "Dell - Edge BU", "Dell - UDS", "Dell - IT", "Dell - Rev Ops", "Dell - CSG", "Dell - CSS", "Dell - Services", "Dell - ISG", "Dell - DFS", "Dell - ARB", "Dell - Supply Chain", "Dell - Execs", "Dell - Finance", "Dell - Sales", "Dell - OEM"] },
  { name: SWD_STATUS_FIELD, type: "multi_enum", options: SWD_STATUS_OPTIONS },
  { name: "DTC - Dell Leverage Opportunity", type: "enum", options: ["Immediate - Active", "Potentially - Evaluating", "Feasable - No Activity"] },
  { name: "DTC Dell Leverage Priority", type: "enum", options: ["High ROI", "Moderate ROI", "Low ROI"] },
  { name: "SageTap Status", type: "enum", options: SAGETAP },
  { name: "Available Credits", type: "text" },
  { name: "Dell Services Aligned", type: "enum", options: ["Yes - Delivery Services", "Yes - Operations / Managed", "No - In Progress", "No - Not Started", "Early Discussions"] },
  { name: "Dell Products Aligned", type: "multi_enum", options: ["Dell Laptops", "Dell Ai Factory", "Dell Ai PC", "Dell UDS - Powerscale", "Dell UDS - ObjectScale", "Dell ISG - PowerEdge", "Dell ISG - PowerFlex", "Dell ISG - PowerProtect", "Dell ISG - DAP", "Dell ISG - AIDP", "Dell OEM", "Dell DFS - FlexOnDemand", "Dell DFS - Utility"] },
];

/** Owner choices: the Venture Pulse team only, by full name. */
export const OWNER_OPTIONS: readonly string[] = CORE_TEAM.map((m) => m.name);

const clean = (s: string) => (s || "").replace(/\s+/g, " ").trim();
const splitMulti = (s: string) => clean(s).split(/\s*,\s*/).filter(Boolean);

/** Canonical option spelling ("scott " → "Scott"); unknown values are returned as-is. */
export function canonicalOption(def: PortcoFieldDef, raw: string): string {
  const v = clean(raw);
  return def.options?.find((o) => o.toLowerCase() === v.toLowerCase()) ?? v;
}

/** Stored string → editor value (names for choices, arrays for multi-choice). */
export function fieldMeta(def: PortcoFieldDef, stored: string): WorkstreamFieldMeta {
  const options = def.options?.map((o) => ({ gid: o, name: o }));
  const value = def.type === "multi_enum" ? splitMulti(stored).map((v) => canonicalOption(def, v)) : def.type === "enum" ? canonicalOption(def, stored) : clean(stored);
  // A stored value outside the list stays visible so it is never silently dropped.
  if (options) for (const v of Array.isArray(value) ? value : value ? [value] : []) if (!options.some((o) => o.gid === v)) options.push({ gid: v, name: v });
  return { gid: def.name, name: def.name, type: def.type, options, value, editable: true };
}

/** Validate one edit and return the string to store. Throws a user-readable error. */
export function storedValueFor(def: PortcoFieldDef, value: string | string[]): string {
  // Multi-choice values may arrive as one comma-separated string (no option contains a comma).
  const list = Array.isArray(value) ? value.map(clean).filter(Boolean) : def.type === "multi_enum" ? splitMulti(value) : [clean(value)].filter(Boolean);
  switch (def.type) {
    case "enum":
    case "multi_enum": {
      if (def.type === "enum" && list.length > 1) throw new Error(`"${def.name}" takes one choice.`);
      for (const v of list) if (!def.options?.includes(v)) throw new Error(`"${v}" isn't a choice for "${def.name}".`);
      return list.join(", ");
    }
    case "number": {
      const s = list[0] || "";
      if (s && !Number.isFinite(Number(s.replace(/,/g, "")))) throw new Error(`"${s}" is not a number`);
      return s.replace(/,/g, "");
    }
    case "date": {
      const s = list[0] || "";
      if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`"${s}" is not a valid date`);
      return s;
    }
    default:
      return Array.isArray(value) ? list.join(", ") : clean(value);
  }
}

/** Owner edits accept any teammate alias and store the full name; anyone else is refused. */
export function storedOwner(raw: string): string {
  if (!clean(raw)) return "";
  const m = teamMemberFor(raw);
  if (!m || !OWNER_OPTIONS.includes(m.displayName)) throw new Error(`"${clean(raw)}" isn't on the Venture Pulse team.`);
  return m.displayName;
}

/** Order- and spacing-insensitive form used for conflict checks. */
const comparable = (v: string | string[]) => (Array.isArray(v) ? v : splitMulti(v)).map((x) => clean(x).toLowerCase()).filter(Boolean).sort().join("|");

export interface CellChange { field: string; original: string | string[]; value: string | string[] }

/**
 * Plan a row edit against the freshly read row: refuse when someone else changed a field since
 * the editor opened it, and return only the cells that actually change.
 */
export function planRowEdit(
  current: Record<string, string>,
  changes: CellChange[],
  defs: readonly PortcoFieldDef[],
): { field: string; before: string; after: string }[] {
  const out: { field: string; before: string; after: string }[] = [];
  for (const c of changes) {
    const def = c.field === "Owner" ? null : defs.find((d) => d.name === c.field);
    if (c.field !== "Owner" && !def) throw new Error(`"${c.field}" can't be edited.`);
    const before = clean(current[c.field] || "");
    if (comparable(before) !== comparable(c.original)) throw new Error(`"${c.field}" was changed by someone else since you opened it — refresh and try again.`);
    const after = def ? storedValueFor(def, c.value) : storedOwner(String(c.value));
    if (after !== before) out.push({ field: c.field, before, after });
  }
  return out;
}

/** Workstream editor changes (FieldChange uses the field name as its id) → cell changes. */
export function cellChangesFromFieldChanges(changes: FieldChange[]): CellChange[] {
  return changes.map((c) => ({ field: c.gid, original: c.original, value: c.value }));
}

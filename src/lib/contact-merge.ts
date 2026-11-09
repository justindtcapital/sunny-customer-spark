// Pure helpers for merging duplicate people on the unified Contacts list.
//
// A merge keeps ONE record (the "main" record, which keeps its URID) and
// archives the others in place: their Relationship Status becomes "Merged" and
// "Merged Into" points at the main record. The main record lists the archived
// URIDs in "Merged URIDs" and carries every email address (cleared from the
// archived copy, restored on undo), so events, notes,
// PortCo intros and campaigns keyed by the old URID or email show on the main
// profile at read time — no history rows are rewritten, and undo is exact.

import { linkedinIdentity, normalizeIdentity } from "./import-dedupe";
import { isProspectStatus } from "./unified-contacts";

export const MERGED_STATUS = "Merged";
export const MERGE_COLUMNS = ["Merged Into", "Merged URIDs"] as const;
export const MAX_MERGE = 5;

const norm = (s: string) => (s || "").trim().toLowerCase();
export const isMergedStatus = (status: string) => norm(status) === "merged";

/** Cell value keyed by lowercase header. */
export type RowValues = Record<string, string>;
export interface MergeRecord { urid: string; values: RowValues }
export type FieldChoice = number | "combine";

export interface MergeField {
  key: string;
  label: string;
  /** Lowercase headers written together (e.g. Name + First Name + Last Name). */
  headers: string[];
  /** One display value per record. */
  values: string[];
  differs: boolean;
  combinable: boolean;
  defaultChoice: FieldChoice;
}

/** Never offered as choices: identity / merge bookkeeping, or chosen separately (status). */
const SYSTEM = new Set(["urid", "merged into", "merged urids", "relationship status"]);
const LIST_FIELDS = new Set(["portco tags", "areas of interest"]);
const NAME_GROUP = ["name", "first name", "last name"];

export function splitList(v: string, sep = /[,;]/): string[] {
  const out: string[] = [];
  for (const raw of (v || "").split(sep)) {
    const t = raw.trim();
    if (t && !out.some((o) => norm(o) === norm(t))) out.push(t);
  }
  return out;
}
const emailsOf = (v: string) => splitList(v).filter((e) => e.includes("@"));

function displayName(values: RowValues): string {
  return values["name"] || [values["first name"], values["last name"]].filter(Boolean).join(" ");
}

/** Status shown to the user: "Prospecting", a Network tier, or blank → Cold. */
export function statusLabel(status: string): string {
  if (isProspectStatus(status)) return "Prospecting";
  const t = norm(status);
  return ({ council: "Council", hot: "Hot", warm: "Warm", cold: "Cold" } as Record<string, string>)[t] || "Cold";
}
export const whereOf = (status: string) => (isProspectStatus(status) ? "Prospecting" : "Network");

/** Distinct statuses across the records; more than one means the user must choose. */
export function statusOptions(records: MergeRecord[]): string[] {
  const out: string[] = [];
  for (const r of records) {
    const s = statusLabel(r.values["relationship status"] || "");
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

const earliest = (values: string[]) => {
  let best = -1;
  values.forEach((v, i) => {
    if (!v) return;
    const t = Date.parse(v);
    if (best === -1 || (!Number.isNaN(t) && t < Date.parse(values[best]))) best = i;
  });
  return best;
};

/** Every field the user can choose, in sheet order. Identical fields have differs=false. */
export function mergeFields(headers: string[], records: MergeRecord[], keeperIndex: number): MergeField[] {
  const lower = headers.map(norm);
  const fields: MergeField[] = [];
  const seen = new Set<string>();
  for (const [i, h] of lower.entries()) {
    if (!h || SYSTEM.has(h) || seen.has(h)) continue;
    const group = NAME_GROUP.includes(h) ? NAME_GROUP.filter((g) => lower.includes(g)) : [h];
    group.forEach((g) => seen.add(g));
    const isName = group.length > 1 || h === "name";
    const values = records.map((r) => (isName ? displayName(r.values) : r.values[h] || "").trim());
    const differs = new Set(values.filter(Boolean).map(norm)).size > 1;
    const combinable = h === "email" || LIST_FIELDS.has(h);
    let defaultChoice: FieldChoice = values[keeperIndex] ? keeperIndex : Math.max(0, values.findIndex(Boolean));
    if (differs && combinable) defaultChoice = h === "email" ? (values[keeperIndex] ? keeperIndex : defaultChoice) : "combine";
    if (differs && h === "date added") defaultChoice = Math.max(0, earliest(values));
    fields.push({ key: isName ? "name" : h, label: isName ? "Name" : headers[i].trim(), headers: group, values, differs, combinable, defaultChoice });
  }
  return fields;
}

export interface MergePlan {
  keeperUrid: string;
  archivedUrids: string[];
  /** Lowercase header → new value for the main record (only cells that change). */
  keeperUpdates: RowValues;
  keeperAfter: RowValues;
  archivedUpdates: { urid: string; values: RowValues }[];
}

/**
 * Build the exact cell changes. Emails are always kept (chosen primary first),
 * so history keyed by any address still finds the merged person.
 */
export function planContactMerge(input: { headers: string[]; records: MergeRecord[]; keeperIndex: number; choices: Record<string, FieldChoice>; status: string }): MergePlan {
  const { records, keeperIndex } = input;
  const keeper = records[keeperIndex];
  if (!keeper) throw new Error("Choose the main record.");
  const others = records.filter((_, i) => i !== keeperIndex);
  const fields = mergeFields(input.headers, records, keeperIndex);
  const after: RowValues = { ...keeper.values };
  const pick = (field: MergeField): FieldChoice => {
    const c = input.choices[field.key];
    return c === "combine" ? (field.combinable ? "combine" : field.defaultChoice) : typeof c === "number" && records[c] ? c : field.defaultChoice;
  };
  for (const f of fields) {
    const choice = pick(f);
    if (f.key === "email") {
      const primaryFrom = choice === "combine" ? keeperIndex : choice;
      const ordered = [records[primaryFrom], ...records.filter((_, i) => i !== primaryFrom)];
      const all: string[] = [];
      for (const r of ordered) for (const e of emailsOf(r.values["email"] || "")) if (!all.some((a) => norm(a) === norm(e))) all.push(e);
      after["email"] = all.join("; ");
      continue;
    }
    if (choice === "combine") {
      for (const h of f.headers) after[h] = splitList(records.map((r) => r.values[h] || "").join(",")).join(", ");
      continue;
    }
    for (const h of f.headers) after[h] = records[choice].values[h] || "";
  }
  // Keep the saved spelling (e.g. blank = Cold) when the chosen status is unchanged.
  const keptStatus = keeper.values["relationship status"] || "";
  after["relationship status"] = statusLabel(keptStatus) === input.status ? keptStatus : input.status;
  const mergedUrids = splitList(
    [keeper.values["merged urids"] || "", ...others.map((o) => [o.urid, o.values["merged urids"] || ""].join(","))].join(","),
    /[,;\s]+/,
  ).filter((u) => norm(u) !== norm(keeper.urid));
  after["merged urids"] = mergedUrids.join(", ");
  const keeperUpdates: RowValues = {};
  for (const [h, v] of Object.entries(after)) if ((keeper.values[h] || "") !== v) keeperUpdates[h] = v;
  return {
    keeperUrid: keeper.urid,
    archivedUrids: others.map((o) => o.urid),
    keeperUpdates,
    keeperAfter: after,
    // The archived copy's email moves to the main record (it is cleared here so
    // email-matched writers and imports only ever find the main record).
    archivedUpdates: others.map((o) => ({ urid: o.urid, values: { "relationship status": MERGED_STATUS, "merged into": keeper.urid, ...(o.values["email"] ? { email: "" } : {}) } })),
  };
}

/** Undo: restore each main-record cell the merge wrote, unless a teammate has edited it since. */
export function planMergeUndo(before: RowValues, after: RowValues, current: RowValues): { restore: RowValues; keptEdits: string[] } {
  const restore: RowValues = {};
  const keptEdits: string[] = [];
  for (const h of Object.keys(after)) {
    const was = before[h] || "", wrote = after[h] || "", now = current[h] || "";
    if (was === wrote) continue;
    if (now === wrote) restore[h] = was;
    else if (now !== was) keptEdits.push(h);
  }
  return { restore, keptEdits };
}

/** Stable fingerprint of a row, so a merge only runs on exactly what was reviewed. */
export function rowFingerprint(values: RowValues): string {
  return JSON.stringify(Object.keys(values).filter((k) => values[k]).sort().map((k) => [k, values[k]]));
}

// ── Duplicate suggestions ────────────────────────────────────

export interface DupPerson { urid: string; name: string; email: string; company: string; linkedin: string; status: string; title?: string }
export type DupReason = "Same email" | "Same LinkedIn" | "Same name & company" | "Similar name, same company";
export interface DupGroup { key: string; people: DupPerson[]; reasons: DupReason[]; strength: "strong" | "possible" }

export function companyKey(company: string): string {
  return normalizeIdentity(company)
    .replace(/[.,'’&()]/g, " ")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|gmbh|plc|sa|ag|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const nameKey = (name: string) => normalizeIdentity(name).replace(/[.,'’]/g, "").replace(/\s+/g, " ");

/** "Matt Darcy" vs "Matthew Darcy": same surname and one first name is a 3+ letter prefix of the other. */
export function similarName(a: string, b: string): boolean {
  const pa = nameKey(a).split(" "), pb = nameKey(b).split(" ");
  if (pa.length < 2 || pb.length < 2 || pa[pa.length - 1] !== pb[pb.length - 1]) return false;
  const [x, y] = [pa[0], pb[0]].sort((p, q) => p.length - q.length);
  return x.length >= 3 && y.startsWith(x);
}

export const groupKey = (urids: string[]) => [...urids].map(norm).sort().join("|");

/**
 * Group likely duplicates. Strong evidence: shared email, LinkedIn, or exact
 * name + company. Possible: nickname-compatible name at the same company.
 * Groups a teammate marked "not duplicates" (or a subset of one) are hidden.
 */
export function findDuplicateGroups(people: DupPerson[], dismissed: string[][] = [], maxGroup = 8): DupGroup[] {
  const list = people.filter((p) => p.urid && !isMergedStatus(p.status));
  const parent = list.map((_, i) => i);
  const strongParent = list.map((_, i) => i);
  const find = (p: number[], i: number): number => (p[i] === i ? i : (p[i] = find(p, p[i])));
  const reasons = new Map<string, Set<DupReason>>();
  const link = (a: number, b: number, why: DupReason, strong: boolean) => {
    parent[find(parent, a)] = find(parent, b);
    if (strong) strongParent[find(strongParent, a)] = find(strongParent, b);
    const k = groupKey([list[a].urid, list[b].urid]);
    if (!reasons.has(k)) reasons.set(k, new Set());
    reasons.get(k)!.add(why);
  };
  const byKey = (keyOf: (p: DupPerson) => string[], why: DupReason) => {
    const seen = new Map<string, number>();
    list.forEach((p, i) => {
      for (const k of keyOf(p)) {
        if (!k) continue;
        const j = seen.get(k);
        if (j === undefined) seen.set(k, i);
        else link(j, i, why, true);
      }
    });
  };
  byKey((p) => emailsOf(p.email).map(norm), "Same email");
  byKey((p) => [linkedinIdentity(p.linkedin)].filter((l) => l.includes("linkedin.com/in/")), "Same LinkedIn");
  byKey((p) => (nameKey(p.name) && companyKey(p.company) ? [`${nameKey(p.name)}|${companyKey(p.company)}`] : []), "Same name & company");
  // Possible: nickname-compatible names at the same company.
  const byCompany = new Map<string, number[]>();
  list.forEach((p, i) => { const c = companyKey(p.company); if (c) byCompany.set(c, [...(byCompany.get(c) || []), i]); });
  for (const idx of byCompany.values()) {
    if (idx.length > 200) continue;
    for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
      const pa = list[idx[a]], pb = list[idx[b]];
      if (nameKey(pa.name) !== nameKey(pb.name) && similarName(pa.name, pb.name)) link(idx[a], idx[b], "Similar name, same company", false);
    }
  }
  const groups = new Map<number, number[]>();
  list.forEach((_, i) => { const r = find(parent, i); groups.set(r, [...(groups.get(r) || []), i]); });
  const hidden = dismissed.map((d) => new Set(d.map(norm)));
  const out: DupGroup[] = [];
  for (const idx of groups.values()) {
    if (idx.length < 2 || idx.length > maxGroup) continue;
    const members = idx.map((i) => list[i]);
    const ids = members.map((m) => norm(m.urid));
    if (hidden.some((h) => ids.every((id) => h.has(id)))) continue;
    const why = new Set<DupReason>();
    for (let a = 0; a < members.length; a++) for (let b = a + 1; b < members.length; b++) {
      for (const r of reasons.get(groupKey([members[a].urid, members[b].urid])) || []) why.add(r);
    }
    const strong = new Set(idx.map((i) => find(strongParent, i))).size === 1;
    out.push({ key: groupKey(ids), people: members, reasons: [...why], strength: strong ? "strong" : "possible" });
  }
  return out.sort((a, b) => (a.strength === b.strength ? a.people[0].name.localeCompare(b.people[0].name) : a.strength === "strong" ? -1 : 1));
}

// Server side of contact merges (see src/lib/contact-merge.ts for the rules).
// Every merge/undo runs inside a journaled bulk operation; the "Contact Merges"
// tab is an append-only log written BEFORE the cells change, holding the full
// before/after rows so undo is exact and an interrupted run can be checked.

import type { BulkOutcome } from "@/lib/bulk-operation";
import {
  MERGE_COLUMNS, findDuplicateGroups, isMergedStatus, planContactMerge, planMergeUndo, rowFingerprint, splitList, statusLabel, whereOf,
  type DupPerson, type FieldChoice, type MergeRecord, type RowValues,
} from "@/lib/contact-merge";
import type { JournalActor, JournalRun } from "./bulk-journal.server";
import { appendSheetRows, colLetters, ensureColumn, ensureTab, fetchSheetTab, TAB_NAMES, updateSheetCells } from "./sheets.server";

export const MERGES_TAB = "Contact Merges";
const MERGE_HEADERS = ["Merge ID", "Action", "Keeper URID", "Other URIDs", "Keeper Name", "Other Names", "Status", "Keeper Before", "Others Before", "Keeper After", "By", "At"];
const norm = (s: string) => (s || "").trim().toLowerCase();

interface Live { headers: string[]; lower: string[]; rows: string[][] }
async function readContacts(): Promise<Live> {
  const rows = await fetchSheetTab(TAB_NAMES.contacts, true);
  const headers = rows[0] || [];
  return { headers, lower: headers.map(norm), rows };
}
function valuesOf(live: Live, row: string[]): RowValues {
  const v: RowValues = {};
  live.lower.forEach((h, i) => { if (h && !(h in v)) v[h] = row[i] ?? ""; });
  return v;
}
function rowsFor(live: Live, urid: string): number[] {
  const u = live.lower.indexOf("urid");
  const out: number[] = [];
  if (u === -1) return out;
  for (let i = 1; i < live.rows.length; i++) if (norm(live.rows[i][u] || "") === norm(urid)) out.push(i);
  return out;
}
const nameOf = (v: RowValues) => v["name"] || `${v["first name"] || ""} ${v["last name"] || ""}`.trim() || v["email"] || "Contact";

export interface MergePreviewRecord { urid: string; name: string; where: string; status: string; fingerprint: string; values: RowValues }

/** Resolve each URID to exactly one live, un-merged row; otherwise explain why the merge can't start. */
function resolve(live: Live, urids: string[]): { records: (MergeRecord & { row: number })[]; problem?: string } {
  const records: (MergeRecord & { row: number })[] = [];
  for (const urid of urids) {
    const found = rowsFor(live, urid);
    if (found.length === 0) return { records, problem: "One of these people could not be found. Reload the page and try again." };
    if (found.length > 1) return { records, problem: "Two rows share the same ID. Run Repair IDs on Prospecting first." };
    const values = valuesOf(live, live.rows[found[0]]);
    if (isMergedStatus(values["relationship status"] || "")) return { records, problem: `${nameOf(values)} was already merged into another person.` };
    records.push({ urid, values, row: found[0] });
  }
  return { records };
}

export async function previewMerge(urids: string[]): Promise<{ headers: string[]; records: MergePreviewRecord[] }> {
  const live = await readContacts();
  const { records, problem } = resolve(live, urids);
  if (problem) throw new Error(problem);
  return {
    headers: live.headers,
    records: records.map((r) => ({ urid: r.urid, name: nameOf(r.values), where: whereOf(r.values["relationship status"] || ""), status: statusLabel(r.values["relationship status"] || ""), fingerprint: rowFingerprint(r.values), values: r.values })),
  };
}

export interface MergeInput { keeperUrid: string; urids: string[]; choices: Record<string, FieldChoice>; status: string; seen: Record<string, string> }

export async function executeMerge(input: MergeInput, actor: JournalActor, journal: JournalRun): Promise<{ outcomes: BulkOutcome[]; mergeId: string }> {
  const blockedAll = (reason: string): BulkOutcome[] => input.urids.map((u) => ({ key: u, label: u, status: "blocked", reason: `${reason} Nothing was changed.` }));
  journal.step("preparing merge columns");
  for (const c of MERGE_COLUMNS) await ensureColumn(TAB_NAMES.contacts, c);
  await ensureTab(MERGES_TAB, MERGE_HEADERS);
  journal.step("re-reading the people being merged");
  const live = await readContacts();
  const { records, problem } = resolve(live, input.urids);
  if (problem) return { outcomes: blockedAll(problem), mergeId: journal.id };
  const changed = records.find((r) => rowFingerprint(r.values) !== input.seen[r.urid]);
  if (changed) return { outcomes: blockedAll(`${nameOf(changed.values)} was edited since you opened the merge. Reopen it to see the latest details.`), mergeId: journal.id };
  const keeperIndex = records.findIndex((r) => r.urid === input.keeperUrid);
  if (keeperIndex === -1) return { outcomes: blockedAll("Choose which record to keep."), mergeId: journal.id };
  const plan = planContactMerge({ headers: live.headers, records, keeperIndex, choices: input.choices, status: input.status });
  const keeper = records[keeperIndex];
  const others = records.filter((_, i) => i !== keeperIndex);

  // Log first: if anything below is interrupted, the full before-state is on record.
  journal.step("recording the merge");
  await appendSheetRows(MERGES_TAB, [[
    journal.id, "merged", keeper.urid, others.map((o) => o.urid).join(", "), nameOf(keeper.values), others.map((o) => nameOf(o.values)).join(", "),
    input.status, JSON.stringify(keeper.values), JSON.stringify(Object.fromEntries(others.map((o) => [o.urid, o.values]))), JSON.stringify(plan.keeperAfter),
    actor.teamEmail, new Date().toISOString(),
  ]], true);

  const updates: { range: string; value: string }[] = [];
  const cellsFor = (row: number, values: RowValues) => {
    for (const [h, v] of Object.entries(values)) {
      const ci = live.lower.indexOf(h);
      if (ci !== -1) updates.push({ range: `${colLetters(ci)}${row + 1}`, value: v });
    }
  };
  cellsFor(keeper.row, plan.keeperUpdates);
  for (const a of plan.archivedUpdates) cellsFor(records.find((r) => r.urid === a.urid)!.row, a.values);
  journal.step("saving the merged person");
  await updateSheetCells(TAB_NAMES.contacts, updates, true);

  journal.step("reading back to confirm");
  const check = await readContacts();
  const keeperNow = rowsFor(check, keeper.urid).map((i) => valuesOf(check, check.rows[i]))[0];
  const keeperOk = !!keeperNow && Object.entries(plan.keeperUpdates).every(([h, v]) => (keeperNow[h] ?? "") === v);
  const keeperName = nameOf(plan.keeperAfter);
  const fieldCount = Object.keys(plan.keeperUpdates).filter((h) => h !== "merged urids").length;
  const outcomes: BulkOutcome[] = [{
    key: keeper.urid, label: keeperName, status: keeperOk ? "changed" : "review",
    reason: keeperOk ? `Kept as the merged person${fieldCount ? ` · ${fieldCount} detail${fieldCount === 1 ? "" : "s"} updated` : ""}` : "Saved, but the read-back didn't match exactly. Open the profile to review.",
  }];
  for (const o of others) {
    const now = rowsFor(check, o.urid).map((i) => valuesOf(check, check.rows[i]))[0];
    const ok = !!now && isMergedStatus(now["relationship status"] || "") && norm(now["merged into"] || "") === norm(keeper.urid);
    outcomes.push({ key: o.urid, label: nameOf(o.values), status: ok ? "moved" : "review", reason: ok ? `Archived into ${keeperName} (can be undone)` : "Archive could not be confirmed. Check Find duplicates → Recent merges." });
  }
  return { outcomes, mergeId: journal.id };
}

interface LogEntry { mergeId: string; action: string; keeperUrid: string; otherUrids: string[]; keeperName: string; otherNames: string; status: string; keeperBefore: string; othersBefore: string; keeperAfter: string; by: string; at: string }
async function readLog(): Promise<LogEntry[]> {
  await ensureTab(MERGES_TAB, MERGE_HEADERS);
  const rows = await fetchSheetTab(MERGES_TAB, true);
  const h = (rows[0] || []).map(norm);
  const g = (r: string[], k: string) => r[h.indexOf(k)] || "";
  return rows.slice(1).map((r) => ({
    mergeId: g(r, "merge id"), action: g(r, "action"), keeperUrid: g(r, "keeper urid"), otherUrids: splitList(g(r, "other urids"), /[,;\s]+/),
    keeperName: g(r, "keeper name"), otherNames: g(r, "other names"), status: g(r, "status"), keeperBefore: g(r, "keeper before"),
    othersBefore: g(r, "others before"), keeperAfter: g(r, "keeper after"), by: g(r, "by"), at: g(r, "at"),
  }));
}
const parse = <T,>(s: string, fallback: T): T => { try { return JSON.parse(s) as T; } catch { return fallback; } };

export async function executeUndo(mergeId: string, actor: JournalActor, journal: JournalRun): Promise<BulkOutcome[]> {
  journal.step("reading the merge record");
  const log = await readLog();
  const entry = log.find((e) => e.mergeId === mergeId && e.action === "merged");
  if (!entry) return [{ key: mergeId, label: "Merge", status: "blocked", reason: "This merge could not be found. Nothing was changed." }];
  if (log.some((e) => e.mergeId === mergeId && e.action === "undone")) return [{ key: mergeId, label: entry.keeperName, status: "already_complete", reason: "This merge was already undone." }];
  const before = parse<RowValues>(entry.keeperBefore, {}), after = parse<RowValues>(entry.keeperAfter, {});
  const othersBefore = parse<Record<string, RowValues>>(entry.othersBefore, {});
  const live = await readContacts();
  const keeperRows = rowsFor(live, entry.keeperUrid);
  if (keeperRows.length !== 1) return [{ key: entry.keeperUrid, label: entry.keeperName, status: "blocked", reason: "The main record could not be found exactly once. Nothing was changed." }];
  const current = valuesOf(live, live.rows[keeperRows[0]]);
  const { restore, keptEdits } = planMergeUndo(before, after, current);
  const updates: { range: string; value: string }[] = [];
  const put = (row: number, h: string, v: string) => { const ci = live.lower.indexOf(h); if (ci !== -1) updates.push({ range: `${colLetters(ci)}${row + 1}`, value: v }); };
  for (const [h, v] of Object.entries(restore)) put(keeperRows[0], h, v);
  const restoring: { urid: string; name: string; row: number }[] = [];
  const outcomes: BulkOutcome[] = [];
  for (const urid of entry.otherUrids) {
    const prev = othersBefore[urid] || {};
    const rows = rowsFor(live, urid);
    const now = rows.length === 1 ? valuesOf(live, live.rows[rows[0]]) : null;
    if (!now || !isMergedStatus(now["relationship status"] || "") || norm(now["merged into"] || "") !== norm(entry.keeperUrid)) {
      outcomes.push({ key: urid, label: nameOf(prev), status: "already_complete", reason: "Already a separate person; left as is." });
      continue;
    }
    put(rows[0], "relationship status", prev["relationship status"] || "");
    put(rows[0], "merged into", prev["merged into"] || "");
    if (!now["email"] && prev["email"]) put(rows[0], "email", prev["email"]);
    restoring.push({ urid, name: nameOf(prev), row: rows[0] });
  }
  journal.step("recording the undo");
  await appendSheetRows(MERGES_TAB, [[mergeId, "undone", entry.keeperUrid, entry.otherUrids.join(", "), entry.keeperName, entry.otherNames, "", "", "", "", actor.teamEmail, new Date().toISOString()]], true);
  journal.step("restoring separate people");
  await updateSheetCells(TAB_NAMES.contacts, updates, true);
  journal.step("reading back to confirm");
  const check = await readContacts();
  for (const r of restoring) {
    const now = valuesOf(check, check.rows[r.row] || []);
    const ok = norm(now["urid"] || "") === norm(r.urid) && !isMergedStatus(now["relationship status"] || "");
    outcomes.push({ key: r.urid, label: r.name, status: ok ? "moved" : "review", reason: ok ? "Restored as a separate person" : "Restore could not be confirmed; open the profile to review." });
  }
  const kept = keptEdits.length ? ` · kept later edits to ${keptEdits.join(", ")}` : "";
  outcomes.unshift({ key: entry.keeperUrid, label: entry.keeperName, status: "changed", reason: `Main record restored${Object.keys(restore).length ? ` (${Object.keys(restore).length} details)` : ""}${kept}` });
  return outcomes;
}

/** Read-only evidence for an interrupted merge/undo, used by "Check what was saved & unlock". */
export async function mergeSavedState(kind: string, input: Record<string, unknown>): Promise<BulkOutcome[]> {
  const live = await readContacts();
  let keeperUrid = String(input.keeperUrid || ""), others = (input.urids as string[] || []).filter((u) => u !== keeperUrid);
  if (kind === "contact-merge-undo") {
    const entry = (await readLog()).find((e) => e.mergeId === String(input.mergeId || "") && e.action === "merged");
    if (!entry) return [{ key: String(input.mergeId || "merge"), label: "Merge", status: "failed", reason: "Merge record not found; nothing to restore." }];
    keeperUrid = entry.keeperUrid; others = entry.otherUrids;
  }
  return others.map((urid) => {
    const rows = rowsFor(live, urid);
    const v = rows.length === 1 ? valuesOf(live, live.rows[rows[0]]) : {};
    const merged = isMergedStatus(v["relationship status"] || "") && norm(v["merged into"] || "") === norm(keeperUrid);
    const done = kind === "contact-merge" ? merged : !merged;
    return { key: urid, label: nameOf(v), status: done ? "changed" : "failed", reason: kind === "contact-merge" ? (done ? "Archived into the main record" : "Not archived — still a separate person") : (done ? "Separate person again" : "Still archived — undo can be run again") } as BulkOutcome;
  });
}

export interface MergeHistoryEntry { mergeId: string; keeperUrid: string; keeperName: string; otherNames: string; by: string; at: string; undone: boolean }
export async function listMerges(): Promise<MergeHistoryEntry[]> {
  const log = await readLog();
  const undone = new Set(log.filter((e) => e.action === "undone").map((e) => e.mergeId));
  return log.filter((e) => e.action === "merged").reverse().slice(0, 50)
    .map((e) => ({ mergeId: e.mergeId, keeperUrid: e.keeperUrid, keeperName: e.keeperName, otherNames: e.otherNames, by: e.by, at: e.at, undone: undone.has(e.mergeId) }));
}

export interface DuplicateSuggestion { key: string; strength: "strong" | "possible"; reasons: string[]; people: (DupPerson & { where: string; statusLabel: string })[] }
export async function suggestDuplicates(): Promise<{ groups: DuplicateSuggestion[]; total: number }> {
  const [live, log] = await Promise.all([readContacts(), readLog()]);
  const people: DupPerson[] = live.rows.slice(1).map((r) => {
    const v = valuesOf(live, r);
    return { urid: v["urid"] || "", name: nameOf(v), email: v["email"] || "", company: v["company"] || "", linkedin: v["linkedin"] || "", status: v["relationship status"] || "", title: v["role"] || v["title"] || "" };
  });
  const dismissed = log.filter((e) => e.action === "not-duplicate").map((e) => e.otherUrids);
  const groups = findDuplicateGroups(people, dismissed);
  return {
    total: groups.length,
    groups: groups.slice(0, 150).map((g) => ({ ...g, people: g.people.map((p) => ({ ...p, where: whereOf(p.status), statusLabel: statusLabel(p.status) })) })),
  };
}

export async function dismissDuplicate(urids: string[], names: string[], actor: JournalActor): Promise<void> {
  await ensureTab(MERGES_TAB, MERGE_HEADERS);
  await appendSheetRows(MERGES_TAB, [["", "not-duplicate", "", urids.join(", "), "", names.join(", "), "", "", "", "", actor.teamEmail, new Date().toISOString()]], true);
}

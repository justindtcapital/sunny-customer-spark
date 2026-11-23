// Pure planning for the one-time cleanup of people who share an email address.
// Each group is merged with the normal contact-merge rules (one record kept,
// others archived with undo). The record kept is the one with the most recent
// status: the latest event wins, either a record being added (its Date Added)
// or a logged status change (Rating History, keyed by email). Among records
// holding that status, the most recently added one is kept.

import { isMergedStatus, splitList, statusLabel, type RowValues } from "./contact-merge";

export interface CleanupRecord { urid: string; row: number; values: RowValues }
export interface StatusEvent { email: string; to: string; at: string }
export interface CleanupGroup { email: string; records: CleanupRecord[] }
export interface CleanupPick { keeperUrid: string; status: string; reason: string }

const norm = (s: string) => (s || "").trim().toLowerCase();
const STATUSES = new Set(["council", "hot", "warm", "cold", "prospecting"]);
const emailsOf = (v: string) => splitList(v).filter((e) => e.includes("@")).map(norm);

/** Sheet timestamps: ISO, or "M/D/YYYY[ H:MM[:SS]]". Unknown → NaN. */
export function sheetTime(raw: string): number {
  const v = (raw || "").trim();
  if (!v) return NaN;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return Date.UTC(+m[3]!, +m[1]! - 1, +m[2]!, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const t = Date.parse(v);
  return Number.isNaN(t) ? NaN : t;
}

/** People sharing any email (Merged rows excluded); chains of shared emails join one group. */
export function emailDuplicateGroups(records: CleanupRecord[], dismissed: string[][] = [], maxGroup = 5): CleanupGroup[] {
  const live = records.filter((r) => r.urid && !isMergedStatus(r.values["relationship status"] || ""));
  const parent = live.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const first = new Map<string, number>();
  live.forEach((r, i) => {
    for (const e of emailsOf(r.values["email"] || "")) {
      const j = first.get(e);
      if (j === undefined) first.set(e, i);
      else parent[find(i)] = find(j);
    }
  });
  const byRoot = new Map<number, number[]>();
  live.forEach((_, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) || []), i]));
  const hidden = dismissed.map((d) => new Set(d.map(norm)));
  const out: CleanupGroup[] = [];
  for (const idx of byRoot.values()) {
    if (idx.length < 2 || idx.length > maxGroup) continue;
    const members = idx.map((i) => live[i]!);
    if (hidden.some((h) => members.every((m) => h.has(norm(m.urid))))) continue;
    out.push({ email: emailsOf(members[0]!.values["email"] || "")[0] || "", records: members });
  }
  return out;
}

/** Choose the record to keep and the status the merged person gets. */
export function pickCleanupKeeper(group: CleanupGroup, history: StatusEvent[]): CleanupPick {
  const emails = new Set(group.records.flatMap((r) => emailsOf(r.values["email"] || "")));
  const statusOf = (r: CleanupRecord) => statusLabel(r.values["relationship status"] || "");
  const present = new Set(group.records.map(statusOf));
  const added = (r: CleanupRecord) => sheetTime(r.values["date added"] || "");
  // Newest record first: latest Date Added, then the later sheet row (appended later).
  const newest = [...group.records].sort((a, b) => ((added(b) || 0) - (added(a) || 0)) || b.row - a.row);
  const top = newest[0]!;
  let status = statusOf(top);
  let at = added(top) || 0;
  let reason = "newest record";
  for (const h of history) {
    if (!emails.has(norm(h.email)) || !STATUSES.has(norm(h.to))) continue; // e.g. "Removed" is not a status
    const s = statusLabel(h.to);
    const t = sheetTime(h.at);
    if (!present.has(s) || Number.isNaN(t) || t <= at) continue;
    status = s; at = t; reason = "latest status change";
  }
  const keeper = newest.find((r) => statusOf(r) === status) ?? top;
  return { keeperUrid: keeper.urid, status, reason };
}

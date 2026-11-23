// Pure planner for the Sheets read mirror: turns a successful Sheets API write
// (method, URL, JSON body, append response) into the equivalent edit of the
// database copy, so the app's own saves show up at once without re-reading
// Google. Anything it can't express exactly becomes "stale" (re-read from Sheets).

export type MirrorCell = { r: number; c: number; v: string };
export type MirrorOp =
  | { kind: "put"; tab: string; row: number; col: number; rows: string[][] }
  | { kind: "cells"; tab: string; cells: MirrorCell[] }
  | { kind: "append"; tab: string; row: number | null; rows: string[][] }
  | { kind: "stale"; tab: string | null };
export interface MirrorPlan { sheet: string; ops: MirrorOp[] }

/** Column letters → 0-based index (A → 0, AA → 26). */
export function colIndex(letters: string): number {
  return [...letters.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

/** Parse an A1 range ("Contacts!I42", "'Events DB'!A1:C3", "Tab") to its tab and first cell. */
export function parseA1(range: string): { tab: string; row: number; col: number } | null {
  const m = /^(?:'((?:[^']|'')+)'|([^!]+?))(?:!(.*))?$/.exec(range.trim());
  if (!m) return null;
  const tab = (m[1] ? m[1].replace(/''/g, "'") : m[2] || "").trim();
  if (!tab) return null;
  const ref = (m[3] ?? "").trim();
  if (!ref) return { tab, row: 1, col: 0 };
  const cell = /^\$?([A-Za-z]*)\$?(\d*)(?::.*)?$/.exec(ref);
  if (!cell || (!cell[1] && !cell[2])) return null;
  return { tab, row: cell[2] ? Number(cell[2]) : 1, col: cell[1] ? colIndex(cell[1]) : 0 };
}

const cellText = (v: unknown): string => (v == null ? "" : typeof v === "string" ? v : String(v));
const toRows = (values: unknown): string[][] | null =>
  Array.isArray(values) && values.every(Array.isArray) ? (values as unknown[][]).map((r) => r.map(cellText)) : null;

/** Spreadsheet id and the part of the path after it ("/values/…", ":batchUpdate"). */
function splitUrl(url: string): { sheet: string; rest: string } | null {
  const m = /\/v4\/spreadsheets\/([^/?:]+)([^?]*)/.exec(url);
  return m ? { sheet: decodeURIComponent(m[1]), rest: m[2] || "" } : null;
}

function parseBody(body: unknown): Record<string, unknown> | null {
  if (body == null) return null;
  if (typeof body === "string") { try { return JSON.parse(body) as Record<string, unknown>; } catch { return null; } }
  return typeof body === "object" ? (body as Record<string, unknown>) : null;
}

/** Plan the mirror edit for a successful write. `tabHint` names the tab of a structural change. */
export function planMirrorWrite(method: string, url: string, body: unknown, response?: unknown, tabHint?: string): MirrorPlan | null {
  if (method.toUpperCase() === "GET") return null;
  const u = splitUrl(url);
  if (!u) return null;
  const { sheet, rest } = u;
  const json = parseBody(body);
  const stale = (tab: string | null): MirrorPlan => ({ sheet, ops: [{ kind: "stale", tab }] });
  if (json && typeof json["majorDimension"] === "string" && json["majorDimension"] !== "ROWS") return stale(null);

  // Structural change (add/delete/insert rows or tabs).
  if (rest === ":batchUpdate") {
    const reqs = Array.isArray(json?.["requests"]) ? (json!["requests"] as Record<string, unknown>[]) : [];
    if (reqs.length && reqs.every((r) => r && "addSheet" in r)) return { sheet, ops: [] };
    return stale(tabHint ?? null);
  }

  // Many ranges in one call.
  if (rest === "/values:batchUpdate") {
    const data = Array.isArray(json?.["data"]) ? (json!["data"] as { range?: string; values?: unknown; majorDimension?: string }[]) : null;
    if (!data) return stale(null);
    const ops: MirrorOp[] = [];
    const cellsByTab = new Map<string, MirrorCell[]>();
    for (const d of data) {
      const at = parseA1(String(d.range || ""));
      const rows = toRows(d.values);
      if (!at || !rows || (d.majorDimension && d.majorDimension !== "ROWS")) { ops.push({ kind: "stale", tab: at?.tab ?? null }); continue; }
      if (rows.length === 1 && rows[0].length === 1) {
        const list = cellsByTab.get(at.tab) || [];
        list.push({ r: at.row, c: at.col, v: rows[0][0] });
        cellsByTab.set(at.tab, list);
      } else if (rows.length) ops.push({ kind: "put", tab: at.tab, row: at.row, col: at.col, rows });
    }
    for (const [tab, cells] of cellsByTab) ops.push({ kind: "cells", tab, cells });
    return { sheet, ops };
  }
  if (rest.startsWith("/values:")) return stale(null); // batchClear and other bulk forms

  if (rest.startsWith("/values/")) {
    let rangePart = rest.slice("/values/".length);
    const action = /:(append|clear)$/.exec(rangePart)?.[1] || "";
    if (action) rangePart = rangePart.slice(0, -(action.length + 1));
    let range: string;
    try { range = decodeURIComponent(rangePart); } catch { return stale(null); }
    const at = parseA1(range);
    if (!at) return stale(null);
    if (action === "clear") return stale(at.tab);
    const rows = toRows(json?.["values"]);
    if (!rows) return stale(at.tab);
    if (!rows.length) return { sheet, ops: [] };
    if (action === "append") {
      const updated = (response as { updates?: { updatedRange?: string } } | undefined)?.updates?.updatedRange;
      const where = updated ? parseA1(updated) : null;
      return { sheet, ops: [{ kind: "append", tab: at.tab, row: where && where.col === 0 ? where.row : null, rows }] };
    }
    if (rows.length === 1 && rows[0].length === 1) return { sheet, ops: [{ kind: "cells", tab: at.tab, cells: [{ r: at.row, c: at.col, v: rows[0][0] }] }] };
    return { sheet, ops: [{ kind: "put", tab: at.tab, row: at.row, col: at.col, rows }] };
  }
  return stale(null);
}

/** Freshness rule for serving a copied tab instead of asking Google. */
export function mirrorServable(snap: { stale: boolean; synced_at: string | null } | null, now: number, maxAgeMs: number): boolean {
  if (!snap || snap.stale || !snap.synced_at) return false;
  const at = Date.parse(snap.synced_at);
  return Number.isFinite(at) && now - at <= maxAgeMs;
}

// Pure column sort/filter for spreadsheet-style tables (Edit workstreams).
// Pick-list columns filter by ticked values (multi-select cells match when any
// of their values is ticked); free-text columns filter by "contains".

export const BLANK = "(blank)";
export type ColumnFilter = { kind: "values"; values: string[] } | { kind: "text"; text: string };
export type ColumnFilters = Record<string, ColumnFilter>;
export interface ColumnSort { key: string; dir: 1 | -1 }

/** Cell text → its separate values ("A, B" → ["A","B"]; empty → ["(blank)"]). */
export function cellValues(raw: string, multi = false): string[] {
  const parts = multi ? (raw || "").split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean) : [(raw || "").trim()].filter(Boolean);
  return parts.length ? parts : [BLANK];
}

export function filterActive(f: ColumnFilter | undefined): boolean {
  return !!f && (f.kind === "values" ? f.values.length > 0 : f.text.trim().length > 0);
}

export function matchesFilter(raw: string, f: ColumnFilter | undefined, multi = false): boolean {
  if (!filterActive(f)) return true;
  if (f!.kind === "text") return (raw || "").toLowerCase().includes(f!.text.trim().toLowerCase());
  const vals = cellValues(raw, multi);
  return vals.some((v) => f!.values.includes(v));
}

/** Distinct values with row counts, most common first then A→Z; blank last. */
export function valueCounts<T>(rows: T[], get: (r: T) => string, multi = false): Array<{ value: string; count: number }> {
  const m = new Map<string, number>();
  for (const r of rows) for (const v of new Set(cellValues(get(r), multi))) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].map(([value, count]) => ({ value, count }))
    .sort((a, b) => Number(a.value === BLANK) - Number(b.value === BLANK) || a.value.localeCompare(b.value, undefined, { sensitivity: "base", numeric: true }));
}

/** Blank cells always sort last, whichever direction. */
export function compareCells(a: string, b: string, dir: 1 | -1, numeric = false): number {
  const x = (a || "").trim(), y = (b || "").trim();
  if (!x || !y) return Number(!x) - Number(!y);
  if (numeric) {
    const nx = Number(x.replace(/[^0-9.-]/g, "")), ny = Number(y.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(nx) && Number.isFinite(ny) && nx !== ny) return (nx - ny) * dir;
  }
  return x.localeCompare(y, undefined, { sensitivity: "base", numeric: true }) * dir;
}

/** Apply every column filter (AND across columns), then sort. */
export function applyColumns<T>(rows: T[], opts: {
  filters: ColumnFilters; sort: ColumnSort | null; get: (r: T, key: string) => string;
  isMulti?: (key: string) => boolean; isNumeric?: (key: string) => boolean; tieBreak?: (a: T, b: T) => number;
}): T[] {
  const active = Object.entries(opts.filters).filter(([, f]) => filterActive(f));
  const out = rows.filter((r) => active.every(([k, f]) => matchesFilter(opts.get(r, k), f, opts.isMulti?.(k))));
  const s = opts.sort;
  return out.sort((a, b) => (s ? compareCells(opts.get(a, s.key), opts.get(b, s.key), s.dir, opts.isNumeric?.(s.key)) : 0) || (opts.tieBreak?.(a, b) ?? 0));
}

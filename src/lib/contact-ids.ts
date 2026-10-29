// Pure planner for filling blank contact IDs (URID). Only blank ID cells are
// planned; every other cell is untouched, and existing IDs are never changed.

export interface UridFill {
  /** 1-based sheet row number. */
  row: number;
  urid: string;
}

/** Plan new IDs for data rows whose URID cell is blank (rows with no content are skipped). */
export function planMissingUrids(
  rows: string[][],
  uridCol: number,
  makeId: () => string = () => crypto.randomUUID(),
): UridFill[] {
  const taken = new Set(rows.slice(1).map((r) => (r[uridCol] || "").trim().toLowerCase()).filter(Boolean));
  const fills: UridFill[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if ((r[uridCol] || "").trim()) continue;
    if (!r.some((v) => (v || "").trim())) continue;
    let id = makeId();
    while (taken.has(id.toLowerCase())) id = makeId();
    taken.add(id.toLowerCase());
    fills.push({ row: i + 1, urid: id });
  }
  return fills;
}

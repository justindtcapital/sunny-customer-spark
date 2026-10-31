import { portcoSheetKey } from "./portco-sheet-sync";
export function consolidatePortcoRows(rows: string[][]) {
  const headers = rows[0] || [];
  const name = headers.findIndex(h => /^(company name|name|company)$/i.test(h));
  const id = headers.findIndex(h => /^urid$/i.test(h));
  const website = headers.findIndex(h => /^website$/i.test(h));
  if (name < 0) throw new Error("Missing company name column");
  const groups = new Map<string, number[]>();
  rows.forEach((r, i) => { const key = portcoSheetKey(r[name] || ""); if (i && key) groups.set(key, [...(groups.get(key) || []), i]); });
  const output = rows.map(r => [...r]);
  const removed: number[] = []; const replacements: Record<string, string> = {};
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const sites = new Set(indices.map(i => (rows[i][website] || "").toLowerCase().replace(/\/$/, "")).filter(Boolean));
    if (sites.size > 1) throw new Error(`Conflicting websites for ${rows[indices[0]][name]}; manual review required`);
    const keeper = indices[0];
    for (const drop of indices.slice(1)) {
      for (let c = 0; c < headers.length; c++) {
        if (c === id) continue;
        const value = rows[drop][c] || "";
        if (!output[keeper][c]) output[keeper][c] = value;
        else if (value && value !== output[keeper][c] && c !== name && c !== website) output[keeper][c] += `\n${value}`;
      }
      if (id >= 0 && rows[drop][id] && rows[keeper][id]) replacements[rows[drop][id]] = rows[keeper][id];
      removed.push(drop); output[drop] = [];
    }
  }
  return { rows: output.filter(r => r.length), removed, replacements };
}
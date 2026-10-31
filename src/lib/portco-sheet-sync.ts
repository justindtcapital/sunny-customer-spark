// Shared-column mirror plan. Exact stable IDs/names only, never fuzzy matches.
export interface PortcoMirrorInput {
  urid?: string; matchName?: string; name: string; website?: string;
  focusArea?: string; location?: string; description?: string; linkedinUrl?: string;
}
export const portcoSheetKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
export function planPortcoMirror(rows: string[][], input: PortcoMirrorInput) {
  const headers = rows[0] || [];
  const col = (re: RegExp) => headers.findIndex(h => re.test(h.trim()));
  const nameCol = col(/^(company\s*name|company|name)$/i);
  if (nameCol < 0) throw new Error("PortCo List is missing its company name column");
  const idCol = col(/^urid$/i);
  const ids = rows.flatMap((r, i) => i > 0 && input.urid && idCol >= 0 && r[idCol] === input.urid ? [i] : []);
  const names = new Set([input.name, input.matchName || input.name].map(portcoSheetKey));
  const matches = ids.length ? ids : rows.flatMap((r, i) => i > 0 && names.has(portcoSheetKey(r[nameCol] || "")) ? [i] : []);
  if (matches.length > 1) throw new Error(`Multiple PortCo List rows match ${input.name}; consolidate them before syncing`);
  const rowIndex = matches[0] ?? rows.length;
  const row = Array.from({ length: headers.length }, (_, i) => rows[rowIndex]?.[i] || "");
  const fields: [RegExp, string | undefined][] = [
    [/^urid$/i, input.urid], [/^(company\s*name|company|name)$/i, input.name],
    [/^(website|url|site)$/i, input.website], [/^(focus area\(s\)|focus areas?|sector)$/i, input.focusArea],
    [/^(hq|location)$/i, input.location], [/^(summary|description|one[-\s]?liner)$/i, input.description],
    [/^linkedin( url)?$/i, input.linkedinUrl],
  ];
  for (const [re, value] of fields) { const index = col(re); if (index >= 0 && value !== undefined) row[index] = value.trim(); }
  return { rowIndex, row, append: matches.length === 0 };
}
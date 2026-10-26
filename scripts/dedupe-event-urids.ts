// One-time: collapse Events DB rows that share the same URID into one row.
// Dry-run by default; --apply backs up the tab, writes the combined row, deletes extras, verifies.
// Every tag survives: list columns are unioned, empty cells filled, differing text appended.
import { getAccessToken } from "../src/utils/sheets.server";

const id = process.env.EVENT_TRACKER_SHEET_ID || "1awv_VNFHvndOfu4DnyrM4PnMPb65UOms-sJym7AlG0M";
const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
const token = await getAccessToken();
async function req(path: string, body?: object) {
  const r = await fetch(base + path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`[${r.status}] ${await r.text()}`);
  return r.json();
}
const read = async () => ((await req("/values/'Events%20DB'!A1:AZ5000")).values || []) as string[][];

const LIST = new Set(["Sectors", "PortCos", "Partners"]);
const APPEND = new Set(["Notes", "Actions Needed", "Event Contact", "Source Ref"]);
const split = (s: string) => s.split(/[;,]/).map(x => x.trim()).filter(Boolean);

const rows = await read();
const head = rows[0];
const u = head.indexOf("URID");
const groups = new Map<string, number[]>();
rows.forEach((r, i) => { const k = (r[u] || "").trim(); if (i && k) groups.set(k, [...(groups.get(k) || []), i]); });
const dupes = [...groups].filter(([, ix]) => ix.length > 1);
const merged = new Map<number, string[]>(); const del: number[] = []; const conflicts: string[] = [];
for (const [urid, ix] of dupes) {
  const out = Array.from({ length: head.length }, (_, c) => rows[ix[0]][c] || "");
  for (const i of ix.slice(1)) head.forEach((h, c) => {
    const v = (rows[i][c] || "").trim(); const cur = out[c].trim();
    if (!v || v === cur) return;
    if (!cur) out[c] = v;
    else if (LIST.has(h)) out[c] = [...new Set([...split(cur), ...split(v)])].join("; ");
    else if (APPEND.has(h)) { if (!cur.includes(v)) out[c] = h === "Source Ref" ? `${cur} · ${v}` : `${cur}\n\n${v}`; }
    else if (h === "Network Count") out[c] = String(Math.max(Number(cur) || 0, Number(v) || 0));
    else if (h !== "Updated" && h !== "Created") conflicts.push(`${urid} ${out[1]} · ${h}: kept "${cur}", other "${v}"`);
  });
  merged.set(ix[0], out); del.push(...ix.slice(1));
}
console.log(JSON.stringify({ rows: rows.length - 1, duplicateUrids: dupes.length, extraRows: del.length, names: dupes.map(([, ix]) => rows[ix[0]][1]) }, null, 1));
conflicts.forEach(c => console.log("CONFLICT", c));
if (!process.argv.includes("--apply") || !del.length) process.exit(0);

const sheet = (await req("?fields=sheets.properties")).sheets.find((s: any) => s.properties.title === "Events DB").properties;
const suffix = new Date().toISOString().replace(/[:.]/g, "-");
const requests: object[] = [{ duplicateSheet: { sourceSheetId: sheet.sheetId, newSheetName: `Events backup ${suffix}` } }];
for (const [row, vals] of merged) requests.push({ updateCells: { start: { sheetId: sheet.sheetId, rowIndex: row, columnIndex: 0 }, rows: [{ values: vals.map(stringValue => ({ userEnteredValue: { stringValue } })) }], fields: "userEnteredValue" } });
for (const row of [...del].sort((a, b) => b - a)) requests.push({ deleteDimension: { range: { sheetId: sheet.sheetId, dimension: "ROWS", startIndex: row, endIndex: row + 1 } } });
await req(":batchUpdate", { requests });

const after = await read();
const counts = new Map<string, number>();
after.slice(1).forEach(r => { const k = (r[u] || "").trim(); if (k) counts.set(k, (counts.get(k) || 0) + 1); });
const stillDup = [...counts].filter(([, n]) => n > 1).length;
const uridsBefore = new Set(groups.keys());
const lost = [...uridsBefore].filter(k => !counts.has(k)).length;
if (stillDup || lost || after.length !== rows.length - del.length) throw new Error(`Verify failed: dup=${stillDup} lost=${lost}; backup tab "Events backup ${suffix}"`);
console.log(JSON.stringify({ verified: true, removed: del.length, remaining: after.length - 1, backup: `Events backup ${suffix}` }));

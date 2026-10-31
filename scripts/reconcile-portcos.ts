// Operator-only, backed up and fresh-read checked; dry run unless --apply.
import { getAccessToken } from "../src/utils/sheets.server";
import { requireSpreadsheetId } from "../src/utils/google.server";
import { resolvePortcoList } from "../src/utils/portco-list.server";
import { consolidatePortcoRows } from "../src/lib/portco-cleanup";
import { planPortcoMirror } from "../src/lib/portco-sheet-sync";
const token = await getAccessToken();
async function request(id: string, path: string, body?: object) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Reconciliation [${r.status}]: ${await r.text()}`); return r.json();
}
async function read(id: string, title?: string) {
  const meta = await request(id, "?fields=sheets.properties");
  const tab = title ? meta.sheets.find((s: any) => s.properties.title === title) : meta.sheets.find((s: any) => /^portfolio companies$/i.test(s.properties.title)) || meta.sheets.find((s: any) => !/backup|archived/i.test(s.properties.title));
  if (!tab) throw new Error("Company tab missing");
  const range = `'${tab.properties.title.replace(/'/g, "''")}'`;
  const rows: string[][] = (await request(id, `/values/${encodeURIComponent(range)}`)).values || [];
  return { id, tab: tab.properties, range, rows };
}
const crm = await read(requireSpreadsheetId(), "Portfolio Companies");
const approved = await read((await resolvePortcoList()).id);
const cp = consolidatePortcoRows(crm.rows); const ap = consolidatePortcoRows(approved.rows);
if (!ap.rows[0].includes("URID")) ap.rows[0].push("URID");
const ch = cp.rows[0]; const ci = (name: string) => ch.indexOf(name);
let added = 0;
// Keep existing approved summaries authoritative during initial reconciliation.
// Only add missing CRM companies and attach stable IDs; subsequent explicit app saves mirror changes.
for (const r of cp.rows.slice(1)) {
  const input = { name: r[ci("Company Name")], urid: r[ci("URID")], website: r[ci("Website")], focusArea: r[ci("Focus Area(s)")], location: r[ci("HQ")], description: r[ci("Summary")] };
  const plan = planPortcoMirror(ap.rows, { name: input.name, urid: input.urid });
  if (plan.append) { ap.rows.push(planPortcoMirror(ap.rows, input).row); added++; }
  else ap.rows[plan.rowIndex] = plan.row;
}
console.log(JSON.stringify({ crmDuplicates: cp.removed.length, approvedDuplicates: ap.removed.length, addedToApproved: added, apply: process.argv.includes("--apply") }));
if (!process.argv.includes("--apply")) process.exit(0);
for (const sheet of [crm, approved]) {
  const fresh = await read(sheet.id, sheet.tab.title);
  if (JSON.stringify(fresh.rows) !== JSON.stringify(sheet.rows)) throw new Error("Company data changed during reconciliation; rerun");
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
// Capture any CRM references to removed company IDs and rewrite them in-place, backed up.
const meta = await request(crm.id, "?fields=sheets.properties");
const refs: { tab: any; before: string[][]; after: string[][] }[] = [];
const referenceTabs = meta.sheets.filter((s: any) => s.properties.sheetId !== crm.tab.sheetId && !/backup|archived|tokens|history/i.test(s.properties.title));
const ranges = referenceTabs.map((s: any) => `'${s.properties.title.replace(/'/g, "''")}'`);
const query = new URLSearchParams(); for (const range of ranges) query.append("ranges", range);
const snapshots = (await request(crm.id, `/values:batchGet?${query}`)).valueRanges;
for (const [index, s] of referenceTabs.entries()) {
  const before: string[][] = snapshots[index]?.values || [];
  const after = before.map(row => row.map(value => {
    let result = value;
    for (const [oldId, newId] of Object.entries(cp.replacements)) result = result.replaceAll(oldId, newId);
    return result;
  }));
  if (JSON.stringify(after) !== JSON.stringify(before)) refs.push({ tab: s.properties, before, after });
}
for (const ref of refs) {
  if (JSON.stringify((await read(crm.id, ref.tab.title)).rows) !== JSON.stringify(ref.before)) throw new Error("References changed during reconciliation; rerun");
}
function replaceRequests(tab: any, rows: string[][], oldLength: number) {
  const width = Math.max(...rows.map(r => r.length));
  return [{ duplicateSheet: { sourceSheetId: tab.sheetId, insertSheetIndex: 999, newSheetName: `PortCo backup ${tab.sheetId} ${stamp}` } }, { updateCells: { range: { sheetId: tab.sheetId, startRowIndex: 0, endRowIndex: Math.max(rows.length, oldLength), startColumnIndex: 0, endColumnIndex: width }, rows: rows.map(row => ({ values: row.map(stringValue => ({ userEnteredValue: { stringValue } })) })), fields: "userEnteredValue" } }];
}
await request(crm.id, ":batchUpdate", { requests: [...replaceRequests(crm.tab, cp.rows, crm.rows.length), ...refs.flatMap(r => replaceRequests(r.tab, r.after, r.before.length))] });
await request(approved.id, ":batchUpdate", { requests: replaceRequests(approved.tab, ap.rows, approved.rows.length) });
const normalize = (rows: string[][]) => rows.map(row => { const r = [...row]; while (r.length && !r[r.length-1]) r.pop(); return r; });
for (const [sheet, expected] of [[crm, cp.rows], [approved, ap.rows]] as const) {
  const actual = (await read(sheet.id, sheet.tab.title)).rows;
  if (JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(expected))) throw new Error("Read-back mismatch; backups retained");
  if (consolidatePortcoRows(actual).removed.length) throw new Error("Duplicates remain");
}
console.log(JSON.stringify({ verified: true, crmCompanies: cp.rows.length - 1, approvedCompanies: ap.rows.length - 1, referenceTabsUpdated: refs.length, backups: stamp }));
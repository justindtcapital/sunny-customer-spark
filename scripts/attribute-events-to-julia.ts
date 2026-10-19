// One-time correction requested by the event team; dry-run unless --apply.
import { getAccessToken } from "../src/utils/sheets.server";
import { teamMemberFor } from "../src/lib/user-ownership";
const julia = teamMemberFor("Julia Beach");
if (!julia) throw new Error("Julia's profile is missing");
const token = await getAccessToken();
const id = process.env.EVENT_TRACKER_SHEET_ID || "1awv_VNFHvndOfu4DnyrM4PnMPb65UOms-sJym7AlG0M";
const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
async function call(path: string, body?: object) {
  const r = await fetch(base + path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`Attribution failed [${r.status}]: ${await r.text()}`);
  return r.json();
}
const read = async (): Promise<string[][]> => (await call("/values/'Events%20DB'!A1:AZ5000")).values || [];
const rows = await read();
const h = rows[0];
const idCol = h.indexOf("URID"), author = h.indexOf("Created By"), owner = h.indexOf("Owner"), updated = h.indexOf("Updated");
if ([idCol, author, owner, updated].some(i => i < 0)) throw new Error("Missing attribution columns");
const meta = await call("?fields=sheets.properties");
const sheetId = meta.sheets.find((s: { properties: { title: string } }) => s.properties.title === "Events DB")?.properties.sheetId;
if (sheetId === undefined) throw new Error("Missing Events DB");
const requests: object[] = [];
const now = new Date().toISOString();
for (let i = 1; i < rows.length; i++) {
  if (!rows[i][idCol]) continue;
  for (const col of [author, owner]) if (rows[i][col] !== julia.email) requests.push({ updateCells: { start: { sheetId, rowIndex: i, columnIndex: col }, rows: [{ values: [{ userEnteredValue: { stringValue: julia.email } }] }], fields: "userEnteredValue" } });
  requests.push({ updateCells: { start: { sheetId, rowIndex: i, columnIndex: updated }, rows: [{ values: [{ userEnteredValue: { stringValue: now } }] }], fields: "userEnteredValue" } });
}
console.log({ events: rows.slice(1).filter(r => r[idCol]).length, profile: julia.displayName, apply: process.argv.includes("--apply") });
if (process.argv.includes("--apply")) {
  if (JSON.stringify(await read()) !== JSON.stringify(rows)) throw new Error("Events changed; rerun correction");
  await call(":batchUpdate", { requests: [{ duplicateSheet: { sourceSheetId: sheetId, newSheetName: `Attribution backup ${now.replace(/[:.]/g, "-")}` } }, ...requests] });
  const after = await read();
  if (after.slice(1).filter(r => r[idCol]).some(r => r[author] !== julia.email || r[owner] !== julia.email)) throw new Error("Attribution verification failed");
  console.log("Verified every event owner and Added by match Julia's canonical profile; prior values remain in the backup.");
}
// One-time operator tool: dry-run by default. Run with bun --env-file=.env and --apply.
// Uses the app's existing Google authorization, never a client-callable endpoint.
import { getAccessToken } from "../src/utils/sheets.server";
import { readPlannerEvents, EVENT_HEADERS } from "../src/utils/event-planner.server";
import { buildPortfolioCompanies } from "../src/utils/sheets.server";
import { planEventCleanup } from "../src/lib/event-cleanup";

const id = process.env.EVENT_TRACKER_SHEET_ID || "1awv_VNFHvndOfu4DnyrM4PnMPb65UOms-sJym7AlG0M";
const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
const token = await getAccessToken();
async function request(path: string, body?: object) {
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Event cleanup failed [${response.status}]: ${await response.text()}`);
  return response.json();
}
async function snapshot() {
  const response = await request("/values:batchGet?ranges='Events%20DB'!A1:AZ5000&ranges='Event%20Attendees'!A1:AZ5000");
  return response.valueRanges.map((r: { values?: string[][] }) => r.values || []) as string[][][];
}

const before = await snapshot();
const events = await readPlannerEvents(true);
const companies = await buildPortfolioCompanies();
const plan = planEventCleanup(events, companies);
const categorized = events.filter(e => !plan.replacements.has(e.urid) && e.subcategory === "Unassigned" && plan.updates.has(e.urid)).length;
console.log(JSON.stringify({ events: events.length, merged: plan.replacements.size, categorized, apply: process.argv.includes("--apply") }));
if (!process.argv.includes("--apply") || !plan.updates.size) process.exit(0);

const meta = await request("?fields=sheets.properties");
const eventSheet = meta.sheets.find((s: { properties: { title: string } }) => s.properties.title === "Events DB")?.properties;
const attendeeSheet = meta.sheets.find((s: { properties: { title: string } }) => s.properties.title === "Event Attendees")?.properties;
if (!eventSheet || !attendeeSheet) throw new Error("Event tabs missing");
if (JSON.stringify(await snapshot()) !== JSON.stringify(before)) throw new Error("Events or attendance changed during planning; rerun cleanup.");

const now = new Date().toISOString();
const suffix = now.replace(/[:.]/g, "-");
const requests: object[] = [
  { duplicateSheet: { sourceSheetId: eventSheet.sheetId, newSheetName: `Events backup ${suffix}` } },
  { duplicateSheet: { sourceSheetId: attendeeSheet.sheetId, newSheetName: `Attendees backup ${suffix}` } },
];
const headers = before[0][0];
const uridCol = headers.indexOf("URID");
const columnMap: Record<string, string> = {
  Name: "name", Start: "start", End: "end", Location: "location", Category: "category", Subcategory: "subcategory", Status: "status",
  Sectors: "sectors", PortCos: "portcos", Partners: "partners", Owner: "owner", Format: "format", Website: "website", "Luma URL": "lumaUrl",
  Source: "source", "Source Ref": "sourceRef", "Asana GID": "asanaGid", "Network Count": "networkCount", Notes: "notes",
  "Actions Needed": "actionsNeeded", "Event Contact": "eventContact", "Created By": "createdBy", Updated: "updated", "DTC Status": "dtcStatus",
};
const finalRows = before[0].map(r => [...r]);
function cells(sheetId: number, row: number, col: number, values: string[]) {
  requests.push({ updateCells: { start: { sheetId, rowIndex: row, columnIndex: col }, rows: [{ values: values.map(stringValue => ({ userEnteredValue: { stringValue } })) }], fields: "userEnteredValue" } });
}
for (let row = 1; row < before[0].length; row++) {
  const urid = before[0][row][uridCol];
  if (plan.replacements.has(urid)) {
    finalRows[row] = Array(Math.max(EVENT_HEADERS.length, headers.length)).fill("");
    cells(eventSheet.sheetId, row, 0, finalRows[row]);
    continue;
  }
  const event = plan.updates.get(urid);
  if (!event) continue;
  const record = { ...event, updated: now } as unknown as Record<string, unknown>;
  for (const [header, key] of Object.entries(columnMap)) {
    const col = headers.indexOf(header);
    if (col < 0) throw new Error(`Missing event column: ${header}`);
    const raw = record[key];
    const value = Array.isArray(raw) ? raw.join("; ") : String(raw ?? "");
    if (value === (before[0][row][col] || "")) continue;
    finalRows[row][col] = value;
    cells(eventSheet.sheetId, row, col, [value]);
  }
}
const finalAttendees = before[1].map(r => [...r]);
let relinked = 0;
for (let row = 1; row < before[1].length; row++) {
  const keeper = plan.replacements.get(before[1][row][0]);
  if (!keeper) continue;
  finalAttendees[row][0] = keeper;
  cells(attendeeSheet.sheetId, row, 0, [keeper]);
  relinked++;
}
await request(":batchUpdate", { requests });
const after = await snapshot();
const normalized = (rows: string[][]) => rows.map(r => {
  const copy = Array.from(r, v => v || "");
  while (copy.length && !copy[copy.length - 1]) copy.pop();
  return copy;
}).filter(r => r.length);
if (JSON.stringify(normalized(after[0])) !== JSON.stringify(normalized(finalRows)) || JSON.stringify(normalized(after[1])) !== JSON.stringify(normalized(finalAttendees))) {
  throw new Error("Read-back differs from the cleanup plan; original data is preserved in backup tabs.");
}
console.log(JSON.stringify({ verified: true, merged: plan.replacements.size, categorized, relinkedAttendees: relinked, remainingEvents: events.length - plan.replacements.size, backupSuffix: suffix }));
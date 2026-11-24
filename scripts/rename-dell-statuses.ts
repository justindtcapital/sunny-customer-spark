// One-time operator tool (2026-11-24): rewrite Sell-In Status and Sell With Dell Status values on the
// Workstreams and PortCo Profiles tabs to the new wording. Dry-run by default; --apply backs up both
// tabs, writes only changed cells and logs each change in the PortCo Change Log.
// Run: bun --env-file=.env scripts/rename-dell-statuses.ts [--apply]
import { appendSheetRows, colLetters, ensureTab, fetchSheetTab, updateSheetCells } from "../src/utils/sheets.server";
import { sellInSync } from "../src/lib/sell-in-status";
import { swdSync } from "../src/lib/sell-with-dell-status";

const apply = process.argv.includes("--apply");
const FIELDS = [{ field: "Sell-In Status", sync: sellInSync }, { field: "Sell With Dell Status", sync: swdSync }];
const TABS = [{ tab: "Workstreams", kind: "workstream", id: "Workstream ID" }, { tab: "PortCo Profiles", kind: "profile", id: "PortCo URID" }];
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
const log: string[][] = [];

for (const { tab, kind, id } of TABS) {
  const rows = await fetchSheetTab(tab, true);
  const headers = (rows[0] || []).map((h) => h.trim());
  const updates: { range: string; value: string }[] = [];
  for (const { field, sync } of FIELDS) {
    const col = headers.indexOf(field);
    if (col < 0) continue;
    rows.slice(1).forEach((r, i) => {
      const before = (r[col] || "").trim();
      if (!before) return;
      const after = sync.mergeStatuses(before);
      if (after === before) return;
      updates.push({ range: `${colLetters(col)}${i + 2}`, value: after });
      log.push([new Date().toISOString(), "Status rename", kind, r[headers.indexOf(id)] || "", r[headers.indexOf("Company")] || "", field, before, after]);
    });
  }
  console.log(`${tab}: ${updates.length} cells to change`);
  if (apply && updates.length) {
    const backup = `${tab} Backup ${stamp} status rename`;
    await ensureTab(backup, rows[0] || headers);
    await appendSheetRows(backup, rows.slice(1).map((r) => headers.map((_, c) => r[c] ?? "")), true);
    await updateSheetCells(tab, updates, true);
    console.log(`  backed up to "${backup}" and wrote ${updates.length} cells`);
  }
}
for (const l of log) console.log(`  ${l[4]} · ${l[5]}: ${l[6]} → ${l[7]}`);
if (apply && log.length) {
  await ensureTab("PortCo Change Log", ["At", "By", "Kind", "Record ID", "Company", "Field", "Before", "After"]);
  await appendSheetRows("PortCo Change Log", log, true);
}

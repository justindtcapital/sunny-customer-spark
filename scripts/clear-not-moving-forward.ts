// One-time operator tool (2026-11-24): Chris chose to clear "Not Moving Forward" (no longer a Sell-In or
// Sell-With choice). Removes that value from both status fields on the Workstreams and PortCo Profiles
// tabs, keeping any other statuses in the cell. Dry-run by default; --apply backs up both tabs, writes
// only changed cells and logs each change in the PortCo Change Log.
// Run: bun --env-file=.env scripts/clear-not-moving-forward.ts [--apply]
import { appendSheetRows, colLetters, ensureTab, fetchSheetTab, updateSheetCells } from "../src/utils/sheets.server";

const apply = process.argv.includes("--apply");
const FIELDS = ["Sell-In Status", "Sell With Dell Status"];
const TABS = [{ tab: "Workstreams", kind: "workstream", id: "Workstream ID" }, { tab: "PortCo Profiles", kind: "profile", id: "PortCo URID" }];
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
const log: string[][] = [];

for (const { tab, kind, id } of TABS) {
  const rows = await fetchSheetTab(tab, true);
  const headers = (rows[0] || []).map((h) => h.trim());
  const updates: { range: string; value: string }[] = [];
  for (const field of FIELDS) {
    const col = headers.indexOf(field);
    if (col < 0) continue;
    rows.slice(1).forEach((r, i) => {
      const before = (r[col] || "").trim();
      const parts = before.split(/\s*,\s*/).filter(Boolean);
      const kept = parts.filter((p) => !/^not moving forward$/i.test(p));
      if (kept.length === parts.length) return;
      const after = kept.join(", ");
      updates.push({ range: `${colLetters(col)}${i + 2}`, value: after });
      log.push([new Date().toISOString(), "Clear Not Moving Forward", kind, r[headers.indexOf(id)] || "", r[headers.indexOf("Company")] || "", field, before, after]);
    });
  }
  console.log(`${tab}: ${updates.length} cells to change`);
  if (apply && updates.length) {
    const backup = `${tab} Backup ${stamp} clear NMF`;
    await ensureTab(backup, rows[0] || headers);
    await appendSheetRows(backup, rows.slice(1).map((r) => headers.map((_, c) => r[c] ?? "")), true);
    await updateSheetCells(tab, updates, true);
    console.log(`  backed up to "${backup}" and wrote ${updates.length} cells`);
  }
}
for (const l of log) console.log(`  ${l[4]} · ${l[5]}: "${l[6]}" → "${l[7]}"`);
if (apply && log.length) {
  await ensureTab("PortCo Change Log", ["At", "By", "Kind", "Record ID", "Company", "Field", "Before", "After"]);
  await appendSheetRows("PortCo Change Log", log, true);
}

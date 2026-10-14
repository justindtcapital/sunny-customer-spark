// One-time import: copy existing Asana BD/GTM activity history into the
// "Harvested Activities" knowledge tab so the new email/minutes-based activity
// tracking keeps the full history. Safe to re-run — dedupes on activity id.
//
// Run: bun scripts/import-asana-activities.ts

import { fetchActivities } from "../src/utils/asana.server";
import {
  ensureKnowledgeTabs,
  listHarvestedActivities,
  saveHarvestedActivities,
  type HarvestedActivity,
} from "../src/utils/knowledge.server";
import { sha256Hex } from "../src/utils/sha256";

async function main() {
  await ensureKnowledgeTabs();
  const existing = new Set((await listHarvestedActivities()).map((a) => a.activityId));
  const asana = await fetchActivities();
  console.log(`Asana activities: ${asana.length}`);

  const now = new Date().toISOString();
  const rows: HarvestedActivity[] = [];
  for (const a of asana) {
    const id = sha256Hex(`asana:${a.gid}`).slice(0, 24);
    if (existing.has(id)) continue;
    rows.push({
      activityId: id,
      recordId: `asana-${a.gid}`,
      date: a.date || "",
      track: a.track || "BD",
      type: (a.type || "email").toLowerCase(),
      title: a.name || "(untitled)",
      portco: a.company || "",
      person: a.person || "",
      owner: a.owner || "",
      summary: (a.notes || "").slice(0, 400),
      sourceUrl: a.url || "",
      createdAt: now,
    });
  }

  console.log(`New rows to import: ${rows.length} (skipped ${asana.length - rows.length} existing)`);
  if (rows.length > 0) {
    await saveHarvestedActivities(rows);
    console.log("Import complete.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

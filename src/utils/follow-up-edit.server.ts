import { createServerOnlyFn } from "@tanstack/react-start";
import { followUpEditSchema, type FollowUpEdit } from "@/lib/follow-up-edit";
import { fetchSheetTab } from "./sheets.server";
import { KNOWLEDGE_TABS, HARVEST_STATE_HEADERS, setHarvestState } from "./knowledge.server";
import { ensureTab } from "./sheets.server";

const PREFIX = "followup-edit:";
export const readFollowUpEdits = createServerOnlyFn(async (): Promise<Map<string, FollowUpEdit>> => {
  await ensureTab(KNOWLEDGE_TABS.harvestState, HARVEST_STATE_HEADERS);
  const rows = await fetchSheetTab(KNOWLEDGE_TABS.harvestState);
  const edits = new Map<string, FollowUpEdit>();
  for (const row of rows.slice(1)) {
    if (!row[0]?.startsWith(PREFIX)) continue;
    try { const parsed = followUpEditSchema.safeParse(JSON.parse(row[1] || "{}")); if (parsed.success) edits.set(row[0].slice(PREFIX.length), parsed.data); }
    catch { /* Ignore corrupt task edits without hiding the original task. */ }
  }
  return edits;
});
export const saveFollowUpEdit = createServerOnlyFn(async (id: string, edit: FollowUpEdit) => {
  await setHarvestState(`${PREFIX}${id}`, JSON.stringify(edit));
});
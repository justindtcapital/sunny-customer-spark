import { planMissingUrids } from "@/lib/contact-ids";
import { colLetters, ensureColumn, fetchSheetTab, updateSheetCells } from "./sheets.server";

/**
 * Give every contact row with a blank URID a new unique ID. Writes only blank
 * ID cells (re-checked against a fresh read), in small batches; safe to repeat.
 */
export async function fillMissingUrids(tab: string): Promise<{ filled: number }> {
  await ensureColumn(tab, "URID");
  const rows = await fetchSheetTab(tab, true);
  if (rows.length < 2) return { filled: 0 };
  const uridCol = (rows[0] || []).map((h) => h.trim().toLowerCase()).indexOf("urid");
  if (uridCol === -1) return { filled: 0 };
  const fills = planMissingUrids(rows, uridCol);
  for (let i = 0; i < fills.length; i += 200) {
    const batch = fills.slice(i, i + 200);
    await updateSheetCells(tab, batch.map((f) => ({ range: `${colLetters(uridCol)}${f.row}`, value: f.urid })));
  }
  return { filled: fills.length };
}

// One-time repair of Gmail-sourced Notes rows written before the body-excerpt
// fix. Those rows carry only the machine-readable header block ("Inbound email /
// People: … / Gmail: …") or a snippet that is pure email chrome (confidentiality
// banner, forwarded header stack). This re-fetches each message by id and
// rewrites the "Note Content" cell in place — no new rows, no duplicates.

import { emailBodyExcerpt } from "@/lib/email-excerpt";
import { isEmailChromeText, sanitizeEmailText } from "@/lib/email-body-clean";
import { fetchGmailMessageById, NOTES_BUDGET } from "./gmail.server";
import {
  TAB_NAMES,
  colLetters,
  fetchSheetTab,
  logOpsEvent,
  updateSheetCells,
} from "./sheets.server";

export interface RepairGmailNotesResult {
  ok: boolean;
  error?: string;
  /** Notes rows whose Source Ref points at a Gmail message. */
  scanned: number;
  /** Rows that looked like the bad (no real body) shape. */
  candidates: number;
  /** Cells actually rewritten. */
  repaired: number;
  /** Messages that could no longer be fetched (deleted / no access). */
  unresolved: number;
  /** Rows already fine or with nothing substantive to add. */
  skipped: number;
  /** Sample of repaired rows, for the UI. */
  samples: string[];
}

// Lines we keep verbatim when rebuilding a note (machine-readable joins + audit).
const KEEP_LINE =
  /^(inbound email|outbound email|people:|gmail:|email:|meeting:|from:\s|subject:)/i;

/** Gmail message id from a Notes "Source Ref" value, or "" when not Gmail. */
export function gmailIdFromSourceRef(ref: string): string {
  const r = (ref || "").trim();
  if (!r) return "";
  if (r.startsWith("gmail-crm-")) return r.slice("gmail-crm-".length);
  if (r.startsWith("gmail-")) return r.slice("gmail-".length);
  if (r.startsWith("gmail:")) return r.slice("gmail:".length).trim();
  return "";
}

/**
 * True when a note has no real message text: only the header/audit scaffold, or
 * a body that is nothing but email chrome.
 */
export function needsBodyRepair(note: string): boolean {
  const lines = (note || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const body = lines.filter((l) => !KEEP_LINE.test(l));
  if (body.length === 0) return true;
  const text = body.join(" ");
  return text.length < 40 || isEmailChromeText(text);
}

/** Rebuild the note: keep the scaffold lines, append the real message text. */
export function rebuildNote(existing: string, body: string, snippet: string): string {
  const kept = (existing || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && KEEP_LINE.test(l));
  const fixed = kept.join("\n");
  const remaining = NOTES_BUDGET - fixed.length - 1;
  if (remaining < 40) return existing;
  const excerpt =
    emailBodyExcerpt(body, remaining) ||
    (isEmailChromeText(snippet) ? "" : sanitizeEmailText(snippet).trim());
  if (!excerpt) return existing;
  return fixed ? `${fixed}\n${excerpt.slice(0, remaining)}` : excerpt.slice(0, NOTES_BUDGET);
}

/**
 * Scan the Notes tab and overwrite bad Gmail notes with the real message text.
 * Safe to re-run: rows that already carry a body are skipped.
 */
export async function repairGmailNotes(
  opts: { limit?: number; dryRun?: boolean } = {},
): Promise<RepairGmailNotesResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? 400, 1000));
  const result: RepairGmailNotesResult = {
    ok: true,
    scanned: 0,
    candidates: 0,
    repaired: 0,
    unresolved: 0,
    skipped: 0,
    samples: [],
  };

  let rows: string[][];
  try {
    rows = await fetchSheetTab(TAB_NAMES.interactions);
  } catch (e) {
    return { ...result, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const headers = (rows[0] || []).map((h) => h.trim().toLowerCase());
  const noteIdx = headers.indexOf("note content");
  const refIdx = headers.indexOf("source ref");
  if (noteIdx === -1 || refIdx === -1) {
    return { ...result, ok: false, error: "Notes tab is missing Note Content / Source Ref columns" };
  }

  const updates: { range: string; value: string }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const msgId = gmailIdFromSourceRef(row[refIdx] || "");
    if (!msgId) continue;
    result.scanned++;
    const note = row[noteIdx] || "";
    if (!needsBodyRepair(note)) {
      result.skipped++;
      continue;
    }
    result.candidates++;
    if (updates.length >= limit) continue;

    const msg = await fetchGmailMessageById(msgId);
    if (!msg) {
      result.unresolved++;
      continue;
    }
    const next = rebuildNote(note, msg.body, msg.snippet);
    if (!next || next === note) {
      result.skipped++;
      continue;
    }
    // Sheet rows are 1-based and row 1 is the header.
    updates.push({ range: `${colLetters(noteIdx)}${i + 1}`, value: next });
    if (result.samples.length < 20) {
      result.samples.push(`${msg.dateLabel || ""} ${msg.subject}`.trim());
    }
  }

  if (!opts.dryRun && updates.length > 0) {
    try {
      // Batch in chunks so one huge backfill stays within request limits.
      for (let i = 0; i < updates.length; i += 200) {
        await updateSheetCells(TAB_NAMES.interactions, updates.slice(i, i + 200));
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await logOpsEvent({
        action: "repair",
        source: "Gmail notes backfill",
        status: "error",
        summary: `Gmail note repair failed: ${error}`,
      });
      return { ...result, ok: false, error };
    }
  }
  result.repaired = opts.dryRun ? 0 : updates.length;

  await logOpsEvent({
    action: "repair",
    source: "Gmail notes backfill",
    status: "ok",
    summary: opts.dryRun
      ? `Dry run: ${result.candidates} Gmail notes missing message text`
      : `Rewrote ${result.repaired} Gmail notes with the real message text`,
    records: result.repaired,
    details: {
      scanned: result.scanned,
      candidates: result.candidates,
      unresolved: result.unresolved,
      skipped: result.skipped,
      dryRun: opts.dryRun ? "true" : "false",
    },
    items: result.samples,
  });

  return result;
}

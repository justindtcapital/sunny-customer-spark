// Sheets read mirror — a copy of each Google Sheets tab in the Cloud database.
// Google Sheets stays the source of truth: every save goes to Sheets first and
// is then applied to the copy (applyMirrorWrite); page reads come from the copy
// (readThroughMirror) and only fall back to Google when the copy is missing,
// stale or too old. The scheduled sync (sheet-mirror-sync.server) brings in
// edits people make directly in the spreadsheet. Any database problem falls
// back to the old direct-to-Google path; the copy never blocks a save.
import { mirrorServable, planMirrorWrite, type MirrorOp } from "@/lib/sheet-mirror-plan";
import { runInBackground } from "./background.server";

/** Serve a copy at most this old without asking Google (the scheduled sync keeps it current). */
export const MIRROR_MAX_AGE_MS = 40 * 60_000;
const DB_TIMEOUT_MS = 10_000;
// Private or bulky tabs that are never copied.
const EXCLUDED = [/^mailbox tokens$/i, /\bbackup\b/i, /^apollo raw$/i, /_conflict\d*$/i];

let downUntil = 0;
let failures: number[] = [];

export function mirrorEnabled(tab?: string): boolean {
  if ((process.env["SHEETS_MIRROR"] || "").toLowerCase() === "off") return false;
  if (!process.env["SUPABASE_URL"] || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) return false;
  if (Date.now() < downUntil) return false;
  return !tab || !EXCLUDED.some((re) => re.test(tab.trim()));
}

/** Memory-cache lifetime for a tab: short while the copy is healthy (cheap to re-read), long otherwise. */
export function memoryTtlMs(tab: string): number {
  return mirrorEnabled(tab) ? 45_000 : 5 * 60_000;
}

// One slow call (e.g. a burst of parallel page reads) shouldn't switch the copy
// off; repeated failures within a minute send reads straight to Google for a minute.
function noteFailure(where: string, e: unknown) {
  const now = Date.now();
  failures = [...failures.filter((t) => now - t < 60_000), now];
  const off = failures.length >= 3;
  if (off) { downUntil = now + 60_000; failures = []; }
  console.warn(`[sheet-mirror] ${where} failed${off ? " — using Google Sheets directly for a minute" : ""}:`, e instanceof Error ? e.message : e);
}

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export interface MirrorSnapshot { rows: string[][]; synced_at: string | null; stale: boolean; dirty: boolean }

export async function mirrorRead(sheet: string, tab: string): Promise<MirrorSnapshot | null> {
  if (!mirrorEnabled(tab)) return null;
  try {
    const db = await admin();
    const { data, error } = await db.rpc("mirror_read_tab", { p_sheet: sheet, p_tab: tab }).abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
    if (error) throw new Error(error.message);
    return (data as unknown as MirrorSnapshot | null) ?? null;
  } catch (e) {
    noteFailure(`read ${tab}`, e);
    return null;
  }
}

export async function contentHash(rows: string[][]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(rows)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Store a full copy read from Google at `startedAt`. Returns replaced | unchanged | skipped | off. */
export async function mirrorReplace(sheet: string, tab: string, rows: string[][], startedAt: Date): Promise<string> {
  if (!mirrorEnabled(tab)) return "off";
  try {
    const db = await admin();
    const { data, error } = await db
      .rpc("mirror_replace_tab", { p_sheet: sheet, p_tab: tab, p_rows: rows, p_hash: await contentHash(rows), p_started_at: startedAt.toISOString() })
      .abortSignal(AbortSignal.timeout(20_000));
    if (error) throw new Error(error.message);
    return String(data);
  } catch (e) {
    noteFailure(`replace ${tab}`, e);
    return "error";
  }
}

export async function mirrorMarkStale(sheet: string, tab: string | null): Promise<void> {
  try {
    const db = await admin();
    const { error } = await db.rpc("mirror_mark_stale", { p_sheet: sheet, p_tab: tab as string }).abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
    if (error) throw new Error(error.message);
  } catch (e) {
    console.warn("[sheet-mirror] mark stale failed:", e instanceof Error ? e.message : e);
  }
}

async function applyOp(sheet: string, op: MirrorOp): Promise<void> {
  if (op.tab && !mirrorEnabled(op.tab)) return;
  const db = await admin();
  const signal = AbortSignal.timeout(DB_TIMEOUT_MS);
  const call =
    op.kind === "cells" ? db.rpc("mirror_patch_cells", { p_sheet: sheet, p_tab: op.tab, p_cells: op.cells })
    : op.kind === "put" ? db.rpc("mirror_put_rows", { p_sheet: sheet, p_tab: op.tab, p_start_row: op.row, p_col: op.col, p_rows: op.rows })
    : op.kind === "append" ? db.rpc("mirror_append_rows", { p_sheet: sheet, p_tab: op.tab, p_start_row: op.row as number, p_rows: op.rows })
    : db.rpc("mirror_mark_stale", { p_sheet: sheet, p_tab: op.tab as string });
  const { error } = await call.abortSignal(signal);
  if (error) throw new Error(error.message);
}

/** After a successful Sheets write, apply the same change to the copy (or mark it for re-reading). Never throws. */
export async function applyMirrorWrite(method: string, url: string, body: unknown, res: Response, tabHint?: string): Promise<void> {
  if (!mirrorEnabled()) return;
  let response: unknown;
  if (url.split("?")[0].endsWith(":append")) response = await res.clone().json().catch(() => undefined);
  const plan = planMirrorWrite(method, url, body, response, tabHint);
  if (!plan) return;
  for (const op of plan.ops) {
    try { await applyOp(plan.sheet, op); }
    catch (e) {
      console.warn(`[sheet-mirror] could not copy a save to ${op.tab ?? "all tabs"}:`, e instanceof Error ? e.message : e);
      // Make sure the copy is re-read rather than left behind.
      await mirrorMarkStale(plan.sheet, op.tab);
    }
  }
}

/**
 * Read a tab through the copy. `fresh` reads (used right before saves for
 * conflict checks) always go to Google and refresh the copy.
 */
export async function readThroughMirror(
  sheet: string,
  tab: string,
  fresh: boolean,
  fromSheets: () => Promise<string[][]>,
): Promise<{ rows: string[][]; source: "mirror" | "sheets" }> {
  let snap: MirrorSnapshot | null = null;
  if (!fresh && mirrorEnabled(tab)) {
    snap = await mirrorRead(sheet, tab);
    if (snap && mirrorServable(snap, Date.now(), MIRROR_MAX_AGE_MS)) return { rows: snap.rows, source: "mirror" };
  }
  if (!fresh) console.info(`[sheet-mirror] "${tab}" read from Google (${!mirrorEnabled(tab) ? "copy off" : snap ? (snap.stale ? "copy needs re-read" : "copy too old") : "not copied yet"})`);
  const startedAt = new Date();
  let rows: string[][];
  try {
    rows = await fromSheets();
  } catch (e) {
    // Google is throttled or down: an older copy beats an error page.
    if (snap && snap.synced_at) {
      console.warn(`[sheet-mirror] Google read for "${tab}" failed; serving the copy from ${snap.synced_at}`);
      return { rows: snap.rows, source: "mirror" };
    }
    throw e;
  }
  if (mirrorEnabled(tab)) await runInBackground(mirrorReplace(sheet, tab, rows, startedAt));
  return { rows, source: "sheets" };
}

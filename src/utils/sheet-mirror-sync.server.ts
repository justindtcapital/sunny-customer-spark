// Scheduled sync for the Sheets read mirror: brings edits people make directly
// in Google Sheets into the database copy. One cheap Drive "last modified"
// check per spreadsheet; only when it changed (or a tab needs re-reading) does
// it pull tabs, in a few batchGet requests rather than one call per tab.
import { getAccessToken, sheetsFetch } from "./sheets.server";
import { requireSpreadsheetId } from "./google.server";
import { mirrorEnabled, mirrorReplace } from "./sheet-mirror.server";

// Big read-only archives are copied only if the app reads them (they register themselves).
const NOT_SEEDED = [/\(archived\)/i, /^asana archive$/i];
const RANGES_PER_REQUEST = 20;

export interface MirrorSheetResult {
  sheet: string;
  changed: boolean | null;
  tabs: number;
  replaced: number;
  unchanged: number;
  skipped: number;
  errors: string[];
}
export interface MirrorSyncResult { ok: boolean; ms: number; sheets: MirrorSheetResult[] }

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function driveModifiedTime(sheet: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sheet)}?fields=modifiedTime&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) { await res.body?.cancel(); return null; }
    return ((await res.json()) as { modifiedTime?: string }).modifiedTime || null;
  } catch {
    return null;
  }
}

async function tabTitles(sheet: string, token: string): Promise<string[]> {
  const res = await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheet)}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Sheets metadata [${res.status}]: ${await res.text()}`);
  const meta = (await res.json()) as { sheets?: { properties?: { title?: string } }[] };
  return (meta.sheets || []).map((s) => s.properties?.title || "").filter(Boolean);
}

const quoted = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

async function batchGet(sheet: string, tabs: string[], token: string): Promise<{ rows: string[][][]; missing: boolean }> {
  const qs = tabs.map((t) => `ranges=${encodeURIComponent(quoted(t))}`).join("&");
  const res = await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheet)}/values:batchGet?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 400 && /Unable to parse range/i.test(body)) return { rows: [], missing: true };
    throw new Error(`Sheets batchGet [${res.status}]: ${body.slice(0, 300)}`);
  }
  const j = (await res.json()) as { valueRanges?: { values?: string[][] }[] };
  return { rows: tabs.map((_, i) => j.valueRanges?.[i]?.values || []), missing: false };
}

async function syncOne(
  sheet: string,
  known: { tab: string; stale: boolean; dirty: boolean; row_count: number }[],
  state: { drive_modified_at: string } | null,
  token: string,
  force: boolean,
  seed: boolean,
): Promise<MirrorSheetResult> {
  const db = await admin();
  const out: MirrorSheetResult = { sheet, changed: null, tabs: 0, replaced: 0, unchanged: 0, skipped: 0, errors: [] };
  const checkedAt = new Date();
  const modified = await driveModifiedTime(sheet, token);
  const changed = force || seed || !modified || modified !== (state?.drive_modified_at || "");
  out.changed = modified ? changed : null;

  // Empty copies stand for tabs that don't exist yet; they are re-read only when marked.
  let tabs = known.filter((k) => k.stale || k.dirty || (changed && k.row_count > 0)).map((k) => k.tab);
  if (seed) {
    const titles = await tabTitles(sheet, token);
    tabs = [...new Set([...tabs, ...titles.filter((t) => mirrorEnabled(t) && !NOT_SEEDED.some((re) => re.test(t)))])];
  }
  tabs = tabs.filter((t) => mirrorEnabled(t));
  if (!changed) {
    const { error } = await db.rpc("mirror_confirm_current", { p_sheet: sheet, p_checked_at: checkedAt.toISOString() });
    if (error) out.errors.push(error.message);
  }

  let allOk = true;
  for (let i = 0; i < tabs.length; i += RANGES_PER_REQUEST) {
    let chunk = tabs.slice(i, i + RANGES_PER_REQUEST);
    const startedAt = new Date();
    try {
      let got = await batchGet(sheet, chunk, token);
      if (got.missing) {
        // A tab doesn't exist (yet) in Google: copy it as empty, which is how the
        // app reads a missing tab, and retry with the rest.
        const titles = new Set(await tabTitles(sheet, token));
        const gone = chunk.filter((t) => !titles.has(t));
        for (const t of gone) await mirrorReplace(sheet, t, [], startedAt);
        chunk = chunk.filter((t) => titles.has(t));
        got = chunk.length ? await batchGet(sheet, chunk, token) : { rows: [], missing: false };
        if (got.missing) throw new Error("Some tabs could not be read");
      }
      // A few at a time keeps database writes quick without flooding it.
      for (let j = 0; j < chunk.length; j += 4) {
        const results = await Promise.all(chunk.slice(j, j + 4).map((t, k) => mirrorReplace(sheet, t, got.rows[j + k] || [], startedAt)));
        for (const r of results) {
          if (r === "replaced") out.replaced++;
          else if (r === "unchanged") out.unchanged++;
          else if (r === "skipped") out.skipped++;
          else { out.errors.push(`copy ${r}`); allOk = false; }
        }
      }
      out.tabs += chunk.length;
    } catch (e) {
      allOk = false;
      out.errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  const stateRow = {
    spreadsheet_id: sheet,
    // Only remember Google's timestamp once every tab was copied, so a partial run retries.
    drive_modified_at: allOk && modified ? modified : state?.drive_modified_at || "",
    checked_at: checkedAt.toISOString(),
    ...(changed && allOk ? { synced_at: new Date().toISOString() } : {}),
    last_result: { changed: out.changed, tabs: out.tabs, replaced: out.replaced, unchanged: out.unchanged, skipped: out.skipped },
    last_error: out.errors.join("; ").slice(0, 2000),
  };
  const { error } = await db.from("sheet_mirror_state").upsert(stateRow);
  if (error) out.errors.push(error.message);
  return out;
}

/** Sync every copied spreadsheet. `force` re-reads all copied tabs even if Google reports no change. */
export async function syncSheetMirror({ force = false } = {}): Promise<MirrorSyncResult> {
  const t0 = Date.now();
  if (!mirrorEnabled()) return { ok: false, ms: 0, sheets: [] };
  const db = await admin();
  const [{ data: tabs, error }, { data: states }] = await Promise.all([
    db.from("sheet_mirror_tabs").select("spreadsheet_id, tab, stale, dirty, row_count").limit(2000),
    db.from("sheet_mirror_state").select("spreadsheet_id, drive_modified_at"),
  ]);
  if (error) throw new Error(`Mirror list failed: ${error.message}`);
  const bySheet = new Map<string, { tab: string; stale: boolean; dirty: boolean; row_count: number }[]>();
  for (const t of tabs || []) bySheet.set(t.spreadsheet_id, [...(bySheet.get(t.spreadsheet_id) || []), t]);
  const main = requireSpreadsheetId();
  const seedMain = !(bySheet.get(main) || []).length;
  if (seedMain) bySheet.set(main, []);
  const token = await getAccessToken();
  const sheets: MirrorSheetResult[] = [];
  for (const [sheet, known] of bySheet) {
    const state = (states || []).find((s) => s.spreadsheet_id === sheet) || null;
    sheets.push(await syncOne(sheet, known, state, token, force, sheet === main && (seedMain || force)));
  }
  return { ok: sheets.every((s) => !s.errors.length), ms: Date.now() - t0, sheets };
}

export interface MirrorStatus {
  enabled: boolean;
  tabs: number;
  needsRefresh: number;
  lastCheck: string | null;
  lastSync: string | null;
  lastError: string;
}

export async function sheetMirrorStatus(): Promise<MirrorStatus> {
  if (!mirrorEnabled()) return { enabled: false, tabs: 0, needsRefresh: 0, lastCheck: null, lastSync: null, lastError: "" };
  const db = await admin();
  const [{ data: tabs }, { data: states }] = await Promise.all([
    db.from("sheet_mirror_tabs").select("stale").limit(2000),
    db.from("sheet_mirror_state").select("checked_at, synced_at, last_error"),
  ]);
  const latest = (k: "checked_at" | "synced_at") =>
    (states || []).map((s) => s[k]).filter((v): v is string => !!v).sort().pop() || null;
  return {
    enabled: true,
    tabs: (tabs || []).length,
    needsRefresh: (tabs || []).filter((t) => t.stale).length,
    lastCheck: latest("checked_at"),
    lastSync: latest("synced_at"),
    lastError: (states || []).map((s) => s.last_error).filter(Boolean).join("; "),
  };
}

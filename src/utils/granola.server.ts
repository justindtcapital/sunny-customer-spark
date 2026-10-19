// Granola meeting notes → Venture Pulse knowledge base.
//
// Granola is a read-only source: notes are copied into Knowledge Records,
// Harvested Activities, Workstream Links and Suggested Contacts, plus a markdown
// copy in the "Venture Pulse KB" Drive under Meeting Notes/<PortCo>. Nothing is
// ever written to or deleted from Granola. A note is "safe to delete in
// Granola" only after the saved record AND the Drive copy are re-read and found.

import { getAccessToken, fetchSheetTab } from "./sheets.server";
import { uploadDriveFile } from "./drive.server";
import {
  KNOWLEDGE_TABS,
  extractKnowledge,
  getHarvestState,
  setHarvestState,
  listKnowledgeRecords,
  recordIdFor,
  type HarvestedActivity,
  type KnowledgeRecord,
  type SuggestedContact,
  type WorkstreamLink,
} from "./knowledge.server";
import { sha256Hex } from "./sha256";
import { granolaAuthor, granolaCursorKey } from "@/lib/team-access";
import { createServerOnlyFn } from "@tanstack/react-start";

export interface GranolaAccess { apiKey: string; userId: string }

const GATEWAY_URL = "https://connector-gateway.lovable.dev/granola";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

export function isGranolaConfigured(): boolean {
  return !!(process.env.LOVABLE_API_KEY && process.env.GRANOLA_API_KEY);
}

async function granolaGet<T>(path: string, access?: GranolaAccess): Promise<T> {
  const lk = process.env.LOVABLE_API_KEY;
  const gk = process.env.GRANOLA_API_KEY;
  if (!access && (!lk || !gk)) throw new Error("Granola is not connected");
  const headers: Record<string, string> = access
    ? { Authorization: `Bearer ${access.apiKey}` }
    : { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": gk || "" };
  const res = await fetch(`${access ? "https://public-api.granola.ai" : GATEWAY_URL}${path}`, {
    headers, signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    await res.arrayBuffer();
    throw new Error(`Granola request failed (${res.status}). Check your connection and note permissions.`);
  }
  return (await res.json()) as T;
}

interface GranolaPerson { name?: string | null; email?: string | null }
interface GranolaNoteListItem { id: string; title: string | null; created_at: string; deleted_at: string | null }
export interface GranolaNote extends GranolaNoteListItem {
  web_url?: string;
  attendees?: GranolaPerson[];
  owner?: GranolaPerson;
  folder_membership?: Array<{ id?: string; name?: string }>;
  transcript?: Array<{ text: string; speaker?: { name?: string } }> | null;
  summary_markdown?: string | null;
  summary_text?: string | null;
}

/** Notes created after an ISO time, all pages (bounded). */
export async function listGranolaNotes(createdAfter: string, maxNotes = 200, access?: GranolaAccess): Promise<GranolaNoteListItem[]> {
  const out: GranolaNoteListItem[] = [];
  let cursor = "";
  for (let page = 0; page < 20 && out.length < maxNotes; page++) {
    const qs = new URLSearchParams({ limit: "30", created_after: createdAfter });
    if (cursor) qs.set("cursor", cursor);
    const d = await granolaGet<{ notes: GranolaNoteListItem[]; hasMore: boolean; cursor: string }>(`/v1/notes?${qs}`, access);
    out.push(...(d.notes || []).filter((n) => !n.deleted_at));
    if (!d.hasMore || !d.cursor) break;
    cursor = d.cursor;
  }
  return out.slice(0, maxNotes);
}

export const getGranolaNote = createServerOnlyFn((id: string, access?: GranolaAccess): Promise<GranolaNote> => {
  return granolaGet<GranolaNote>(`/v1/notes/${encodeURIComponent(id)}?include=transcript`, access);
});

function transcriptText(n: GranolaNote): string {
  return (n.transcript || []).map((t) => `${t.speaker?.name || "Speaker"}: ${t.text}`).join("\n");
}

export function granolaNoteMarkdown(n: GranolaNote): string {
  const att = (n.attendees || []).map((a) => [a.name, a.email && `<${a.email}>`].filter(Boolean).join(" ")).join(", ");
  const tx = transcriptText(n);
  return [
    `# ${n.title || "Untitled meeting"}`,
    ``,
    `- Date: ${n.created_at}`,
    `- Attendees: ${att || "—"}`,
    `- Granola: ${n.web_url || n.id}`,
    `- Granola note id: ${n.id}`,
    ``,
    `## Summary`,
    ``,
    n.summary_markdown || n.summary_text || "(no summary)",
    ...(tx ? [``, `## Transcript`, ``, tx] : []),
  ].join("\n");
}

// ── Drive folders ────────────────────────────────────────────

const folderCache = new Map<string, string>();

export async function findOrCreateFolder(name: string, parentId: string, driveId: string): Promise<string> {
  const key = `${parentId}/${name}`;
  const hit = folderCache.get(key);
  if (hit) return hit;
  const token = await getAccessToken();
  const safe = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = `name='${safe}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const qs = new URLSearchParams({ q, corpora: "drive", driveId, includeItemsFromAllDrives: "true", supportsAllDrives: "true", fields: "files(id)" });
  const res = await fetch(`${DRIVE_API}/files?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive folder lookup ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const found = ((await res.json()) as { files?: Array<{ id: string }> }).files?.[0]?.id;
  if (found) { folderCache.set(key, found); return found; }
  const cr = await fetch(`${DRIVE_API}/files?supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!cr.ok) throw new Error(`Drive folder create ${cr.status}: ${(await cr.text()).slice(0, 200)}`);
  const id = ((await cr.json()) as { id: string }).id;
  folderCache.set(key, id);
  return id;
}

async function driveFileExists(fileId: string): Promise<boolean> {
  if (!fileId) return false;
  try {
    const token = await getAccessToken();
    const res = await fetch(`${DRIVE_API}/files/${fileId}?supportsAllDrives=true&fields=id,trashed,size`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const d = (await res.json()) as { trashed?: boolean; size?: string };
    return !d.trashed && Number(d.size || "1") > 0;
  } catch {
    return false;
  }
}

async function copyNoteToDrive(n: GranolaNote, portco: string): Promise<{ id: string; url: string } | null> {
  const driveId = process.env.GOOGLE_KB_DRIVE_ID;
  if (!driveId) return null;
  void portco; // filed to Meeting Notes/<PortCo> on review
  const coFolder = await findOrCreateFolder("Unfiled Documents", driveId, driveId);
  const date = n.created_at.slice(0, 10);
  const name = `${date} ${n.title || "Untitled meeting"} (Granola).md`.replace(/[\\/]/g, "-");
  const doc = await uploadDriveFile({
    name,
    mimeType: "text/markdown",
    base64: Buffer.from(granolaNoteMarkdown(n), "utf8").toString("base64"),
    folderId: coFolder,
    appProperties: { granola: n.id.slice(0, 60) },
  });
  return doc ? { id: doc.id, url: doc.webViewLink } : null;
}

// ── Harvest ──────────────────────────────────────────────────

export interface GranolaHarvestInput {
  candidates: { names: string[]; workstreams: Record<string, string[]>; gidByName: Map<string, string> };
  known: Set<string>;
  suggested: Set<string>;
  isExternal: (email: string) => boolean;
  maxNotes: number;
  access?: GranolaAccess;
}

export interface GranolaHarvestOutput {
  records: KnowledgeRecord[];
  activities: HarvestedActivity[];
  links: WorkstreamLink[];
  contacts: SuggestedContact[];
  notesSeen: number;
  copiedToDrive: number;
  errors: string[];
  cursor?: { key: string; value: string };
}

const VERIFIED_PREFIX = "granola:verified:";

/** Pull new Granola notes; caller persists the returned rows. */
export async function harvestGranola(input: GranolaHarvestInput): Promise<GranolaHarvestOutput> {
  const out: GranolaHarvestOutput = { records: [], activities: [], links: [], contacts: [], notesSeen: 0, copiedToDrive: 0, errors: [] };
  if (!input.access && !isGranolaConfigured()) return out;

  const cursorKey = granolaCursorKey(input.access?.userId);
  const last = await getHarvestState(cursorKey);
  // Look back 2 days from the cursor: notes appear only once summarised.
  const since = last
    ? new Date(new Date(last).getTime() - 2 * 86400000).toISOString()
    : new Date(Date.now() - 365 * 86400000).toISOString();
  const startedAt = new Date().toISOString();

  let list: GranolaNoteListItem[];
  try {
    list = await listGranolaNotes(since, 200, input.access);
  } catch (e) {
    out.errors.push(`Granola: ${(e as Error).message}`);
    return out;
  }
  const existing = new Set((await listKnowledgeRecords()).filter((r) => r.sourceType === "granola").map((r) => r.sourceId));
  const now = new Date().toISOString();
  let processed = 0;
  let hitCap = false;

  for (const item of list.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    out.notesSeen++;
    if (existing.has(item.id)) continue;
    if (processed >= input.maxNotes) { hitCap = true; break; }
    processed++;
    try {
      const n = await getGranolaNote(item.id, input.access);
      const summary = n.summary_markdown || n.summary_text || "";
      const tx = transcriptText(n);
      const title = n.title || "Untitled meeting";
      const folderCo = (n.folder_membership || [])
        .map((f) => f.name || "")
        .find((f) => input.candidates.names.some((c) => c.toLowerCase() === f.toLowerCase()));
      const ex = await extractKnowledge(`${summary}\n\n${tx}`.slice(0, 16000), title, input.candidates.names, input.candidates.workstreams);
      const portco = (folderCo ? input.candidates.names.find((c) => c.toLowerCase() === folderCo.toLowerCase()) : undefined) || ex.portco;

      let drive: { id: string; url: string } | null = null;
      try {
        drive = await copyNoteToDrive(n, portco);
        if (drive) out.copiedToDrive++;
      } catch (e) {
        out.errors.push(`Drive copy "${title}": ${(e as Error).message}`);
      }

      const people = (n.attendees || [])
        .map((a) => ({ name: a.name || "", email: (a.email || "").toLowerCase() }))
        .filter((p) => p.email && input.isExternal(p.email));
      const recordId = recordIdFor("granola", n.id);
      const date = n.created_at.slice(0, 10);
      out.records.push({
        recordId,
        sourceType: "granola",
        sourceId: n.id,
        date,
        title,
        portco,
        participants: people.map((p) => (p.name ? `${p.name} <${p.email}>` : p.email)).join("; ").slice(0, 900),
        summary: (ex.summary || summary).slice(0, 2000),
        extractedJson: JSON.stringify({ ...ex, portco, granola: { hasTranscript: !!tx, summaryMarkdown: summary.slice(0, 30000), author: granolaAuthor(n.owner) } }).slice(0, 45000),
        textHash: sha256Hex(summary + tx),
        textRef: drive?.id || "",
        sourceUrl: n.web_url || "",
        createdAt: now,
      });
      const acts = ex.activities.length ? ex.activities : [{ type: "meeting", title, person: "", summary: ex.summary }];
      acts.forEach((a, i) => {
        out.activities.push({
          activityId: sha256Hex(`${recordId}:${a.type}:${i}`).slice(0, 24),
          recordId, date, track: "Meeting – Granola", type: a.type || "meeting",
          title: a.title || title, portco, person: a.person, owner: granolaAuthor(n.owner),
          summary: a.summary, sourceUrl: n.web_url || "", createdAt: now,
        });
      });
      if (ex.workstreamName && portco) {
        const gid = input.candidates.gidByName.get(`${portco}::${ex.workstreamName}`.toLowerCase()) || "";
        out.links.push({
          linkId: recordId, recordId, portco, workstreamGid: gid, workstreamName: ex.workstreamName,
          confidence: ex.workstreamConfidence,
          status: gid ? (ex.workstreamConfidence === "high" ? "matched" : "suggested") : "create-new",
          createdAt: now, reviewedAt: "",
        });
      }
      for (const p of people) {
        if (input.known.has(p.email) || input.suggested.has(p.email)) continue;
        input.suggested.add(p.email);
        out.contacts.push({
          suggestionId: sha256Hex(p.email).slice(0, 24), name: p.name, email: p.email,
          company: ex.people.find((x) => x.email === p.email)?.company || "",
          domain: p.email.split("@")[1] || "", portco,
          firstSeen: `${title} (${date})`.slice(0, 200), recordId, status: "pending", createdAt: now, reviewedAt: "",
        });
      }
    } catch (e) {
      out.errors.push(`Granola note "${item.title || item.id}": ${(e as Error).message}`);
    }
  }
  // Only advance the cursor once everything in the window was handled.
  // Caller advances only after all returned records and related rows are saved.
  if (!hitCap && !out.errors.length && list.length < 200) out.cursor = { key: cursorKey, value: startedAt };
  return out;
}

// ── Import status / safe-to-delete verification ─────────────

export interface GranolaImportStatus {
  noteId: string;
  title: string;
  date: string;
  portco: string;
  granolaUrl: string;
  saved: boolean;
  driveFileId: string;
  driveUrl: string;
  copiedToDrive: boolean;
  hasTranscript: boolean;
  verifiedAt: string;
  safeToDelete: boolean;
  missing: string[];
}

async function verifiedMap(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  try {
    const rows = await fetchSheetTab(KNOWLEDGE_TABS.harvestState);
    for (const r of rows.slice(1)) if (r[0]?.startsWith(VERIFIED_PREFIX)) m.set(r[0].slice(VERIFIED_PREFIX.length), r[1] || "");
  } catch { /* none yet */ }
  return m;
}

function statusFor(r: KnowledgeRecord, verified: Map<string, string>): GranolaImportStatus {
  let hasTranscript = false;
  try { hasTranscript = !!JSON.parse(r.extractedJson || "{}")?.granola?.hasTranscript; } catch { /* ignore */ }
  const v = verified.get(r.sourceId) || "";
  const missing: string[] = [];
  if (!r.textRef) missing.push("Drive copy");
  else if (!v) missing.push("verification");
  return {
    noteId: r.sourceId, title: r.title, date: r.date, portco: r.portco, granolaUrl: r.sourceUrl,
    saved: true, driveFileId: r.textRef,
    driveUrl: r.textRef ? `https://drive.google.com/file/d/${r.textRef}/view` : "",
    copiedToDrive: !!r.textRef, hasTranscript, verifiedAt: v,
    safeToDelete: !!r.textRef && !!v, missing,
  };
}

export async function listGranolaImports(): Promise<GranolaImportStatus[]> {
  const [records, verified] = await Promise.all([listKnowledgeRecords(), verifiedMap()]);
  return records
    .filter((r) => r.sourceType === "granola")
    .map((r) => statusFor(r, verified))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Re-read the saved record and the Drive file for each unverified note; stamp
 * verification when both exist. If the Drive copy is missing, re-copy it first
 * (only when retry=true). Returns updated statuses.
 */
export async function verifyGranolaImports(opts: { noteIds?: string[]; retry?: boolean; access?: GranolaAccess } = {}): Promise<GranolaImportStatus[]> {
  const records = (await listKnowledgeRecords()).filter((r) => r.sourceType === "granola");
  const verified = await verifiedMap();
  const targets = records.filter((r) => (opts.noteIds ? opts.noteIds.includes(r.sourceId) : !verified.get(r.sourceId))).slice(0, 40);
  for (const r of targets) {
    let fileId = r.textRef;
    if (!(await driveFileExists(fileId)) && opts.retry) {
      try {
        const n = await getGranolaNote(r.sourceId, opts.access);
        const copy = await copyNoteToDrive(n, r.portco);
        if (copy) {
          fileId = copy.id;
          await updateRecordTextRef(r.recordId, copy.id);
          r.textRef = copy.id;
        }
      } catch (e) {
        console.error("[granola] retry copy failed:", e);
      }
    }
    if (fileId && (await driveFileExists(fileId))) {
      const stamp = new Date().toISOString();
      await setHarvestState(`${VERIFIED_PREFIX}${r.sourceId}`, stamp);
      verified.set(r.sourceId, stamp);
    }
  }
  return records.map((r) => statusFor(r, verified)).sort((a, b) => b.date.localeCompare(a.date));
}

async function updateRecordTextRef(recordId: string, fileId: string): Promise<void> {
  const { writeSheetRow } = await import("./sheets.server");
  const rows = await fetchSheetTab(KNOWLEDGE_TABS.records);
  const idx = rows.findIndex((row, i) => i > 0 && row[0] === recordId);
  if (idx < 1) return;
  const row = [...rows[idx]];
  row[10] = fileId;
  await writeSheetRow(KNOWLEDGE_TABS.records, idx + 1, row);
}

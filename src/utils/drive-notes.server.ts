// Meeting files dropped into the "Venture Pulse KB" shared Drive (Google Meet
// "Notes by Gemini", transcripts, recordings, Word/PDF/text notes). New files are
// read, filed into Meeting Notes/<PortCo>, and tagged to whoever added them.
// Files Venture Pulse created itself carry appProperties.vp=1 and are skipped.

import { getAccessToken } from "./sheets.server";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const DOC = "application/vnd.google-apps.document";
const TEXT_TYPES = /^(text\/|application\/(vnd\.openxmlformats-officedocument\.wordprocessingml|msword|pdf|rtf))/;

interface DriveFile {
  id: string; name: string; mimeType: string; createdTime?: string; webViewLink?: string; parents?: string[];
  appProperties?: Record<string, string>;
  lastModifyingUser?: { displayName?: string; emailAddress?: string };
  sharingUser?: { displayName?: string; emailAddress?: string };
  owners?: Array<{ displayName?: string; emailAddress?: string }>;
}

async function authed(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await getAccessToken()}` };
}

/** Meeting name without Meet's " - Recording" / " - Transcript" / " - Notes by Gemini" suffix. */
export function meetingKey(name: string): string {
  return name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/\s*[-–]\s*(recording|transcript|notes by gemini|chat)\s*$/i, "").trim().toLowerCase();
}

/** Who dropped/created the file: owner (My Drive) → uploader → last editor. */
export function fileOwner(f: DriveFile): string {
  const u = f.owners?.[0] || f.sharingUser || f.lastModifyingUser;
  if (!u) return "";
  return [u.displayName, u.emailAddress ? `<${u.emailAddress}>` : ""].filter(Boolean).join(" ");
}

export async function moveDriveFile(id: string, folderId: string): Promise<void> {
  const h = await authed();
  const cur = await fetch(`${DRIVE_API}/files/${id}?fields=parents&supportsAllDrives=true`, { headers: h });
  const parents = cur.ok ? (((await cur.json()) as { parents?: string[] }).parents || []) : [];
  if (parents.includes(folderId)) return;
  const qs = new URLSearchParams({ addParents: folderId, removeParents: parents.join(","), supportsAllDrives: "true" });
  const r = await fetch(`${DRIVE_API}/files/${id}?${qs}`, {
    method: "PATCH", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ appProperties: { vp: "1" } }),
  });
  if (!r.ok) throw new Error(`Drive move ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function exportText(id: string, mimeType: string): Promise<string> {
  const h = await authed();
  const url = mimeType === DOC
    ? `${DRIVE_API}/files/${id}/export?mimeType=text/plain`
    : `${DRIVE_API}/files/${id}?alt=media&supportsAllDrives=true`;
  const r = await fetch(url, { headers: h });
  return r.ok ? await r.text() : "";
}

/** Convert a Word/PDF/etc. file to text via a temporary Google Doc. */
export async function convertToText(name: string, mimeType: string, base64: string): Promise<string> {
  const kb = process.env.GOOGLE_KB_DRIVE_ID;
  if (!kb) return "";
  if (/\.(vtt|srt|sbv)$/i.test(name)) return Buffer.from(base64, "base64").toString("utf8");
  const h = await authed();
  const boundary = `vp_${Date.now().toString(36)}`;
  const meta = JSON.stringify({ name: `vp-tmp-${name}`, mimeType: DOC, parents: [kb], appProperties: { vp: "1" } });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType || "application/octet-stream"}\r\n\r\n`),
    Buffer.from(base64, "base64"),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const r = await fetch(`${UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true&fields=id`, {
    method: "POST", headers: { ...h, "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  if (!r.ok) return "";
  const { id } = (await r.json()) as { id: string };
  const text = await exportText(id, DOC);
  await fetch(`${DRIVE_API}/files/${id}?supportsAllDrives=true`, {
    method: "PATCH", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
  }).catch(() => undefined);
  return text;
}

async function listNewFiles(kb: string, sinceIso: string): Promise<DriveFile[]> {
  const h = await authed();
  const out: DriveFile[] = [];
  let pageToken = "";
  do {
    const qs = new URLSearchParams({
      q: `trashed=false and mimeType!='application/vnd.google-apps.folder' and createdTime > '${sinceIso}'`,
      corpora: "drive", driveId: kb, includeItemsFromAllDrives: "true", supportsAllDrives: "true", pageSize: "100",
      fields: "nextPageToken,files(id,name,mimeType,createdTime,webViewLink,parents,appProperties,owners(displayName,emailAddress),sharingUser(displayName,emailAddress),lastModifyingUser(displayName,emailAddress))",
    });
    if (pageToken) qs.set("pageToken", pageToken);
    const r = await fetch(`${DRIVE_API}/files?${qs}`, { headers: h });
    if (!r.ok) throw new Error(`Drive list ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { files?: DriveFile[]; nextPageToken?: string };
    out.push(...(j.files || []));
    pageToken = j.nextPageToken || "";
  } while (pageToken && out.length < 500);
  return out;
}

export interface DriveNotesResult { imported: number; recordingsFiled: number; skipped: number; errors: string[] }

/** Import meeting files dropped anywhere in the KB shared Drive (last 90 days). */
export async function importDriveNotes(opts: { max?: number } = {}): Promise<DriveNotesResult> {
  const res: DriveNotesResult = { imported: 0, recordingsFiled: 0, skipped: 0, errors: [] };
  const kb = process.env.GOOGLE_KB_DRIVE_ID;
  if (!kb) return { ...res, errors: ["Venture Pulse KB Drive is not configured."] };
  const { listKnowledgeRecords } = await import("./knowledge.server");
  const { ingestNote } = await import("./knowledge-harvest.server");
  const { setHarvestState } = await import("./knowledge.server");
  const records = await listKnowledgeRecords();
  const done = new Set(records.flatMap((r) => [r.textRef, r.sourceType === "drive-doc" ? r.sourceId : ""]).filter(Boolean));
  const since = new Date(Date.now() - 90 * 86400_000).toISOString();
  const files = (await listNewFiles(kb, since)).filter((f) => f.appProperties?.vp !== "1" && !done.has(f.id));
  const folderByMeeting = new Map<string, string>();
  const videos: DriveFile[] = [];
  let n = 0;
  for (const f of files) {
    if (/^video\/|^audio\//.test(f.mimeType)) { videos.push(f); continue; }
    if (f.mimeType !== DOC && !TEXT_TYPES.test(f.mimeType)) { res.skipped++; continue; }
    if (n >= (opts.max ?? 25)) break;
    n++;
    try {
      let text = await exportText(f.id, f.mimeType);
      if (f.mimeType !== DOC && !f.mimeType.startsWith("text/")) {
        const h = await authed();
        const raw = await fetch(`${DRIVE_API}/files/${f.id}?alt=media&supportsAllDrives=true`, { headers: h });
        text = raw.ok ? await convertToText(f.name, f.mimeType, Buffer.from(await raw.arrayBuffer()).toString("base64")) : "";
      }
      if (!text.trim()) { res.skipped++; continue; }
      const owner = fileOwner(f);
      const r = await ingestNote({
        text, title: f.name.replace(/\.[^.]+$/, ""), sourceType: "drive-doc", sourceId: f.id, importedBy: owner,
        date: (f.createdTime || "").slice(0, 10) || undefined,
        driveFileId: f.id, driveUrl: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
      });
      folderByMeeting.set(meetingKey(f.name), r.portco);
      res.imported++;
    } catch (e) {
      res.errors.push(`${f.name}: ${(e as Error).message}`);
    }
  }
  // Recordings have no text: file them next to their meeting's notes/transcript.
  if (videos.length) {
    const { findOrCreateFolder } = await import("./granola.server");
    const notes = await findOrCreateFolder("Meeting Notes", kb, kb);
    for (const v of videos) {
      const portco = folderByMeeting.get(meetingKey(v.name))
        ?? records.find((r) => meetingKey(r.title) === meetingKey(v.name))?.portco ?? null;
      if (portco === null) { res.skipped++; continue; } // wait until its notes arrive
      try {
        await moveDriveFile(v.id, await findOrCreateFolder(portco || "Unmatched", notes, kb));
        await setHarvestState(`recordingOwner:${v.id}`, fileOwner(v));
        res.recordingsFiled++;
      } catch (e) {
        res.errors.push(`${v.name}: ${(e as Error).message}`);
      }
    }
  }
  return res;
}

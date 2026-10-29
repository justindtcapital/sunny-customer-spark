// Vic knowledge base: searches the Venture Pulse KB shared drive using Google
// Drive's own full-text index, then reads matching Docs/Sheets/text files for
// cited snippets. Read-only. Server-only.
import { getAccessToken } from "./sheets.server";
import { extractSnippets, kbQueryClause } from "@/lib/vic-kb";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";

export function kbDriveId(): string {
  return process.env["VIC_KB_DRIVE_ID"]?.trim() || "0AFtlyPes27_K9k9K9VPA";
}

async function drive(path: string, params: Record<string, string>) {
  const token = await getAccessToken();
  const qs = new URLSearchParams({ supportsAllDrives: "true", ...params });
  const res = await fetch(`${DRIVE_API}${path}?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[vic-kb] ${path} ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`Google Drive error ${res.status}`);
  }
  return res;
}

const listParams = () => ({ corpora: "drive", driveId: kbDriveId(), includeItemsFromAllDrives: "true" });

export interface KbFolder { id: string; name: string }

/** Top-level folders of the KB drive (for the folder picker). */
export async function listKbFolders(): Promise<KbFolder[]> {
  const res = await drive("/files", {
    ...listParams(),
    q: `'${kbDriveId()}' in parents and mimeType='${FOLDER}' and trashed=false`,
    fields: "files(id,name)", orderBy: "name", pageSize: "100",
  });
  const data = (await res.json()) as { files?: KbFolder[] };
  return data.files || [];
}

/** Folder ids plus up to two levels of subfolders, so a picked folder covers its contents. */
async function expandFolders(ids: string[]): Promise<string[]> {
  const all = new Set(ids);
  let frontier = ids;
  for (let depth = 0; depth < 2 && frontier.length && all.size < 120; depth++) {
    const q = `(${frontier.slice(0, 40).map((id) => `'${id}' in parents`).join(" or ")}) and mimeType='${FOLDER}' and trashed=false`;
    const data = (await (await drive("/files", { ...listParams(), q, fields: "files(id)", pageSize: "200" })).json()) as { files?: { id: string }[] };
    frontier = (data.files || []).map((f) => f.id).filter((id) => !all.has(id));
    frontier.forEach((id) => all.add(id));
  }
  return [...all];
}

async function readText(id: string, mimeType: string): Promise<string> {
  try {
    if (mimeType === "application/vnd.google-apps.document" || mimeType === "application/vnd.google-apps.presentation")
      return await (await drive(`/files/${id}/export`, { mimeType: "text/plain" })).text();
    if (mimeType === "application/vnd.google-apps.spreadsheet")
      return await (await drive(`/files/${id}/export`, { mimeType: "text/csv" })).text();
    if (mimeType.startsWith("text/") || mimeType === "application/json")
      return await (await drive(`/files/${id}`, { alt: "media" })).text();
  } catch { /* unreadable — return name/link only */ }
  return "";
}

export async function searchKb(query: string, folderIds: string[] = []) {
  const scope = folderIds.length ? await expandFolders(folderIds) : [];
  let q = `${kbQueryClause(query)} and trashed=false and mimeType!='${FOLDER}'`;
  if (scope.length) q += ` and (${scope.slice(0, 100).map((id) => `'${id}' in parents`).join(" or ")})`;
  const data = (await (await drive("/files", {
    ...listParams(), q, pageSize: "12",
    fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
  })).json()) as { files?: { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string }[] };
  const files = data.files || [];
  const withText = await Promise.all(files.map(async (f, i) => {
    const text = i < 6 ? await readText(f.id, f.mimeType) : "";
    return {
      title: f.name, link: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
      modified: (f.modifiedTime || "").slice(0, 10), type: f.mimeType.split(/[./]/).pop(),
      snippets: text ? extractSnippets(text, query) : [],
    };
  }));
  return { searchedFolders: folderIds.length ? "selected folders" : "whole knowledge base", results: withText };
}

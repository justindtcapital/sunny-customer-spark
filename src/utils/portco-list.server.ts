import { getAccessToken } from "./sheets.server";
import { parsePortcoList, type PortcoListEntry } from "@/lib/portco-list";

let cache: { at: number; list: PortcoListEntry[]; file: string } | null = null;

/** Newest "PortCo List …" spreadsheet in Drive (or PORTCO_LIST_FILE_ID), exported as CSV. */
export async function loadPortcoList(): Promise<{ list: PortcoListEntry[]; file: string }> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache;
  const token = await getAccessToken();
  const h = { Authorization: `Bearer ${token}` };
  let id = process.env.PORTCO_LIST_FILE_ID?.trim() || "";
  let file = "";
  if (!id) {
    const q = encodeURIComponent("name contains 'PortCo List' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&corpora=allDrives&includeItemsFromAllDrives=true&supportsAllDrives=true&orderBy=modifiedTime desc&pageSize=10&fields=files(id,name)`, { headers: h });
    if (!r.ok) throw new Error(`PortCo List lookup failed [${r.status}]: ${await r.text()}`);
    const files = ((await r.json()) as { files?: { id: string; name: string }[] }).files || [];
    const f = files.find((x) => /^portco list/i.test(x.name)) || files[0];
    if (!f) throw new Error("No 'PortCo List' sheet found in Drive");
    id = f.id; file = f.name;
  }
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/csv`, { headers: h });
  if (!r.ok) throw new Error(`PortCo List export failed [${r.status}]: ${await r.text()}`);
  cache = { at: Date.now(), list: parsePortcoList(await r.text()), file: file || id };
  return cache;
}

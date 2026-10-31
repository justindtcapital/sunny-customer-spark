import { getAccessToken } from "./sheets.server";
import { parsePortcoList, type PortcoListEntry } from "@/lib/portco-list";
import { createServerOnlyFn } from "@tanstack/react-start";
import { planPortcoMirror, type PortcoMirrorInput } from "@/lib/portco-sheet-sync";

let cache: { at: number; list: PortcoListEntry[]; file: string } | null = null;

/** Newest "PortCo List …" spreadsheet in Drive (or PORTCO_LIST_FILE_ID), exported as CSV. */
export const resolvePortcoList = createServerOnlyFn(async () => {
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
  return { id, file: file || id, headers: h };
});

export const loadPortcoList = createServerOnlyFn(async (): Promise<{ list: PortcoListEntry[]; file: string }> => {
  // A fresh read prevents other Worker instances serving old approved descriptions after a save.
  const { id, file, headers: h } = await resolvePortcoList();
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/csv`, { headers: h, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`PortCo List export failed [${r.status}]: ${await r.text()}`);
  cache = { at: Date.now(), list: parsePortcoList(await r.text()), file: file || id };
  return cache;
});

export const mirrorPortco = createServerOnlyFn(async (input: PortcoMirrorInput): Promise<{ syncError?: string }> => {
  try {
    const { id, headers } = await resolvePortcoList();
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
    const request = async (path: string, method = "GET", body?: object) => {
      const response = await fetch(base + path, { method, headers: { ...headers, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`PortCo List sync failed [${response.status}]: ${await response.text()}`);
      return response.json();
    };
    const meta = await request("?fields=sheets.properties");
    const title = meta.sheets?.[0]?.properties?.title as string | undefined;
    if (!title) throw new Error("PortCo List has no sheet");
    const range = `'${title.replace(/'/g, "''")}'`;
    const values = await request(`/values/${encodeURIComponent(range)}`);
    const plan = planPortcoMirror(values.values || [], input);
    if (plan.append) await request(`/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", { values: [plan.row] });
    else await request(`/values/${encodeURIComponent(range)}!A${plan.rowIndex + 1}?valueInputOption=RAW`, "PUT", { values: [plan.row] });
    cache = null;
    return {};
  } catch (error) {
    console.error("PortCo mirror failed", error);
    return { syncError: "Saved in the CRM, but the approved PortCo List could not be updated. Open this company and save again to retry." };
  }
});

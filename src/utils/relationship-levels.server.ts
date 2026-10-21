import { nextRelationshipLevel, type RelationshipChange } from "@/lib/relationship-rating";
import type { Temperature } from "@/lib/types";
import { appendSheetRows, bulkUpdateContacts, deleteSheetRows, ensureColumn, ensureTab, fetchSheetTab, TAB_NAMES, TARGET_HEADERS } from "./sheets.server";

const norm = (value: string) => value.trim().toLowerCase();
const cell = (headers: string[], row: string[], name: string) => row[headers.indexOf(norm(name))] || "";

/** Copy and verify the source before removing it; history tabs stay untouched. */
async function moveToProspecting(headers: string[], source: string[]): Promise<boolean> {
  const urid = cell(headers, source, "urid");
  if (!urid) return false;
  await ensureTab(TAB_NAMES.targets, TARGET_HEADERS);
  for (const header of ["Network Profile", "Prime", "Phone"]) await ensureColumn(TAB_NAMES.targets, header);
  const targets = await fetchSheetTab(TAB_NAMES.targets, true);
  const targetHeaders = (targets[0] || []).map(norm);
  const snapshot = JSON.stringify(Object.fromEntries(headers.map((h, i) => [h, source[i] || ""])));
  const names = cell(headers, source, "name").trim().split(/\s+/);
  const fields: Record<string, string> = Object.fromEntries(headers.map((h, i) => [h, source[i] || ""]));
  Object.assign(fields, {
    "first name": names[0] || "", "last name": names.slice(1).join(" "),
    role: cell(headers, source, "role") || cell(headers, source, "title"), stage: "Prospecting",
    "network profile": snapshot, prime: cell(headers, source, "relationship prime") || cell(headers, source, "prime"),
    phone: cell(headers, source, "phone number") || cell(headers, source, "phone"),
    sector: cell(headers, source, "industry category") || cell(headers, source, "sector"),
    "research purpose": cell(headers, source, "source context"),
  });
  const existing = targets.slice(1).find((r) => cell(targetHeaders, r, "urid") === urid ||
    (cell(headers, source, "email") && norm(cell(targetHeaders, r, "email")) === norm(cell(headers, source, "email"))));
  // A previous partial move is retryable; unrelated existing prospects aren't overwritten.
  if (existing && cell(targetHeaders, existing, "network profile") !== snapshot) return false;
  if (!existing) await appendSheetRows(TAB_NAMES.targets, [targetHeaders.map((h) => fields[h] || "")]);
  const verified = await fetchSheetTab(TAB_NAMES.targets, true);
  const verifiedHeaders = (verified[0] || []).map(norm);
  if (!verified.slice(1).some((r) => cell(verifiedHeaders, r, "urid") === urid && cell(verifiedHeaders, r, "network profile") === snapshot)) return false;
  const latest = await fetchSheetTab(TAB_NAMES.contacts, true);
  const latestHeaders = (latest[0] || []).map(norm);
  const index = latest.findIndex((r, i) => i > 0 && cell(latestHeaders, r, "urid") === urid);
  if (index < 1) return true;
  if (headers.some((h, i) => cell(latestHeaders, latest[index], h) !== (source[i] || ""))) return false;
  return (await deleteSheetRows(TAB_NAMES.contacts, [index + 1])) === 1;
}

export async function changeRelationshipLevels(input: { contacts: { urid?: string; email: string; temperature: Temperature }[]; change: RelationshipChange }) {
  const rows = await fetchSheetTab(TAB_NAMES.contacts, true);
  const headers = (rows[0] || []).map(norm);
  const result = { updated: 0, moved: 0, skipped: 0 };
  const groups = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const selected of input.contacts) {
    const key = selected.urid || norm(selected.email);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const source = rows.slice(1).find((r) => selected.urid ? cell(headers, r, "urid") === selected.urid : norm(cell(headers, r, "email")) === norm(selected.email));
    // Read the rating exactly as the app displays it (blank/odd casing → Cold).
    const raw = source ? norm(cell(headers, source, "relationship status")) : "";
    const current = (source ? ({ council: "Council", hot: "Hot", warm: "Warm", cold: "Cold" } as Record<string, Temperature>)[raw] || "Cold" : undefined) as Temperature | undefined;
    if (!source || !current || current !== selected.temperature) { result.skipped++; continue; }
    const next = nextRelationshipLevel(current, input.change);
    if (!next) { result.skipped++; continue; }
    if (next === "Prospecting") {
      if (await moveToProspecting(headers, source)) result.moved++;
      else result.skipped++;
    } else {
      const email = cell(headers, source, "email");
      if (!email) { result.skipped++; continue; }
      groups.set(next, [...(groups.get(next) || []), email]);
    }
  }
  for (const [level, emails] of groups) result.updated += (await bulkUpdateContacts(emails, "status", level)).updated;
  return result;
}
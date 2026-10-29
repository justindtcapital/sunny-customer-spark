import { nextRelationshipLevel, type RelationshipChange } from "@/lib/relationship-rating";
import type { Temperature } from "@/lib/types";
import { snapshotEqual, outcomeTotals, type BulkOutcome } from "@/lib/bulk-operation";
import { emailIdentities } from "@/lib/import-dedupe";
import { logNetworkMovements, appendSheetRows, setContactRating, deleteSheetRows, ensureColumn, ensureTab, fetchSheetTab, TAB_NAMES, TARGET_HEADERS } from "./sheets.server";

const norm = (value: string) => value.trim().toLowerCase();
const cell = (headers: string[], row: string[], name: string) => row[headers.indexOf(norm(name))] || "";
export interface RelationshipInput { contacts: { urid?: string; email: string; temperature: Temperature; name?: string; destination?: Temperature | "Prospecting" | null }[]; change: RelationshipChange }
const rating = (s: string): Temperature => ({ council: "Council", hot: "Hot", warm: "Warm", cold: "Cold" } as Record<string, Temperature>)[norm(s)] || "Cold";

async function moveToProspecting(headers: string[], source: string[]): Promise<{ status: BulkOutcome["status"]; reason: string }> {
  const urid = cell(headers, source, "urid");
  if (!urid) return { status: "blocked", reason: "Missing stable contact ID; source was retained." };
  await ensureTab(TAB_NAMES.targets, TARGET_HEADERS);
  for (const header of [...TARGET_HEADERS, "Network Profile", "Prime", "Phone"]) await ensureColumn(TAB_NAMES.targets, header);
  const targets = await fetchSheetTab(TAB_NAMES.targets, true), th = (targets[0] || []).map(norm);
  const snapshot = JSON.stringify(Object.fromEntries(headers.map((h, i) => [h, source[i] || ""])));
  const names = cell(headers, source, "name").trim().split(/\s+/);
  const fields: Record<string, string> = Object.fromEntries(headers.map((h, i) => [h, source[i] || ""]));
  Object.assign(fields, { "first name": names[0] || "", "last name": names.slice(1).join(" "), role: cell(headers, source, "role") || cell(headers, source, "title"), stage: "Prospecting", "network profile": snapshot, prime: cell(headers, source, "relationship prime") || cell(headers, source, "prime"), phone: cell(headers, source, "phone number") || cell(headers, source, "phone"), sector: cell(headers, source, "industry category") || cell(headers, source, "sector"), "research purpose": cell(headers, source, "source context") });
  const emails = emailIdentities(cell(headers, source, "email"));
  const matches = targets.slice(1).filter(r => cell(th, r, "urid") === urid || emailIdentities(cell(th,r,"email")).some(e => emails.includes(e)));
  if (matches.length > 1) return { status: "blocked", reason: "Multiple matching prospects; review identities before moving." };
  const existing = matches[0];
  if (existing && (cell(th,existing,"urid") !== urid || !snapshotEqual(cell(th,existing,"network profile"), snapshot))) return { status: "blocked", reason: "Existing prospect has a different ID or profile; no data was overwritten." };
  if (!existing) await appendSheetRows(TAB_NAMES.targets, [th.map(h => fields[h] || "")]);
  const verified = await fetchSheetTab(TAB_NAMES.targets, true), vh = (verified[0] || []).map(norm);
  const copies = verified.slice(1).filter(r => cell(vh,r,"urid") === urid);
  const copy = copies[0];
  if (copies.length !== 1 || !copy || !snapshotEqual(cell(vh,copy,"network profile"), snapshot) || ["stage","email","first name","last name","role","prime","phone","sector"].some(h => cell(vh,copy,h) !== (fields[h] || ""))) return { status: "blocked", reason: "Destination copy could not be verified; Network source was retained." };
  const latest = await fetchSheetTab(TAB_NAMES.contacts, true), lh = (latest[0] || []).map(norm);
  const indices = latest.flatMap((r,i) => i > 0 && cell(lh,r,"urid") === urid ? [i] : []);
  if (!indices.length) return { status: "already_complete", reason: "Verified in Prospecting; no Network source remains." };
  if (indices.length !== 1) return { status: "blocked", reason: "Duplicate Network IDs; source was retained for review." };
  const index = indices[0];
  if (index === undefined) return { status: "blocked", reason: "Source identity unavailable." };
  const latestSnapshot = JSON.stringify(Object.fromEntries(lh.map((h,i) => [h, latest[index][i] || ""])));
  if (!snapshotEqual(snapshot, latestSnapshot)) return { status: "blocked", reason: "Contact changed after the copy; review the newer source before moving." };
  await deleteSheetRows(TAB_NAMES.contacts, [index + 1]);
  const after = await fetchSheetTab(TAB_NAMES.contacts, true), ah = (after[0] || []).map(norm);
  if (after.slice(1).some(r => cell(ah,r,"urid") === urid)) return { status: "uncertain", reason: "Source deletion could not be confirmed; reconciliation required." };
  return { status: "moved", reason: "Profile verified in Prospecting and removed from Network." };
}

export async function changeRelationshipLevels(input: RelationshipInput, prior: BulkOutcome[] = [], checkpoint?: (outcomes: BulkOutcome[]) => Promise<void>) {
  const outcomes: BulkOutcome[] = [], seen = new Set<string>();
  for (const selected of input.contacts) {
    const key = selected.urid || norm(selected.email);
    const destination = selected.destination !== undefined ? selected.destination : nextRelationshipLevel(selected.temperature, input.change);
    const base = { key, label: selected.name || selected.email || selected.urid || "Contact", from: selected.temperature, to: destination || "" };
    const previous = prior.find(o => o.key === key);
    if (previous && ["changed","moved","already_complete","duplicate"].includes(previous.status)) { outcomes.push(previous); continue; }
    let outcome: BulkOutcome;
    try {
      const rows = await fetchSheetTab(TAB_NAMES.contacts, true), headers = (rows[0] || []).map(norm);
      const emails = emailIdentities(selected.email);
      const matches = rows.slice(1).filter(r => selected.urid ? cell(headers,r,"urid") === selected.urid : emailIdentities(cell(headers,r,"email")).some(e => emails.includes(e)));
      const source = matches[0];
      if (matches.length > 1) outcome = { ...base, status: "blocked", reason: "Multiple matching Network records; review identity." };
      else if (!source) {
        const targets = await fetchSheetTab(TAB_NAMES.targets, true), th = (targets[0] || []).map(norm);
        const copies = targets.slice(1).filter(r => !!selected.urid && cell(th,r,"urid") === selected.urid);
        const copy = copies[0];
        let verified = false;
        try { const profile = JSON.parse(copy ? cell(th,copy,"network profile") : "null"); verified = profile?.urid === selected.urid && cell(th,copy || [],"stage") === "Prospecting"; } catch { /* unverified */ }
        outcome = { ...base, status: destination === "Prospecting" && copies.length === 1 && verified ? "already_complete" : "blocked", reason: destination === "Prospecting" && copies.length === 1 && verified ? "Already moved to Prospecting; verified stable ID and saved profile." : "Network record not found and no verified completed transfer exists." };
      } else {
        const resolved = cell(headers,source,"urid") || cell(headers,source,"email");
        if (seen.has(resolved)) outcome = { ...base, status: "duplicate", reason: "Same resolved contact was selected twice; no repeat write." };
        else {
          seen.add(resolved);
          const current = rating(cell(headers,source,"relationship status"));
          if (!destination) outcome = { ...base, status: "blocked", reason: "Council is already the highest relationship tier." };
          else if (current !== selected.temperature) outcome = { ...base, status: prior.length && current === destination ? "already_complete" : "blocked", reason: prior.length && current === destination ? "Original destination is already saved; no second step applied." : `Saved rating is ${current}, not ${selected.temperature}; reload and review the teammate change.` };
          else if (destination === "Prospecting") {
            const moved = await moveToProspecting(headers, source);
            outcome = { ...base, ...moved };
            if (moved.status === "moved") await logNetworkMovements([{ email: cell(headers,source,"email"), name: cell(headers,source,"name"), from: current, to: "Prospecting", reason: "Moved to Prospecting" }]);
          } else {
            const saved = await setContactRating(cell(headers,source,"email"), destination, cell(headers,source,"urid"), current);
            const check = await fetchSheetTab(TAB_NAMES.contacts, true), ch = (check[0] || []).map(norm);
            const verified = check.slice(1).filter(r => cell(headers,source,"urid") ? cell(ch,r,"urid") === cell(headers,source,"urid") : cell(ch,r,"email") === cell(headers,source,"email"));
            const confirmed = saved.success && verified.length === 1 && rating(cell(ch,verified[0],"relationship status")) === destination;
            outcome = { ...base, status: confirmed ? "changed" : saved.success ? "uncertain" : "blocked", reason: confirmed ? `Saved ${destination}.` : saved.success ? "Saved rating could not be verified; reconciliation required." : "Contact changed before the write; refresh and review." };
          }
        }
      }
    } catch (e) {
      console.error("[relationship-change] item failed", key, e instanceof Error ? e.message : "error");
      outcome = { ...base, status: "uncertain", reason: "Save was interrupted; review persisted state before retrying." };
    }
    outcomes.push(outcome);
    await checkpoint?.(outcomes);
    if (outcome.status === "uncertain") {
      for (const remaining of input.contacts.slice(outcomes.length)) outcomes.push({ key: remaining.urid || norm(remaining.email), label: remaining.name || remaining.email, status: "failed", reason: "Not started after an uncertain save.", retryable: true, from: remaining.temperature, to: remaining.destination || "" });
      break;
    }
  }
  return { ...outcomeTotals(outcomes), outcomes };
}

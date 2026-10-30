import { nextRelationshipLevel, type RelationshipChange } from "@/lib/relationship-rating";
import type { Temperature } from "@/lib/types";
import { outcomeTotals, type BulkOutcome } from "@/lib/bulk-operation";
import { emailIdentities } from "@/lib/import-dedupe";
import { planStatusFlags, PROSPECT_STATUS, isProspectStatus } from "@/lib/unified-contacts";
import { logNetworkMovements, setContactRating, ensureColumn, fetchSheetTab, updateSheetCells, colLetters, TAB_NAMES } from "./sheets.server";

const norm = (value: string) => value.trim().toLowerCase();
const cell = (headers: string[], row: string[], name: string) => row[headers.indexOf(norm(name))] || "";
export interface RelationshipInput { contacts: { urid?: string; email: string; temperature: Temperature; name?: string; destination?: Temperature | "Prospecting" | null }[]; change: RelationshipChange }
const rating = (s: string): Temperature => ({ council: "Council", hot: "Hot", warm: "Warm", cold: "Cold" } as Record<string, Temperature>)[norm(s)] || "Cold";

/**
 * Relationship changes are in-place flags on the single Contacts row: moving to
 * Prospecting sets Relationship Status = "Prospecting" (one batched write for the
 * whole selection); tier changes set the tier. Nothing is copied or deleted, so
 * an interruption can never leave a person half-moved.
 */
export async function changeRelationshipLevels(input: RelationshipInput, prior: BulkOutcome[] = [], checkpoint?: (outcomes: BulkOutcome[]) => Promise<void>, limits?: { maxItems: number; maxMs: number }) {
  const results = new Map<string, BulkOutcome>();
  const order: string[] = [];
  const started = Date.now();
  let processed = 0;
  const rows = await fetchSheetTab(TAB_NAMES.contacts, true), headers = (rows[0] || []).map(norm);
  const seen = new Set<string>();
  const toProspect: { key: string; urid: string; expected: string; base: Omit<BulkOutcome, "status" | "reason">; email: string; name: string }[] = [];

  for (const selected of input.contacts) {
    const key = selected.urid || norm(selected.email);
    order.push(key);
    const destination = selected.destination !== undefined ? selected.destination : nextRelationshipLevel(selected.temperature, input.change);
    const base = { key, label: selected.name || selected.email || selected.urid || "Contact", from: selected.temperature, to: destination || "" };
    const previous = prior.find((o) => o.key === key);
    if (previous && ["changed", "moved", "already_complete", "duplicate"].includes(previous.status)) { results.set(key, previous); continue; }
    const emails = emailIdentities(selected.email);
    const matches = rows.slice(1).filter((r) => selected.urid ? cell(headers, r, "urid") === selected.urid : !isProspectStatus(cell(headers, r, "relationship status")) && emailIdentities(cell(headers, r, "email")).some((e) => emails.includes(e)));
    const source = matches[0];
    if (matches.length > 1) { results.set(key, { ...base, status: "blocked", reason: "Multiple matching contacts; review identity." }); continue; }
    if (!source) { results.set(key, { ...base, status: "blocked", reason: "Contact not found; reload the page and try again." }); continue; }
    const urid = cell(headers, source, "urid");
    const resolved = urid || norm(cell(headers, source, "email"));
    if (seen.has(resolved)) { results.set(key, { ...base, status: "duplicate", reason: "Same contact was selected twice; no repeat write." }); continue; }
    seen.add(resolved);
    const saved = cell(headers, source, "relationship status");
    if (destination === "Prospecting" && isProspectStatus(saved)) { results.set(key, { ...base, status: "already_complete", reason: "Already in Prospecting." }); continue; }
    const current = rating(saved);
    if (!destination) { results.set(key, { ...base, status: "blocked", reason: "Council is already the highest relationship tier." }); continue; }
    if (current !== selected.temperature) {
      const done = current === destination;
      results.set(key, { ...base, status: done ? "already_complete" : "blocked", reason: done ? "Already saved at the requested level." : `Saved rating is ${current}, not ${selected.temperature}; reload and review the teammate change.` });
      continue;
    }
    if (!urid) { results.set(key, { ...base, status: "blocked", reason: "Missing stable contact ID; nothing was changed." }); continue; }
    if (destination === "Prospecting") { toProspect.push({ key, urid, expected: saved, base, email: cell(headers, source, "email"), name: cell(headers, source, "name") }); continue; }
    if (limits && (processed >= limits.maxItems || Date.now() - started >= limits.maxMs)) {
      results.set(key, { ...base, status: "pending", retryable: true, reason: "Not started in this slice. Resume finishes the original destination, without replaying completed items." });
      continue;
    }
    processed++;
    try {
      const ok = await setContactRating(cell(headers, source, "email"), destination, urid, current);
      results.set(key, { ...base, status: ok.success ? "changed" : "blocked", reason: ok.success ? `Saved ${destination}.` : "Contact changed before the write; refresh and review." });
    } catch (e) {
      console.error("[relationship-change] tier change failed", key, e instanceof Error ? e.message : "error");
      results.set(key, { ...base, status: "failed", retryable: true, reason: "Save failed before writing; safe to retry." });
    }
  }

  if (toProspect.length) {
    // One fresh read + one batched write for every move to Prospecting.
    await ensureColumn(TAB_NAMES.contacts, "Prospecting Stage");
    const live = await fetchSheetTab(TAB_NAMES.contacts, true), lh = (live[0] || []).map(norm);
    const statusCol = lh.indexOf("relationship status"), stageCol = lh.indexOf("prospecting stage");
    const plan = planStatusFlags(live, toProspect.map((p) => ({ urid: p.urid, expected: p.expected, to: PROSPECT_STATUS })));
    const updates: { range: string; value: string }[] = [];
    const moving: typeof toProspect = [];
    plan.forEach((p, i) => {
      const item = toProspect[i];
      if (p.status === "change" && p.row) {
        updates.push({ range: `${colLetters(statusCol)}${p.row}`, value: PROSPECT_STATUS });
        if (stageCol >= 0 && !live[p.row - 1][stageCol]) updates.push({ range: `${colLetters(stageCol)}${p.row}`, value: PROSPECT_STATUS });
        moving.push(item);
      } else {
        results.set(item.key, { ...item.base, status: p.status === "already" ? "already_complete" : "blocked", reason: p.status === "already" ? "Already in Prospecting." : p.status === "changed-elsewhere" ? `Saved status is now ${p.current || "blank"}; reload and review the teammate change.` : "Contact ID is missing or duplicated; nothing was changed." });
      }
    });
    try {
      await updateSheetCells(TAB_NAMES.contacts, updates);
      const check = await fetchSheetTab(TAB_NAMES.contacts, true), kh = (check[0] || []).map(norm);
      for (const item of moving) {
        const row = check.slice(1).filter((r) => cell(kh, r, "urid") === item.urid);
        const ok = row.length === 1 && isProspectStatus(cell(kh, row[0], "relationship status"));
        results.set(item.key, { ...item.base, status: ok ? "moved" : "uncertain", reason: ok ? "Flagged as Prospecting (same record, same ID)." : "Status could not be confirmed; reload to check." });
      }
      await logNetworkMovements(moving.map((m) => ({ email: m.email, name: m.name, from: m.expected || "Cold", to: "Prospecting", reason: "Moved to Prospecting" })));
    } catch (e) {
      console.error("[relationship-change] prospect flag failed", e instanceof Error ? e.message : "error");
      for (const item of moving) results.set(item.key, { ...item.base, status: "failed", retryable: true, reason: "Save failed; safe to retry (status flags only)." });
    }
  }

  const outcomes = order.map((k) => results.get(k)!).filter(Boolean);
  await checkpoint?.(outcomes);
  return { ...outcomeTotals(outcomes), outcomes };
}

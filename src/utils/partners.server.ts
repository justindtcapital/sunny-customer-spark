// Partners live in their own "Partners" sheet tab. Contacts are linked to a
// partner by company match at read time, so Network/Prospecting rows are never
// edited or moved — every existing and future contact is tagged automatically.

import { appendSheetRow, appendSheetRows, ensureColumn, ensureTab, fetchSheetTab, updateSheetCells } from "./sheets.server";
import { SEED_PARTNERS, matchPartner, normalizeCategory, type Partner, type PartnerCategory } from "@/lib/partners";

const TAB = "Partners";
const HEADERS = ["Name", "Category", "Website", "Notes", "Aliases", "Created", "Summary", "Location"];
const RENAMES: Record<string, string> = { arctic: "Arctiq" };

function colLetter(i: number): string {
  let n = i + 1, out = "";
  while (n > 0) { const m = (n - 1) % 26; out = String.fromCharCode(65 + m) + out; n = Math.floor((n - 1) / 26); }
  return out;
}

let reconciled: Promise<void> | null = null;
/** Bring sheet rows up to date with the seed list: renames, blank websites, new partners. Never overwrites a filled cell. */
function reconcile(rows: string[][]): Promise<void> {
  if (reconciled) return reconciled;
  reconciled = (async () => {
    await ensureColumn(TAB, "Summary");
    await ensureColumn(TAB, "Location");
    const h = (rows[0] || []).map((x) => (x || "").trim().toLowerCase());
    const ni = h.indexOf("name"), wi = h.indexOf("website");
    const updates: { range: string; value: string }[] = [];
    const have = new Set<string>();
    rows.slice(1).forEach((r, i) => {
      const rowNo = i + 2;
      let name = (r[ni] || "").trim();
      const renamed = RENAMES[name.toLowerCase()];
      if (renamed) { updates.push({ range: `${colLetter(ni)}${rowNo}`, value: renamed }); name = renamed; }
      have.add(name.toLowerCase());
      const seed = SEED_PARTNERS.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (seed?.website && wi >= 0 && !(r[wi] || "").trim()) updates.push({ range: `${colLetter(wi)}${rowNo}`, value: seed.website });
    });
    if (updates.length) await updateSheetCells(TAB, updates);
    const missing = SEED_PARTNERS.filter((p) => !have.has(p.name.toLowerCase()));
    if (missing.length) {
      const now = new Date().toISOString();
      await appendSheetRows(TAB, missing.map((p) => [p.name, p.category, p.website, "", (p.aliases || []).join(", "), now]));
    }
  })().catch((e) => { reconciled = null; console.error("[partners] reconcile failed:", e); });
  return reconciled;
}

export async function listPartners(): Promise<Partner[]> {
  await ensureTab(TAB, HEADERS);
  let rows = await fetchSheetTab(TAB);
  if (rows.length <= 1) {
    const now = new Date().toISOString();
    await appendSheetRows(TAB, SEED_PARTNERS.map((p) => [p.name, p.category, p.website, "", (p.aliases || []).join(", "), now]));
    return SEED_PARTNERS.map((p) => ({ ...p, notes: "", aliases: p.aliases || [] }));
  }
  await reconcile(rows);
  rows = await fetchSheetTab(TAB);
  const h = (rows[0] || []).map((x) => (x || "").trim().toLowerCase());
  const at = (r: string[], k: string) => ((h.indexOf(k) >= 0 ? r[h.indexOf(k)] : "") || "").trim();
  rows = rows.slice(1);
  const seen = new Set<string>();
  const out: Partner[] = [];
  for (const r of rows) {
    const name = at(r, "name");
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({
      name, category: normalizeCategory(at(r, "category")), website: at(r, "website"), notes: at(r, "notes"),
      aliases: at(r, "aliases").split(/\s*,\s*/).filter(Boolean),
      summary: at(r, "summary"), location: at(r, "location"),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addPartner(input: { name: string; category: PartnerCategory; website?: string; notes?: string }): Promise<Partner> {
  const name = input.name.trim();
  if (!name) throw new Error("Partner name is required");
  const existing = await listPartners();
  if (existing.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new Error(`${name} is already a partner`);
  const p: Partner = { name, category: normalizeCategory(input.category), website: (input.website || "").trim(), notes: (input.notes || "").trim(), aliases: [] };
  await appendSheetRow(TAB, [p.name, p.category, p.website, p.notes, "", new Date().toISOString()]);
  return p;
}

export interface PartnerContact { name: string; email: string; company: string; where: "Network" | "Prospecting" }
export interface PartnerActivity { recordId: string; date: string; title: string; summary: string; track: string; source: string; url: string; nextSteps: string[] }

export interface PartnerSummary { name: string; contacts: number }

/** Contact counts per partner for the list page. */
export async function partnerSummaries(): Promise<{ partners: Partner[]; counts: Record<string, number>; activity: Record<string, number> }> {
  const [partners, { peopleDirectory }] = await Promise.all([listPartners(), import("./notes-inbox.server")]);
  const people = await peopleDirectory();
  const counts: Record<string, number> = {};
  for (const p of people) {
    const m = matchPartner(p.company, partners);
    if (m) counts[m.name] = (counts[m.name] || 0) + 1;
  }
  // Reviewed notes/emails tagged to each partner (directly or on a next step).
  const activity: Record<string, number> = {};
  try {
    const { reviewMap } = await import("./notes-inbox.server");
    for (const rv of (await reviewMap()).values()) {
      if (rv.status === "skipped") continue;
      const names = new Set([...(rv.partners || []), ...(rv.nextSteps || []).map((x) => (x as { partner?: string }).partner || "")].filter(Boolean));
      for (const n of names) activity[n] = (activity[n] || 0) + 1;
    }
  } catch { /* review state unavailable */ }
  return { partners, counts, activity };
}

export async function partnerDetail(name: string): Promise<{ partner: Partner | null; contacts: PartnerContact[]; activity: PartnerActivity[] }> {
  const partners = await listPartners();
  const partner = partners.find((p) => p.name.toLowerCase() === name.trim().toLowerCase()) || null;
  if (!partner) return { partner: null, contacts: [], activity: [] };
  if (!partner.summary && partner.website) {
    const prof = await describePartner(partner).catch((e) => { console.error("[partners] describe failed:", e); return null; });
    if (prof) Object.assign(partner, prof);
  }
  const { peopleDirectory, reviewMap } = await import("./notes-inbox.server");
  const { listKnowledgeRecords } = await import("./knowledge.server");
  const [people, records, reviews] = await Promise.all([peopleDirectory(), listKnowledgeRecords(), reviewMap()]);
  const contacts = people.filter((p) => matchPartner(p.company, [partner])).sort((a, b) => a.name.localeCompare(b.name));
  const activity: PartnerActivity[] = [];
  const key = partner.name.toLowerCase();
  for (const r of records) {
    const rv = reviews.get(r.recordId);
    if (!rv || rv.status === "skipped") continue;
    const tagged = (rv.partners || []).some((x) => x.toLowerCase() === key);
    const steps = (rv.nextSteps || []).filter((s) => (s as { partner?: string }).partner?.toLowerCase() === key);
    if (!tagged && !steps.length) continue;
    activity.push({
      recordId: r.recordId, date: r.date, title: r.title, summary: r.summary,
      track: rv.track || (rv.activityTracks || []).join(" / ") || (r.sourceType.startsWith("gmail-") ? "Email" : "Note"),
      source: r.sourceType.startsWith("gmail-") ? "Email" : "Note",
      url: r.sourceUrl || (r.textRef ? `https://drive.google.com/file/d/${r.textRef}/view` : ""),
      nextSteps: (steps.length ? steps : rv.nextSteps || []).map((s) => `${s.who ? `${s.who}: ` : ""}${s.action}`),
    });
  }
  activity.sort((a, b) => b.date.localeCompare(a.date));
  return { partner, contacts, activity };
}

/** Read the partner's homepage once and save a short summary + HQ location to the sheet. */
async function describePartner(p: Partner): Promise<{ summary: string; location: string } | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  let text = "";
  try {
    const res = await fetch(p.website, { headers: { "User-Agent": "Mozilla/5.0 VenturePulse" }, signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 8000);
  } catch { /* site unreachable — model falls back to what it knows */ }
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      instructions: "Describe the company in JSON. summary: 2 plain sentences on what it does and who it serves, no marketing fluff. location: headquarters as 'City, State/Country', or empty string if unknown.",
      input: `Company: ${p.name} (${p.website})\nHomepage text:\n${text || "(unavailable)"}`,
      text: { format: { type: "json_schema", name: "partner_profile", strict: true, schema: {
        type: "object", additionalProperties: false, required: ["summary", "location"],
        properties: { summary: { type: "string" }, location: { type: "string" } },
      } } },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`AI ${res.status}: ${await res.text()}`);
  let raw = "", buf = "";
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      try {
        const ev = JSON.parse(line.slice(5).trim()) as { type?: string; delta?: string };
        if (ev.type === "response.output_text.delta" && ev.delta) raw += ev.delta;
      } catch { /* [DONE] or keepalive */ }
    }
  }
  const out = JSON.parse(raw || "{}") as { summary?: string; location?: string };
  const summary = (out.summary || "").trim(), location = (out.location || "").trim();
  if (!summary) return null;
  const rows = await fetchSheetTab(TAB);
  const h = (rows[0] || []).map((x) => (x || "").trim().toLowerCase());
  const idx = rows.findIndex((r, i) => i > 0 && (r[h.indexOf("name")] || "").trim().toLowerCase() === p.name.toLowerCase());
  const si = h.indexOf("summary"), li = h.indexOf("location");
  if (idx > 0 && si >= 0 && li >= 0) {
    await updateSheetCells(TAB, [{ range: `${colLetter(si)}${idx + 1}`, value: summary }, { range: `${colLetter(li)}${idx + 1}`, value: location }]);
  }
  return { summary, location };
}

// Partners live in their own "Partners" sheet tab. Contacts are linked to a
// partner by company match at read time, so Network/Prospecting rows are never
// edited or moved — every existing and future contact is tagged automatically.

import { appendSheetRow, appendSheetRows, ensureTab, fetchSheetTab } from "./sheets.server";
import { SEED_PARTNERS, matchPartner, normalizeCategory, type Partner, type PartnerCategory } from "@/lib/partners";

const TAB = "Partners";
const HEADERS = ["Name", "Category", "Website", "Notes", "Aliases", "Created"];

export async function listPartners(): Promise<Partner[]> {
  await ensureTab(TAB, HEADERS);
  let rows = await fetchSheetTab(TAB);
  if (rows.length <= 1) {
    const now = new Date().toISOString();
    await appendSheetRows(TAB, SEED_PARTNERS.map((p) => [p.name, p.category, p.website, "", (p.aliases || []).join(", "), now]));
    return SEED_PARTNERS.map((p) => ({ ...p, notes: "", aliases: p.aliases || [] }));
  }
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
export async function partnerSummaries(): Promise<{ partners: Partner[]; counts: Record<string, number> }> {
  const [partners, { peopleDirectory }] = await Promise.all([listPartners(), import("./notes-inbox.server")]);
  const people = await peopleDirectory();
  const counts: Record<string, number> = {};
  for (const p of people) {
    const m = matchPartner(p.company, partners);
    if (m) counts[m.name] = (counts[m.name] || 0) + 1;
  }
  return { partners, counts };
}

export async function partnerDetail(name: string): Promise<{ partner: Partner | null; contacts: PartnerContact[]; activity: PartnerActivity[] }> {
  const partners = await listPartners();
  const partner = partners.find((p) => p.name.toLowerCase() === name.trim().toLowerCase()) || null;
  if (!partner) return { partner: null, contacts: [], activity: [] };
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

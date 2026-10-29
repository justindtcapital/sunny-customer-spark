import { canonicalValue, type BulkOutcome } from "@/lib/bulk-operation";
import { emailIdentities, peopleCandidates, suppliedFieldsMatch, type PersonIdentity } from "@/lib/import-dedupe";
import { contactImportRejectReason } from "@/lib/contact-noise";
import { formatEngagementSources } from "@/lib/engagement-source";
import type { EngagementSource } from "@/lib/types";
import { appendSheetRows, appendTargetRows, appendInteractionRows, appendPortcoIntroRows, ensureEventAttendanceBatch, ensureColumn, ensureTab, fetchSheetTab, TAB_NAMES, TARGET_HEADERS, type TargetRowInput } from "./sheets.server";
import type { JournalRun } from "./bulk-journal.server";

export interface ContactImportRow {
  name: string; email: string; role: string; company: string; phone: string; location: string; prime: string; sector: string;
  linkedin?: string; headline?: string; employmentHistory?: string; source?: string; followUp?: boolean;
}
export interface ContactImportInput { contacts: ContactImportRow[]; event?: string; portcos?: string[]; portcoSources?: EngagementSource[]; sourceNote?: string }
export interface TargetImportInput { targets: Omit<TargetRowInput, "dateAdded" | "lastContacted">[]; campaign?: string; event?: string; prime?: string; portcoTags?: string[]; followUp?: boolean }
interface SavedPerson extends PersonIdentity { fields: Record<string, unknown>; where: string }
const norm = (s: string) => s.trim().toLowerCase();

async function savedPeople(): Promise<SavedPerson[]> {
  // Both reads are authoritative: no demo data, no empty fallback on failure.
  const contacts = await fetchSheetTab(TAB_NAMES.contacts, true);
  await ensureTab(TAB_NAMES.targets, TARGET_HEADERS);
  const targets = await fetchSheetTab(TAB_NAMES.targets, true);
  return [contacts, targets].flatMap((rows, index) => {
    const h = (rows[0] || []).map(norm);
    return rows.slice(1).map(r => {
      const get = (...keys: string[]) => keys.map(k => r[h.indexOf(k)] || "").find(Boolean) || "";
      const name = get("name") || `${get("first name")} ${get("last name")}`.trim();
      const p = { urid: get("urid"), name, email: get("email"), company: get("company"), linkedin: get("linkedin") };
      return { ...p, where: index === 0 ? "Network" : "Prospecting", fields: { name, email: p.email, company: p.company, linkedin: p.linkedin, role: get("role","title"), phone: get("phone number","phone"), location: get("location"), prime: get("relationship prime","prime"), sector: get("industry category","sector"), headline: get("headline"), employmentHistory: get("employment history"), source: get("source"), followUp: get("follow up flag") === "TRUE", campaign: get("campaign"), event: get("event"), portcoTags: get("portco tags").split(/[,;]/).map(s => s.trim()).filter(Boolean), stage: get("stage"), researchPurpose: get("research purpose"), reasonSurfaced: get("reason surfaced") } };
    });
  });
}

function classify(input: Record<string, unknown> & PersonIdentity, saved: SavedPerson[], where: string, hasAssociations: boolean): { status: "new" | "duplicate" | "review"; reason: string } {
  const candidates = peopleCandidates(input, saved);
  if (!candidates.length) {
    if (!emailIdentities(input.email).length && !input.linkedin) return { status: "review", reason: "Missing reliable identity; review before creating a person." };
    return { status: "new", reason: "New person" };
  }
  const candidate = candidates[0];
  if (candidates.length !== 1 || !candidate) return { status: "review", reason: "Multiple matching people; no records changed." };
  if (candidate.where !== where) return { status: "review", reason: `Already in ${candidate.where}; review the existing person rather than create a second record.` };
  if (!hasAssociations && suppliedFieldsMatch(input,candidate.fields)) return { status: "duplicate", reason: "Exact existing person; no repeat writes." };
  return { status: "review", reason: "Existing person has differing fields or new tags/associations; incoming information retained for review." };
}

export async function importContactRows(input: ContactImportInput, journal: JournalRun) {
  journal.step("reading both people lists and checking duplicates");
  const saved = await savedPeople(), outcomes: BulkOutcome[] = [], accepted: { row: ContactImportRow; key: string; urid: string }[] = [];
  input.contacts.forEach((r,i) => {
    const key = String(i), previous = journal.prior.find(o => o.key === key);
    if (previous) { outcomes.push(previous); return; }
    const reject = contactImportRejectReason(r);
    if (reject) { outcomes.push({ key, label: r.name || r.email, status: "blocked", reason: reject }); return; }
    const candidate = classify(r as unknown as Record<string, unknown> & PersonIdentity, saved, "Network", Boolean(input.event || input.portcos?.length || input.sourceNote));
    if (candidate.status !== "new") { outcomes.push({ key, label: r.name, status: candidate.status, reason: candidate.reason }); return; }
    accepted.push({ row:r, key, urid:crypto.randomUUID() });
    saved.push({ ...r, where: "Network", fields: r as unknown as Record<string,unknown> });
  });
  await journal.checkpoint(outcomes);
  if (!accepted.length) return { added: 0, duplicates: outcomes.filter(o => o.status === "duplicate").length, review: outcomes.filter(o => o.status === "review").length, outcomes };
  journal.step("saving unique people with stable IDs");
  for (const h of ["urid","Source","Follow Up Flag","LinkedIn","Headline","Employment History"]) await ensureColumn(TAB_NAMES.contacts,h);
  const rows = await fetchSheetTab(TAB_NAMES.contacts,true), h = (rows[0] || []).map(norm);
  const sourceRows = accepted.map(({row:r,urid}) => {
    const f: Record<string,string> = { urid, name:r.name, "full name":r.name, email:r.email, role:r.role, title:r.role, company:r.company, organization:r.company, "phone number":r.phone, phone:r.phone, location:r.location, "relationship prime":r.prime, prime:r.prime, "industry category":r.sector, sector:r.sector, "relationship status":"Cold", "date added":new Date().toISOString().slice(0,10), source:r.source || "CSV Import", linkedin:r.linkedin || "", headline:r.headline || "", "employment history":r.employmentHistory || "", "follow up flag":r.followUp || input.event ? "TRUE" : "FALSE" };
    return h.map(k => f[k] || "");
  });
  await appendSheetRows(TAB_NAMES.contacts,sourceRows);
  const verify = await fetchSheetTab(TAB_NAMES.contacts,true), vh = (verify[0] || []).map(norm);
  if (accepted.some(a => verify.slice(1).filter(r => r[vh.indexOf("urid")] === a.urid).length !== 1)) throw new Error("Imported people could not be verified.");
  for (const a of accepted) outcomes.push({ key:a.key,label:a.row.name,status:"changed",reason:"Contact created; associations pending verification." });
  await journal.checkpoint(outcomes);
  journal.step("saving event, PortCo and source associations");
  const today = new Date().toISOString().slice(0,10);
  if (input.event) await ensureEventAttendanceBatch(accepted.map(a => ({ email:a.row.email, urid:a.urid, eventName:input.event || "", type:"attended", ensureCatalog:true })));
  if (input.portcos?.length) await appendPortcoIntroRows(accepted.flatMap(a => (input.portcos || []).map(portcoName => ({ email:a.row.email,urid:a.urid,portcoName,date:today,source:formatEngagementSources(input.portcoSources?.length ? input.portcoSources : ["direct introduction"]) }))));
  if (input.sourceNote) await appendInteractionRows(accepted.map(a => ({ email:a.row.email,urid:a.urid,date:today,summary:`Source: ${input.sourceNote}`,type:"note",requiresFollowUp:!!a.row.followUp,sourceRef:`import:${journal.id}:${a.key}:source` })));
  for (const o of outcomes) if (o.status === "changed") o.reason = "Contact and requested associations saved.";
  await journal.checkpoint(outcomes);
  return { added:accepted.length, duplicates:outcomes.filter(o => o.status === "duplicate").length, review:outcomes.filter(o => o.status === "review").length, outcomes };
}

export async function importTargetRows(input: TargetImportInput, journal: JournalRun) {
  journal.step("checking people across Network and Prospecting");
  const saved = await savedPeople(), outcomes: BulkOutcome[] = [], accepted: TargetRowInput[] = [];
  input.targets.forEach((r,i) => {
    const name = `${r.firstName} ${r.lastName}`.trim(), key = String(i);
    const previous = journal.prior.find(o => o.key === key);
    if (previous) { outcomes.push(previous); return; }
    const fields = { name, company:r.company,email:r.email,linkedin:r.linkedin,role:r.role,phone:r.phone,location:r.location,sector:r.sector,stage:r.stage,source:r.source,researchPurpose:r.researchPurpose,reasonSurfaced:r.reasonSurfaced,prime:input.prime,campaign:input.campaign,event:input.event,portcoTags:input.portcoTags,followUp:input.followUp };
    const decision = classify(fields,saved,"Prospecting",false);
    if (decision.status !== "new") { outcomes.push({ key,label:name,status:decision.status,reason:decision.reason }); return; }
    accepted.push({ ...r,prime:input.prime,campaign:input.campaign,event:input.event,portcoTags:input.portcoTags,followUp:input.followUp });
    saved.push({ name,email:r.email,company:r.company,linkedin:r.linkedin,where:"Prospecting",fields });
    outcomes.push({ key,label:name,status:"changed",reason:"Unique prospect ready to save." });
  });
  // Checkpoint only nonwrites; accepted rows are not complete until persistence.
  await journal.checkpoint(outcomes.filter(o => o.status !== "changed"));
  journal.step("saving unique prospects");
  await appendTargetRows(accepted);
  for (const o of outcomes) if (o.status === "changed") o.reason = "Prospect saved.";
  await journal.checkpoint(outcomes);
  return { added:accepted.length,duplicates:outcomes.filter(o => o.status === "duplicate").length,review:outcomes.filter(o => o.status === "review").length,outcomes };
}
// PortCo Knowledge Base — permanent store for harvested email threads, meeting
// minutes, uploaded notes and news, plus the workstream matching engine.
//
// Sources: the four tracking aliases (bd-tracking@, gtm-tracking@,
// workstreams@, news@dt-capital.net) read from the connected Gmail inbox, and
// the shared "Venture Pulse KB" Drive (GOOGLE_KB_DRIVE_ID). Everything is
// extracted once and SAVED here — Gmail/Drive are only ingestion surfaces.
//
// Tabs (all append-mostly, deduped by source id):
//   Knowledge Records   — one row per source item (thread, doc, upload, news)
//   Harvested Activities— activities extracted from records (the Activity feed)
//   Suggested Contacts  — new people found in alias mail, awaiting review
//   Workstream Links    — record ↔ workstream match, with review status
//   Harvest State       — cursor rows (last-run timestamps) per source

import {
  ensureTab,
  ensureHeaderWidth,
  fetchSheetTab,
  appendSheetRows,
  writeSheetRow,
} from "./sheets.server";
import { callGeminiJSON, isGeminiConfigured } from "./gemini.server";
import { sha256Hex } from "./sha256";

export const KNOWLEDGE_TABS = {
  records: "Knowledge Records",
  activities: "Harvested Activities",
  suggestedContacts: "Suggested Contacts",
  workstreamLinks: "Workstream Links",
  harvestState: "Harvest State",
} as const;

export const RECORD_HEADERS = [
  "Record ID", // stable: sha256(sourceType:sourceId)
  "Source Type", // gmail-bd | gmail-gtm | gmail-workstreams | gmail-news | drive-doc | upload
  "Source ID", // gmail threadId / drive fileId / upload id
  "Date", // YYYY-MM-DD
  "Title",
  "PortCo", // matched company name ("" when unmatched)
  "Participants", // "Name <email>; ..." (external only)
  "Summary", // Gemini 1-2 sentence summary
  "Extracted JSON", // structured extraction (next steps, events, intros…)
  "Text Hash", // sha256 of cleaned text (change detection)
  "Text Ref", // Drive file id of VP Archive JSON when text overflowed, else ""
  "Source URL", // gmail permalink / drive webViewLink
  "Created At",
];

export const ACTIVITY_HEADERS = [
  "Activity ID", // stable: sha256(recordId:kind:index)
  "Record ID",
  "Date",
  "Track", // BD | GTM | Workstream | News
  "Type", // intro | meeting | email | event | follow-up | update | news
  "Title",
  "PortCo",
  "Person",
  "Owner",
  "Summary",
  "Source URL",
  "Created At",
  "Resolved",
  "Resolved At",
];

export const SUGGESTED_CONTACT_HEADERS = [
  "Suggestion ID", // sha256(email)
  "Name",
  "Email",
  "Company",
  "Domain",
  "PortCo",
  "First Seen", // record title + date
  "Record ID",
  "Status", // pending | approved-network | approved-prospecting | ignored
  "Created At",
  "Reviewed At",
];

export const WORKSTREAM_LINK_HEADERS = [
  "Link ID", // sha256(recordId)
  "Record ID",
  "PortCo",
  "Workstream GID", // Asana subtask gid, or "" for create-new
  "Workstream Name",
  "Confidence", // high | medium | low
  "Status", // matched | suggested | confirmed | ignored | create-new
  "Created At",
  "Reviewed At",
];

export const HARVEST_STATE_HEADERS = ["Key", "Value", "Updated At"];

export type RecordSourceType =
  | "gmail-bd"
  | "gmail-gtm"
  | "gmail-workstreams"
  | "gmail-news"
  | "gmail-network"
  | "drive-doc"
  | "upload"
  | "granola";

export type LinkStatus = "matched" | "suggested" | "confirmed" | "ignored" | "create-new";

export interface KnowledgeRecord {
  recordId: string;
  sourceType: RecordSourceType;
  sourceId: string;
  date: string;
  title: string;
  portco: string;
  participants: string;
  summary: string;
  extractedJson: string;
  textHash: string;
  textRef: string;
  sourceUrl: string;
  createdAt: string;
}

export interface HarvestedActivity {
  resolved?: boolean;
  resolvedAt?: string;
  activityId: string;
  recordId: string;
  date: string;
  track: string;
  type: string;
  title: string;
  portco: string;
  person: string;
  owner: string;
  summary: string;
  sourceUrl: string;
  createdAt: string;
}

export interface WorkstreamLink {
  linkId: string;
  recordId: string;
  portco: string;
  workstreamGid: string;
  workstreamName: string;
  confidence: string;
  status: LinkStatus;
  createdAt: string;
  reviewedAt: string;
}

export interface SuggestedContact {
  suggestionId: string;
  name: string;
  email: string;
  company: string;
  domain: string;
  portco: string;
  firstSeen: string;
  recordId: string;
  status: string;
  createdAt: string;
  reviewedAt: string;
}

export function recordIdFor(sourceType: string, sourceId: string): string {
  return sha256Hex(`${sourceType}:${sourceId}`).slice(0, 24);
}

// ── Row mapping ──────────────────────────────────────────────

function rowsToRecords(rows: string[][]): KnowledgeRecord[] {
  return rows.slice(1).filter((r) => r[0]).map((r) => ({
    recordId: r[0], sourceType: r[1] as RecordSourceType, sourceId: r[2],
    date: r[3], title: r[4], portco: r[5], participants: r[6], summary: r[7],
    extractedJson: r[8], textHash: r[9], textRef: r[10], sourceUrl: r[11], createdAt: r[12],
  }));
}

function rowsToActivities(rows: string[][]): HarvestedActivity[] {
  return rows.slice(1).filter((r) => r[0]).map((r) => ({
    activityId: r[0], recordId: r[1], date: r[2], track: r[3], type: r[4],
    title: r[5], portco: r[6], person: r[7], owner: r[8], summary: r[9],
    sourceUrl: r[10], createdAt: r[11], resolved: r[12]?.toLowerCase() === "true", resolvedAt: r[13] || "",
  }));
}

function rowsToLinks(rows: string[][]): WorkstreamLink[] {
  return rows.slice(1).filter((r) => r[0]).map((r) => ({
    linkId: r[0], recordId: r[1], portco: r[2], workstreamGid: r[3],
    workstreamName: r[4], confidence: r[5], status: (r[6] || "suggested") as LinkStatus,
    createdAt: r[7], reviewedAt: r[8] || "",
  }));
}

function rowsToSuggested(rows: string[][]): SuggestedContact[] {
  return rows.slice(1).filter((r) => r[0]).map((r) => ({
    suggestionId: r[0], name: r[1], email: r[2], company: r[3], domain: r[4],
    portco: r[5], firstSeen: r[6], recordId: r[7], status: r[8] || "pending",
    createdAt: r[9], reviewedAt: r[10] || "",
  }));
}

// ── Public readers ───────────────────────────────────────────

export async function listKnowledgeRecords(): Promise<KnowledgeRecord[]> {
  await ensureTab(KNOWLEDGE_TABS.records, RECORD_HEADERS);
  return rowsToRecords(await fetchSheetTab(KNOWLEDGE_TABS.records));
}

export async function listHarvestedActivities(): Promise<HarvestedActivity[]> {
  await ensureTab(KNOWLEDGE_TABS.activities, ACTIVITY_HEADERS);
  return rowsToActivities(await fetchSheetTab(KNOWLEDGE_TABS.activities));
}

export async function listWorkstreamLinks(): Promise<WorkstreamLink[]> {
  await ensureTab(KNOWLEDGE_TABS.workstreamLinks, WORKSTREAM_LINK_HEADERS);
  return rowsToLinks(await fetchSheetTab(KNOWLEDGE_TABS.workstreamLinks));
}

export async function listSuggestedContacts(): Promise<SuggestedContact[]> {
  await ensureTab(KNOWLEDGE_TABS.suggestedContacts, SUGGESTED_CONTACT_HEADERS);
  return rowsToSuggested(await fetchSheetTab(KNOWLEDGE_TABS.suggestedContacts));
}

// ── Writers ──────────────────────────────────────────────────

export async function saveKnowledgeRecords(records: KnowledgeRecord[]): Promise<void> {
  if (records.length === 0) return;
  await ensureTab(KNOWLEDGE_TABS.records, RECORD_HEADERS);
  await appendSheetRows(
    KNOWLEDGE_TABS.records,
    records.map((r) => [
      r.recordId, r.sourceType, r.sourceId, r.date, r.title, r.portco, r.participants,
      r.summary, r.extractedJson, r.textHash, r.textRef, r.sourceUrl, r.createdAt,
    ]),
  );
}

export async function saveHarvestedActivities(acts: HarvestedActivity[]): Promise<void> {
  if (acts.length === 0) return;
  await ensureTab(KNOWLEDGE_TABS.activities, ACTIVITY_HEADERS);
  await appendSheetRows(
    KNOWLEDGE_TABS.activities,
    acts.map((a) => [
      a.activityId, a.recordId, a.date, a.track, a.type, a.title, a.portco, a.person,
      a.owner, a.summary, a.sourceUrl, a.createdAt,
    ]),
  );
}

export async function saveWorkstreamLinks(links: WorkstreamLink[]): Promise<void> {
  if (links.length === 0) return;
  await ensureTab(KNOWLEDGE_TABS.workstreamLinks, WORKSTREAM_LINK_HEADERS);
  await appendSheetRows(
    KNOWLEDGE_TABS.workstreamLinks,
    links.map((l) => [
      l.linkId, l.recordId, l.portco, l.workstreamGid, l.workstreamName, l.confidence,
      l.status, l.createdAt, l.reviewedAt,
    ]),
  );
}

export async function saveSuggestedContacts(contacts: SuggestedContact[]): Promise<void> {
  if (contacts.length === 0) return;
  await ensureTab(KNOWLEDGE_TABS.suggestedContacts, SUGGESTED_CONTACT_HEADERS);
  await appendSheetRows(
    KNOWLEDGE_TABS.suggestedContacts,
    contacts.map((c) => [
      c.suggestionId, c.name, c.email, c.company, c.domain, c.portco, c.firstSeen,
      c.recordId, c.status, c.createdAt, c.reviewedAt,
    ]),
  );
}

/** Update one column of a row found by id in column A. */
async function updateRowById(
  tab: string,
  headers: string[],
  id: string,
  patch: Record<string, string>,
): Promise<boolean> {
  await ensureTab(tab, headers);
  const rows = await fetchSheetTab(tab);
  const idx = rows.findIndex((r, i) => i > 0 && r[0] === id);
  if (idx === -1) return false;
  const row = [...rows[idx]!];
  while (row.length < headers.length) row.push("");
  for (const [col, val] of Object.entries(patch)) {
    const ci = headers.indexOf(col);
    if (ci !== -1) row[ci] = val;
  }
  await writeSheetRow(tab, idx + 1, row);
  return true;
}

export async function resolveHarvestedActivity(activityId: string, resolved: boolean): Promise<boolean> {
  await ensureHeaderWidth(KNOWLEDGE_TABS.activities, ACTIVITY_HEADERS);
  return updateRowById(KNOWLEDGE_TABS.activities, ACTIVITY_HEADERS, activityId, {
    Resolved: resolved ? "TRUE" : "FALSE", "Resolved At": resolved ? new Date().toISOString() : "",
  });
}

export function reviewWorkstreamLink(
  linkId: string,
  status: LinkStatus,
  workstreamGid = "",
  workstreamName = "",
  portco = "",
): Promise<boolean> {
  const patch: Record<string, string> = { Status: status, "Reviewed At": new Date().toISOString() };
  if (portco) patch.PortCo = portco;
  if (workstreamGid) patch["Workstream GID"] = workstreamGid;
  if (workstreamName) patch["Workstream Name"] = workstreamName;
  return updateRowById(KNOWLEDGE_TABS.workstreamLinks, WORKSTREAM_LINK_HEADERS, linkId, patch);
}

export function reviewSuggestedContact(suggestionId: string, status: string): Promise<boolean> {
  return updateRowById(KNOWLEDGE_TABS.suggestedContacts, SUGGESTED_CONTACT_HEADERS, suggestionId, {
    Status: status,
    "Reviewed At": new Date().toISOString(),
  });
}

// ── Harvest state (cursors) ──────────────────────────────────

export async function getHarvestState(key: string): Promise<string> {
  await ensureTab(KNOWLEDGE_TABS.harvestState, HARVEST_STATE_HEADERS);
  const rows = await fetchSheetTab(KNOWLEDGE_TABS.harvestState);
  const row = rows.find((r, i) => i > 0 && r[0] === key);
  return row?.[1] || "";
}

export async function setHarvestState(key: string, value: string): Promise<void> {
  const ok = await updateRowById(KNOWLEDGE_TABS.harvestState, HARVEST_STATE_HEADERS, key, {
    Value: value,
    "Updated At": new Date().toISOString(),
  });
  if (!ok) {
    await appendSheetRows(KNOWLEDGE_TABS.harvestState, [[key, value, new Date().toISOString()]]);
  }
}

// ── Gemini extraction ────────────────────────────────────────

export interface KnowledgeExtraction {
  portco: string;
  summary: string;
  workstreamName: string;
  workstreamConfidence: "high" | "medium" | "low";
  activities: Array<{
    type: string; // intro | meeting | email | event | follow-up | update | news
    title: string;
    person: string;
    summary: string;
  }>;
  nextSteps: Array<{ who: string; action: string; dueDate: string }>;
  people: Array<{ name: string; email: string; company: string }>;
}

const EXTRACT_SYSTEM = `You read ONE business item for a venture-capital CRM — an email thread, meeting minutes, or a document — and extract structured knowledge.

Rules:
- Use ONLY what the text states. Never invent people, companies, dates, or commitments.
- "portco": the portfolio company this is about, chosen EXACTLY from the candidate list provided, or "" if none fit.
- "workstreamName": the workstream this belongs to, chosen EXACTLY from the candidate workstream list for that company, or a short NEW name (3-6 words) if none fit, or "" if not workstream-related.
- "workstreamConfidence": "high" only when the text clearly concerns one listed workstream; "medium" for a plausible match; "low" for a guess or a new name.
- "activities": concrete things that happened (introduction made, meeting held, email exchanged, event attended, follow-up owed, status update, news). 0-5 items.
- "people": external people mentioned (not the VC's own team), with email/company when stated.
- "nextSteps": concrete future actions with owner and YYYY-MM-DD date when stated.

Output ONLY JSON:
{
  "portco": "",
  "summary": "1-2 sentences",
  "workstreamName": "",
  "workstreamConfidence": "high|medium|low",
  "activities": [{"type": "", "title": "", "person": "", "summary": ""}],
  "nextSteps": [{"who": "", "action": "", "dueDate": ""}],
  "people": [{"name": "", "email": "", "company": ""}]
}`;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function emptyExtraction(): KnowledgeExtraction {
  return { portco: "", summary: "", workstreamName: "", workstreamConfidence: "low", activities: [], nextSteps: [], people: [] };
}

/**
 * Extract knowledge from one text. Candidates ground the match: portcoNames is
 * the portfolio list; workstreams maps portco name -> workstream names.
 * Never throws — returns emptyExtraction on any failure.
 */
export async function extractKnowledge(
  text: string,
  title: string,
  portcoNames: string[],
  workstreams: Record<string, string[]>,
): Promise<KnowledgeExtraction> {
  if (!isGeminiConfigured() || !text.trim()) return emptyExtraction();
  try {
    const wsLines = Object.entries(workstreams)
      .map(([co, names]) => `${co}: ${names.join(" | ")}`)
      .join("\n");
    const user =
      `Portfolio companies (choose portco from this list only):\n${portcoNames.join(", ")}\n\n` +
      `Workstreams by company (choose workstreamName from these, or propose a short new name):\n${wsLines || "(none)"}\n\n` +
      `Title: ${title}\n\nText:\n${text.slice(0, 16000)}`;
    const res = await callGeminiJSON<Record<string, unknown>>(EXTRACT_SYSTEM, user, 1536);
    if (!res.ok || !res.data) return emptyExtraction();
    const d = res.data;
    const conf = str(d.workstreamConfidence).toLowerCase();
    return {
      portco: str(d.portco),
      summary: str(d.summary).slice(0, 600),
      workstreamName: str(d.workstreamName).slice(0, 120),
      workstreamConfidence: conf === "high" || conf === "medium" ? conf : "low",
      activities: arr(d.activities).slice(0, 5).map((a) => {
        const o = obj(a);
        return { type: str(o.type) || "email", title: str(o.title).slice(0, 140), person: str(o.person), summary: str(o.summary).slice(0, 400) };
      }),
      nextSteps: arr(d.nextSteps).slice(0, 8).map((n) => {
        const o = obj(n);
        return { who: str(o.who), action: str(o.action).slice(0, 300), dueDate: str(o.dueDate) };
      }),
      people: arr(d.people).slice(0, 25).map((p) => {
        const o = obj(p);
        return { name: str(o.name), email: str(o.email).toLowerCase(), company: str(o.company) };
      }).filter((p) => p.name || p.email),
    };
  } catch {
    return emptyExtraction();
  }
}

/** Ensure the header schema of every knowledge tab exists. */
export async function ensureKnowledgeTabs(): Promise<void> {
  await ensureTab(KNOWLEDGE_TABS.records, RECORD_HEADERS);
  await ensureHeaderWidth(KNOWLEDGE_TABS.records, RECORD_HEADERS);
  await ensureTab(KNOWLEDGE_TABS.activities, ACTIVITY_HEADERS);
  await ensureTab(KNOWLEDGE_TABS.suggestedContacts, SUGGESTED_CONTACT_HEADERS);
  await ensureTab(KNOWLEDGE_TABS.workstreamLinks, WORKSTREAM_LINK_HEADERS);
  await ensureTab(KNOWLEDGE_TABS.harvestState, HARVEST_STATE_HEADERS);
}

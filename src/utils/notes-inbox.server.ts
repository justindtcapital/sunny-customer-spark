// Notes Imports inbox — every imported note (Granola, upload, Drive, workstream
// emails with a suggested link) stays "pending" until a person reviews it.
// Review state lives in the Harvest State tab under `review:<recordId>` so the
// existing knowledge tabs keep their columns.

import { fetchSheetTab } from "./sheets.server";
import {
  KNOWLEDGE_TABS,
  listKnowledgeRecords,
  listSuggestedContacts,
  listWorkstreamLinks,
  reviewSuggestedContact,
  reviewWorkstreamLink,
  saveHarvestedActivities,
  setHarvestState,
  type KnowledgeRecord,
} from "./knowledge.server";
import { sha256Hex } from "./sha256";

const REVIEW_PREFIX = "review:";
const NOTE_SOURCES = new Set(["granola", "upload", "drive-doc"]);

export interface NoteReview {
  reviewedAt: string;
  reviewedBy: string;
  workstream: string;
  contactsAdded: number;
  followUps: number;
}

export interface NoteInboxItem {
  recordId: string;
  source: "Granola" | "Upload" | "Drive" | "Email";
  title: string;
  date: string;
  portco: string;
  summary: string;
  sourceUrl: string;
  driveUrl: string;
  saved: boolean;
  copiedToDrive: boolean;
  hasTranscript: boolean;
  safeToDelete: boolean;
  link: { linkId: string; workstreamGid: string; workstreamName: string; status: string; confidence: string } | null;
  nextSteps: Array<{ who: string; action: string; dueDate: string }>;
  people: Array<{ suggestionId: string; name: string; email: string; company: string; status: string }>;
  review: NoteReview | null;
}

/** Pure: is this record pending (not reviewed)? Exported for tests. */
export function isPendingNote(recordId: string, reviews: Map<string, NoteReview>): boolean {
  return !reviews.has(recordId);
}

async function reviewMap(): Promise<Map<string, NoteReview>> {
  const m = new Map<string, NoteReview>();
  try {
    const rows = await fetchSheetTab(KNOWLEDGE_TABS.harvestState);
    for (const r of rows.slice(1)) {
      if (!r[0]?.startsWith(REVIEW_PREFIX)) continue;
      try { m.set(r[0].slice(REVIEW_PREFIX.length), JSON.parse(r[1] || "{}")); } catch { /* skip */ }
    }
  } catch { /* none */ }
  return m;
}

function sourceLabel(r: KnowledgeRecord): NoteInboxItem["source"] {
  return r.sourceType === "granola" ? "Granola" : r.sourceType === "upload" ? "Upload" : r.sourceType === "drive-doc" ? "Drive" : "Email";
}

export async function listNotesInbox(history: boolean): Promise<NoteInboxItem[]> {
  const [records, links, contacts, reviews] = await Promise.all([
    listKnowledgeRecords(), listWorkstreamLinks(), listSuggestedContacts(), reviewMap(),
  ]);
  const { listGranolaImports } = await import("./granola.server");
  const granola = new Map((await listGranolaImports().catch(() => [])).map((g) => [g.noteId, g]));
  const linkBy = new Map(links.map((l) => [l.recordId, l]));
  const out: NoteInboxItem[] = [];
  for (const r of records) {
    const link = linkBy.get(r.recordId);
    if (!NOTE_SOURCES.has(r.sourceType) && !link) continue;
    const review = reviews.get(r.recordId) || null;
    if (history ? !review : !!review) continue;
    let ex: { nextSteps?: NoteInboxItem["nextSteps"]; granola?: { hasTranscript?: boolean } } = {};
    try { ex = JSON.parse(r.extractedJson || "{}"); } catch { /* ignore */ }
    const g = r.sourceType === "granola" ? granola.get(r.sourceId) : undefined;
    const driveUrl = r.textRef ? `https://drive.google.com/file/d/${r.textRef}/view` : "";
    out.push({
      recordId: r.recordId, source: sourceLabel(r), title: r.title, date: r.date, portco: r.portco,
      summary: r.summary, sourceUrl: r.sourceUrl, driveUrl,
      saved: true, copiedToDrive: !!r.textRef, hasTranscript: !!ex.granola?.hasTranscript,
      safeToDelete: g ? g.safeToDelete : !!r.textRef,
      link: link ? { linkId: link.linkId, workstreamGid: link.workstreamGid, workstreamName: link.workstreamName, status: link.status, confidence: link.confidence } : null,
      nextSteps: (ex.nextSteps || []).filter((n) => n.action),
      people: contacts.filter((c) => c.recordId === r.recordId).map((c) => ({ suggestionId: c.suggestionId, name: c.name, email: c.email, company: c.company, status: c.status })),
      review,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export interface ReviewNoteInput {
  recordId: string;
  reviewer: string;
  workstream?: { action: "confirm" | "ignore"; gid?: string; name?: string };
  addContacts: string[];
  skipContacts: string[];
  followUps: Array<{ action: string; who: string; dueDate: string }>;
}

export async function reviewNote(input: ReviewNoteInput): Promise<NoteReview> {
  const records = await listKnowledgeRecords();
  const r = records.find((x) => x.recordId === input.recordId);
  if (!r) throw new Error("Note not found");
  const links = await listWorkstreamLinks();
  const link = links.find((l) => l.recordId === r.recordId);
  let wsLabel = "";
  if (link && input.workstream) {
    const status = input.workstream.action === "confirm" ? "confirmed" : "ignored";
    await reviewWorkstreamLink(link.linkId, status, input.workstream.gid || "", input.workstream.name || "");
    wsLabel = status === "confirmed" ? input.workstream.name || link.workstreamName : "Ignored";
  }

  const contacts = (await listSuggestedContacts()).filter((c) => c.recordId === r.recordId);
  let added = 0;
  if (input.addContacts.length) {
    const { addContactRow } = await import("./sheets.server");
    for (const c of contacts.filter((x) => input.addContacts.includes(x.suggestionId))) {
      try {
        await addContactRow({
          name: c.name || c.email, role: "", company: c.company, email: c.email, phone: "", location: "",
          prime: input.reviewer, sector: "", temperature: "Cold", source: "Meeting Notes",
          sourceContext: r.title,
        } as Parameters<typeof addContactRow>[0]);
        await reviewSuggestedContact(c.suggestionId, "approved-network");
        added++;
      } catch (e) {
        console.error("[notes-inbox] add contact failed:", e);
      }
    }
  }
  for (const id of input.skipContacts) await reviewSuggestedContact(id, "ignored");

  const now = new Date().toISOString();
  if (input.followUps.length) {
    await saveHarvestedActivities(input.followUps.map((f, i) => ({
      activityId: sha256Hex(`${r.recordId}:followup:${f.action}:${i}`).slice(0, 24),
      recordId: r.recordId, date: f.dueDate || now.slice(0, 10), track: "Follow-up", type: "follow-up",
      title: f.action.slice(0, 140), portco: r.portco, person: f.who, owner: input.reviewer,
      summary: `Follow-up from "${r.title}"${f.dueDate ? ` — due ${f.dueDate}` : ""}`, sourceUrl: r.sourceUrl, createdAt: now,
    })));
  }

  const review: NoteReview = {
    reviewedAt: now, reviewedBy: input.reviewer, workstream: wsLabel,
    contactsAdded: added, followUps: input.followUps.length,
  };
  await setHarvestState(`${REVIEW_PREFIX}${r.recordId}`, JSON.stringify(review));
  return review;
}

export async function reopenNote(recordId: string): Promise<void> {
  const { deleteSheetRows } = await import("./sheets.server");
  const rows = await fetchSheetTab(KNOWLEDGE_TABS.harvestState);
  const idx = rows.findIndex((row, i) => i > 0 && row[0] === `${REVIEW_PREFIX}${recordId}`);
  if (idx > 0) await deleteSheetRows(KNOWLEDGE_TABS.harvestState, [idx + 1]);
}

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

export interface NotePerson {
  key: string;
  suggestionId: string;
  name: string;
  email: string;
  company: string;
  /** Where this person already lives, or "New". */
  where: "Network" | "Prospecting" | "New";
  status: string;
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
  people: NotePerson[];
  review: NoteReview | null;
}

/** Pure: is this record pending (not reviewed)? Exported for tests. */
export function isPendingNote(recordId: string, reviews: Map<string, NoteReview>): boolean {
  return !reviews.has(recordId);
}

/** Lowercased emails + names already in Contacts (Network) and Targets (Prospecting). */
async function directory(): Promise<{ network: Set<string>; prospects: Set<string> }> {
  const build = async (tab: string) => {
    const set = new Set<string>();
    try {
      const rows = await fetchSheetTab(tab);
      for (const row of rows.slice(1)) for (const c of row) {
        const v = (c || "").trim().toLowerCase();
        if (!v || v.length > 200) continue;
        set.add(v);
        for (const m of v.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []) set.add(m);
      }
    } catch { /* missing tab */ }
    return set;
  };
  const [network, prospects] = await Promise.all([build("Contacts"), build("Targets")]);
  return { network, prospects };
}

function parseParticipants(s: string): Array<{ name: string; email: string }> {
  return (s || "").split(";").map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^(.*?)\s*<([^>]+)>$/);
    return m ? { name: m[1]!.trim(), email: m[2]!.trim().toLowerCase() } : p.includes("@") ? { name: "", email: p.toLowerCase() } : { name: p, email: "" };
  });
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

/** Who manually imported each record (stamped at import time; email harvest is unstamped). */
async function importedByMap(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  try {
    const rows = await fetchSheetTab(KNOWLEDGE_TABS.harvestState);
    for (const r of rows.slice(1)) {
      if (r[0]?.startsWith("importedBy:")) m.set(r[0].slice("importedBy:".length), (r[1] || "").toLowerCase());
    }
  } catch { /* none */ }
  return m;
}

function sourceLabel(r: KnowledgeRecord): NoteInboxItem["source"] {
  return r.sourceType === "granola" ? "Granola" : r.sourceType === "upload" ? "Upload" : r.sourceType === "drive-doc" ? "Drive" : "Email";
}

export async function listNotesInbox(history: boolean, owner?: string): Promise<NoteInboxItem[]> {
  const [records, links, contacts, reviews, dir, importers] = await Promise.all([
    listKnowledgeRecords(), listWorkstreamLinks(), listSuggestedContacts(), reviewMap(), directory(), importedByMap(),
  ]);
  const ownerKey = (owner || "").trim().toLowerCase();
  const whereOf = (email: string, name: string): NotePerson["where"] => {
    const keys = [email, name.toLowerCase()].filter(Boolean);
    if (keys.some((k) => dir.network.has(k))) return "Network";
    if (keys.some((k) => dir.prospects.has(k))) return "Prospecting";
    return "New";
  };
  const { listGranolaImports } = await import("./granola.server");
  const granola = new Map((await listGranolaImports().catch(() => [])).map((g) => [g.noteId, g]));
  const linkBy = new Map(links.map((l) => [l.recordId, l]));
  const out: NoteInboxItem[] = [];
  for (const r of records) {
    const link = linkBy.get(r.recordId);
    if (!NOTE_SOURCES.has(r.sourceType) && !link) continue;
    const review = reviews.get(r.recordId) || null;
    if (history ? !review : !!review) continue;
    // When an action owner is selected, only notes that person imported.
    if (ownerKey && importers.get(r.recordId) !== ownerKey) continue;
    let ex: { nextSteps?: NoteInboxItem["nextSteps"]; people?: Array<{ name: string; email: string; company: string }>; granola?: { hasTranscript?: boolean } } = {};
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
      people: (() => {
        const map = new Map<string, NotePerson>();
        const put = (name: string, email: string, company: string, suggestionId = "", status = "") => {
          const key = (email || name).toLowerCase();
          if (!key) return;
          const prev = map.get(key);
          map.set(key, {
            key, suggestionId: suggestionId || prev?.suggestionId || "", name: name || prev?.name || "",
            email: email || prev?.email || "", company: company || prev?.company || "",
            where: whereOf(email || prev?.email || "", name || prev?.name || ""), status: status || prev?.status || "",
          });
        };
        for (const p of parseParticipants(r.participants)) put(p.name, p.email, "");
        for (const p of ex.people || []) put(p.name, (p.email || "").toLowerCase(), p.company);
        for (const c of contacts.filter((c) => c.recordId === r.recordId)) put(c.name, c.email, c.company, c.suggestionId, c.status);
        return [...map.values()];
      })(),
      review,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export interface ReviewNoteInput {
  recordId: string;
  reviewer: string;
  portco: string;
  workstream?: { action: "confirm" | "ignore" | "create"; gid?: string; name?: string; segment?: "GTM" | "BD" };
  addPeople: Array<{ name: string; email: string; company: string; suggestionId?: string }>;
  skipContacts: string[];
  followUps: Array<{ action: string; who: string; dueDate: string }>;
}

export async function reviewNote(input: ReviewNoteInput): Promise<NoteReview> {
  const records = await listKnowledgeRecords();
  const r = records.find((x) => x.recordId === input.recordId);
  if (!r) throw new Error("Note not found");
  const portco = (input.portco || "").trim();
  if (portco !== r.portco) await retagPortco(r.recordId, portco);

  const links = await listWorkstreamLinks();
  const link = links.find((l) => l.recordId === r.recordId);
  let wsLabel = "";
  const ws = input.workstream;
  if (ws) {
    let gid = ws.gid || "";
    let name = ws.name || "";
    if (ws.action === "create") {
      if (!portco) throw new Error("Pick a PortCo before creating a workstream");
      const { createWorkstream } = await import("./asana.server");
      const created = await createWorkstream({ company: portco, segment: ws.segment || "GTM", name });
      gid = created.gid;
      name = created.name;
    }
    const status = ws.action === "ignore" ? "ignored" : "confirmed";
    if (link) {
      await reviewWorkstreamLink(link.linkId, status, gid, name, portco);
    } else if (status === "confirmed") {
      const { saveWorkstreamLinks } = await import("./knowledge.server");
      await saveWorkstreamLinks([{
        linkId: r.recordId, recordId: r.recordId, portco, workstreamGid: gid, workstreamName: name,
        confidence: "high", status: "confirmed", createdAt: new Date().toISOString(), reviewedAt: new Date().toISOString(),
      }]);
    }
    wsLabel = status === "confirmed" ? name : "Ignored";
  }

  let added = 0;
  if (input.addPeople.length) {
    const { addContactRow } = await import("./sheets.server");
    for (const c of input.addPeople) {
      try {
        await addContactRow({
          name: c.name || c.email, role: "", company: c.company, email: c.email, phone: "", location: "",
          prime: input.reviewer, sector: "", temperature: "Cold", source: "Meeting Notes",
          sourceContext: r.title,
        } as Parameters<typeof addContactRow>[0]);
        if (c.suggestionId) await reviewSuggestedContact(c.suggestionId, "approved-network");
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

/** Change a note's PortCo on its record and its harvested activities. */
async function retagPortco(recordId: string, portco: string): Promise<void> {
  const { writeSheetRow } = await import("./sheets.server");
  for (const [tab, idCol, coCol] of [[KNOWLEDGE_TABS.records, 0, 5], [KNOWLEDGE_TABS.activities, 1, 6]] as const) {
    const rows = await fetchSheetTab(tab);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]![idCol] !== recordId) continue;
      const row = [...rows[i]!];
      while (row.length <= coCol) row.push("");
      row[coCol] = portco;
      await writeSheetRow(tab, i + 1, row);
    }
  }
}

export async function reopenNote(recordId: string): Promise<void> {
  const { deleteSheetRows } = await import("./sheets.server");
  const rows = await fetchSheetTab(KNOWLEDGE_TABS.harvestState);
  const idx = rows.findIndex((row, i) => i > 0 && row[0] === `${REVIEW_PREFIX}${recordId}`);
  if (idx > 0) await deleteSheetRows(KNOWLEDGE_TABS.harvestState, [idx + 1]);
}

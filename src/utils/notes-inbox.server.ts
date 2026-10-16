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
import { isNetworkTitle, matchesQuery, personInText } from "@/lib/network-notes";
import { suggestPeople } from "@/lib/meeting-roster";
import { teamMemberFor } from "@/lib/user-ownership";

const REVIEW_PREFIX = "review:";
const NOTE_SOURCES = new Set(["granola", "upload", "drive-doc"]);

export interface NoteReview {
  reviewedAt: string;
  reviewedBy: string;
  workstream: string;
  contactsAdded: number;
  followUps: number;
  /** Activity Review only: confirmed registers the email as activity; skipped keeps it out. */
  status?: "confirmed" | "skipped";
  track?: string;
  /** Lowercased emails of contacts this note was tagged to. */
  contacts?: string[];
  /** Drive folder the file was moved into on review. */
  filedTo?: string;
  /** Next steps with the person each was assigned to on review (informational, not follow-ups). */
  nextSteps?: Array<{ who: string; whoEmail?: string; action: string; dueDate: string; portco?: string }>;
  /** Investor the note was filed under (Investor Updates/<name>). */
  investor?: string;
  /** Notes: BD and/or GTM activity tracks chosen on review. */
  activityTracks?: string[];
}

export type InboxKind = "notes" | "activity";
export const ACTIVITY_TRACKS = ["BD", "GTM", "Workstream", "Network", "News"] as const;

/** Pure: does a harvested activity count as registered Venture Pulse activity? */
export function isRegisteredActivity(sourceType: string, review: NoteReview | undefined | null): boolean {
  if (!sourceType.startsWith("gmail-")) return true; // Asana archive, notes, uploads, follow-ups
  return !!review && review.status !== "skipped";
}

export interface NotePerson {
  key: string;
  suggestionId: string;
  name: string;
  email: string;
  company: string;
  /** Where this person already lives, or "New". */
  where: "Network" | "Prospecting" | "New" | "Team";
  status: string;
  /** Likely CRM contacts for first-name-only or unrecognized people. */
  suggestions: PersonMatch[];
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
  /** Activity Review: current track (BD/GTM/Workstream/News). */
  track: string;
  /** Original author / sender / uploader stamped on ingest. */
  author: string;
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

export async function reviewMap(): Promise<Map<string, NoteReview>> {
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
      if (r[0]?.startsWith("importedBy:")) m.set(r[0].slice("importedBy:".length), r[1] || "");
    }
  } catch { /* none */ }
  return m;
}

function sourceLabel(r: KnowledgeRecord): NoteInboxItem["source"] {
  return r.sourceType === "granola" ? "Granola" : r.sourceType === "upload" ? "Upload" : r.sourceType === "drive-doc" ? "Drive" : "Email";
}

export async function listNotesInbox(history: boolean, owner?: string, kind: InboxKind = "notes"): Promise<NoteInboxItem[]> {
  const [records, links, contacts, reviews, dir, importers] = await Promise.all([
    listKnowledgeRecords(), listWorkstreamLinks(), listSuggestedContacts(), reviewMap(), directory(), importedByMap(),
  ]);
  const people = await peopleDirectory();
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
  const actsBy = new Map<string, { owners: string[]; track: string }>();
  // Granola is connected through Chris Falloon's account, so unstamped Granola notes are his.
  const GRANOLA_OWNER = "chris falloon";
  if (kind === "activity") {
    const { listHarvestedActivities } = await import("./knowledge.server");
    for (const a of await listHarvestedActivities().catch(() => [])) {
      const e = actsBy.get(a.recordId) || { owners: [], track: "" };
      e.owners.push(a.owner, a.person, a.summary);
      if (!e.track && a.type !== "follow-up") e.track = a.track;
      actsBy.set(a.recordId, e);
    }
  }
  const trackOf = (r: KnowledgeRecord) =>
    (r.sourceType === "gmail-network" || isNetworkTitle(r.title) ? "Network" : "") ||
    actsBy.get(r.recordId)?.track || ({ "gmail-bd": "BD", "gmail-gtm": "GTM", "gmail-workstreams": "Workstream", "gmail-news": "News" } as Record<string, string>)[r.sourceType] || "";
  const out: NoteInboxItem[] = [];
  for (const r of records) {
    const link = linkBy.get(r.recordId);
    const isEmail = r.sourceType.startsWith("gmail-");
    if (kind === "activity" ? !isEmail : !NOTE_SOURCES.has(r.sourceType)) continue;
    const review = reviews.get(r.recordId) || null;
    if (history ? !review : !!review) continue;
    // When an action owner is selected, only notes that person imported.
    if (ownerKey) {
      const { ownerMatches } = await import("@/lib/action-owners");
      // Recorded author first; legacy unstamped emails fall back to name matching.
      const who = importers.get(r.recordId) || (kind === "activity"
        ? [...(actsBy.get(r.recordId)?.owners || []), r.participants, r.summary].join(" ")
        : r.sourceType === "granola" ? GRANOLA_OWNER : "");
      if (!ownerMatches(who, owner || "")) continue;
    }
    let ex: { nextSteps?: NoteInboxItem["nextSteps"]; people?: Array<{ name: string; email: string; company: string }>; granola?: { hasTranscript?: boolean } } = {};
    try { ex = JSON.parse(r.extractedJson || "{}"); } catch { /* ignore */ }
    const g = r.sourceType === "granola" ? granola.get(r.sourceId) : undefined;
    const driveUrl = r.textRef ? `https://drive.google.com/file/d/${r.textRef}/view` : "";
    out.push({
      recordId: r.recordId, source: sourceLabel(r), author: importers.get(r.recordId) || (r.sourceType === "granola" ? "Chris Falloon" : ""), title: r.title, date: r.date, portco: r.portco,
      summary: r.summary, sourceUrl: r.sourceUrl, driveUrl,
      saved: true, copiedToDrive: !!r.textRef, hasTranscript: !!ex.granola?.hasTranscript,
      safeToDelete: g ? g.safeToDelete : !!r.textRef,
      link: link ? { linkId: link.linkId, workstreamGid: link.workstreamGid, workstreamName: link.workstreamName, status: link.status, confidence: link.confidence } : null,
      nextSteps: (ex.nextSteps || []).filter((n) => n.action),
      people: (() => {
        const map = new Map<string, NotePerson>();
        const put = (name: string, email: string, company: string, suggestionId = "", status = "") => {
          // Teammates collapse to one person whichever address or name was used.
          const tm = teamMemberFor(email) || teamMemberFor(name);
          if (tm) {
            map.set(tm.email, { key: tm.email, suggestionId: "", name: tm.displayName, email: tm.email, company: "DT Capital", where: "Team", status: "", suggestions: [] });
            return;
          }
          const key = (email || name).toLowerCase();
          if (!key) return;
          const prev = map.get(key);
          map.set(key, {
            key, suggestionId: suggestionId || prev?.suggestionId || "", name: name || prev?.name || "",
            email: email || prev?.email || "", company: company || prev?.company || "",
            where: whereOf(email || prev?.email || "", name || prev?.name || ""), status: status || prev?.status || "",
            suggestions: [],
          });
        };
        for (const p of parseParticipants(r.participants)) put(p.name, p.email, "");
        for (const p of ex.people || []) put(p.name, (p.email || "").toLowerCase(), p.company);
        for (const c of contacts.filter((c) => c.recordId === r.recordId)) put(c.name, c.email, c.company, c.suggestionId, c.status);
        // Names only heard in next steps ("Brent to send contract") join the roster too.
        const known = [...map.values()].map((p) => p.name.toLowerCase());
        for (const n of ex.nextSteps || []) {
          const who = (n.who || "").replace(/\(.*?\)/g, "").trim();
          if (who && !known.some((k) => k === who.toLowerCase() || k.split(" ")[0] === who.toLowerCase())) { put(who, "", ""); known.push(who.toLowerCase()); }
        }
        const hints = [r.portco, ...[...map.values()].map((p) => p.company), ...[...map.values()].map((p) => p.email.split("@")[1] || "")].filter(Boolean);
        for (const p of map.values()) if (p.where === "New") p.suggestions = suggestPeople(p, people, hints) as PersonMatch[];
        return [...map.values()];
      })(),
      review,
      track: review?.track || trackOf(r),
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
  followUps: Array<{ action: string; who: string; dueDate: string; portco?: string }>;
  status?: "confirmed" | "skipped";
  track?: string;
  /** Network/Prospecting people this note is tagged to; each gets a trail entry on confirm. */
  linkContacts?: Array<{ name: string; email: string; company: string; where: string }>;
  /** Where to file the Drive copy on confirm (default: PortCo, or Network Updates for NWK). */
  folder?: "portco" | "operations" | "network" | "investor";
  /** Investor name when folder is "investor" — filed to Investor Updates/<investor>. */
  investor?: string;
  /** All next steps with their assigned person; only followUps become tracked follow-ups. */
  nextSteps?: Array<{ who: string; whoEmail?: string; action: string; dueDate: string; portco?: string }>;
  /** Notes: BD and/or GTM activity tracks chosen on review. */
  activityTracks?: string[];
}

export interface PersonMatch { name: string; email: string; company: string; where: "Network" | "Prospecting" }

/** Read people (name/email/company) from the Contacts and Targets tabs by header name. */
async function peopleDirectory(): Promise<PersonMatch[]> {
  const out: PersonMatch[] = [];
  for (const [tab, where] of [["Contacts", "Network"], ["Targets", "Prospecting"]] as const) {
    try {
      const rows = await fetchSheetTab(tab);
      const h = (rows[0] || []).map((x) => (x || "").trim().toLowerCase());
      const col = (re: RegExp) => h.findIndex((x) => re.test(x));
      const n = col(/^(full )?name$|^contact name$/), e = col(/e-?mail/), c = col(/^company|organization|employer/);
      const first = col(/^first name$/), last = col(/^last name$/);
      for (const r of rows.slice(1)) {
        const name = (n >= 0 ? r[n] : [first >= 0 ? r[first] : "", last >= 0 ? r[last] : ""].join(" ")) || "";
        const email = (e >= 0 ? r[e] : "") || "";
        if (!name.trim() && !email.trim()) continue;
        out.push({ name: name.trim(), email: email.trim().toLowerCase(), company: ((c >= 0 ? r[c] : "") || "").trim(), where });
      }
    } catch { /* missing tab */ }
  }
  return out;
}

/** Contact search for the review cards. */
export async function searchPeople(q: string): Promise<PersonMatch[]> {
  if (q.trim().length < 2) return [];
  const all = await peopleDirectory();
  return all.filter((p) => matchesQuery(q, [p.name, p.email, p.company])).slice(0, 12);
}

export interface PersonContextItem {
  recordId: string; date: string; title: string; source: string; track: string;
  summary: string; portco: string; sourceUrl: string; workstream: string; workstreamStatus: string; reviewed: boolean;
}

/** Notes, emails and workstream links that mention or were tagged to this person. */
export async function personContext(person: { name?: string; email?: string }): Promise<PersonContextItem[]> {
  const [records, links, reviews] = await Promise.all([listKnowledgeRecords(), listWorkstreamLinks(), reviewMap()]);
  const linkBy = new Map(links.map((l) => [l.recordId, l]));
  const email = (person.email || "").toLowerCase();
  const out: PersonContextItem[] = [];
  for (const r of records) {
    const rv = reviews.get(r.recordId);
    if (rv?.status === "skipped") continue;
    const tagged = !!email && (rv?.contacts || []).includes(email);
    if (!tagged && !personInText(person, `${r.participants} ${r.extractedJson}`)) continue;
    const l = linkBy.get(r.recordId);
    const ws = l && l.status !== "ignored" ? l : null;
    out.push({
      recordId: r.recordId, date: r.date, title: r.title, source: sourceLabel(r),
      track: rv?.track || (r.sourceType === "gmail-network" || isNetworkTitle(r.title) ? "Network" : ({ "gmail-bd": "BD", "gmail-gtm": "GTM", "gmail-workstreams": "Workstream", "gmail-news": "News" } as Record<string, string>)[r.sourceType] || "Note"),
      summary: r.summary, portco: r.portco, sourceUrl: r.sourceUrl || (r.textRef ? `https://drive.google.com/file/d/${r.textRef}/view` : ""),
      workstream: ws?.workstreamName || "", workstreamStatus: ws?.status || "", reviewed: !!rv,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50);
}

export async function reviewNote(input: ReviewNoteInput): Promise<NoteReview> {
  const records = await listKnowledgeRecords();
  const r = records.find((x) => x.recordId === input.recordId);
  if (!r) throw new Error("Note not found");
  const portco = (input.portco || "").trim();
  if (portco !== r.portco) await retagPortco(r.recordId, portco);
  if (input.track) await retagTrack(r.recordId, input.track);

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
      const created = await createWorkstream({ company: portco.split(",")[0]!.trim(), segment: ws.segment || "GTM", name });
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
      title: f.action.slice(0, 140), portco: f.portco || r.portco, person: f.who, owner: input.reviewer,
      summary: `Follow-up from "${r.title}"${f.dueDate ? ` — due ${f.dueDate}` : ""}`, sourceUrl: r.sourceUrl, createdAt: now,
    })));
  }

  // Promote the note into each tagged contact's Interaction Trail (idempotent by source ref).
  const tagged = new Map<string, string>();
  if (input.status !== "skipped") {
    for (const c of [...(input.linkContacts || []), ...input.addPeople]) {
      const e = (c.email || "").trim().toLowerCase();
      if (e.includes("@")) tagged.set(e, c.name);
    }
  }
  if (tagged.size) {
    const { appendInteractionRows } = await import("./sheets.server");
    const sourceRef = `kb:${r.recordId}`;
    const existing = new Set<string>();
    try {
      const rows = await fetchSheetTab("Notes");
      const h = (rows[0] || []).map((x) => (x || "").trim().toLowerCase());
      const ei = h.indexOf("contact email"), si = h.indexOf("source ref");
      if (ei >= 0 && si >= 0) for (const row of rows.slice(1)) if (row[si] === sourceRef) existing.add((row[ei] || "").toLowerCase());
    } catch { /* tab missing */ }
    const isNwk = (input.track || "") === "Network" || r.sourceType === "gmail-network" || isNetworkTitle(r.title);
    const allSteps = input.nextSteps?.length ? input.nextSteps : input.followUps;
    const steps = allSteps.map((f) => `• ${f.who ? `${f.who}: ` : ""}${f.action}${f.dueDate ? ` (due ${f.dueDate})` : ""}`).join("\n");
    const due = input.followUps.map((f) => f.dueDate).filter(Boolean).sort()[0] || "";
    const summary = `${isNwk ? "[NWK] " : ""}${r.title}${r.summary ? ` — ${r.summary}` : ""}${steps ? `\nNext steps:\n${steps}` : ""}`.slice(0, 4000);
    await appendInteractionRows([...tagged.keys()].filter((e) => !existing.has(e)).map((email) => ({
      email, date: r.date || now.slice(0, 10), summary,
      type: (r.sourceType.startsWith("gmail-") ? "email" : "meeting") as Parameters<typeof appendInteractionRows>[0][number]["type"],
      requiresFollowUp: !!due, followUpDue: due || undefined, owner: input.reviewer, sourceRef,
    })));
  }

  // File the Drive copy out of Unfiled Documents. Author/owner/history stay on the file.
  let filedTo = "";
  const kb = process.env.GOOGLE_KB_DRIVE_ID;
  if (kb && r.textRef && input.status !== "skipped") {
    const isNwk = input.track === "Network" || r.sourceType === "gmail-network" || isNetworkTitle(r.title);
    const dest = input.folder || (isNwk ? "network" : "portco");
    const primary = portco.split(",")[0]!.trim();
    const investor = (input.investor || "").trim();
    try {
      const { findOrCreateFolder } = await import("./granola.server");
      const { moveDriveFile } = await import("./drive-notes.server");
      let folderId = "";
      if (dest === "network") { folderId = await findOrCreateFolder("Network Updates", kb, kb); filedTo = "Network Updates"; }
      else if (dest === "operations") { folderId = await findOrCreateFolder("PortCo Operations", kb, kb); filedTo = "PortCo Operations"; }
      else if (dest === "investor" && investor) {
        folderId = await findOrCreateFolder(investor, await findOrCreateFolder("Investor Updates", kb, kb), kb);
        filedTo = `Investor Updates/${investor}`;
      }
      else if (primary) {
        folderId = await findOrCreateFolder(primary, await findOrCreateFolder("Meeting Notes", kb, kb), kb);
        filedTo = `Meeting Notes/${primary}`;
      }
      if (folderId) await moveDriveFile(r.textRef, folderId);
    } catch (e) {
      console.error("[notes-inbox] file move failed:", e);
      filedTo = "";
    }
  }

  const review: NoteReview = {
    ...(filedTo ? { filedTo } : {}),
    reviewedAt: now, reviewedBy: input.reviewer, workstream: wsLabel,
    contactsAdded: added, followUps: input.followUps.length,
    ...(input.status ? { status: input.status } : {}),
    ...(input.track ? { track: input.track } : {}),
    ...(tagged.size ? { contacts: [...tagged.keys()] } : {}),
    ...(input.nextSteps?.length && input.status !== "skipped" ? { nextSteps: input.nextSteps } : {}),
    ...(input.investor?.trim() && input.status !== "skipped" ? { investor: input.investor.trim() } : {}),
    ...(input.activityTracks?.length && input.status !== "skipped" ? { activityTracks: input.activityTracks } : {}),
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

/** Change the Track on an email's harvested activities (follow-ups keep theirs). */
async function retagTrack(recordId: string, track: string): Promise<void> {
  const { writeSheetRow } = await import("./sheets.server");
  const rows = await fetchSheetTab(KNOWLEDGE_TABS.activities);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (row[1] !== recordId || row[3] === track || row[4] === "follow-up") continue;
    const next = [...row];
    next[3] = track;
    await writeSheetRow(KNOWLEDGE_TABS.activities, i + 1, next);
  }
}

export async function reopenNote(recordId: string): Promise<void> {
  const { deleteSheetRows } = await import("./sheets.server");
  const rows = await fetchSheetTab(KNOWLEDGE_TABS.harvestState);
  const idx = rows.findIndex((row, i) => i > 0 && row[0] === `${REVIEW_PREFIX}${recordId}`);
  if (idx > 0) await deleteSheetRows(KNOWLEDGE_TABS.harvestState, [idx + 1]);
}

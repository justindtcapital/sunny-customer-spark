// Knowledge harvester — pulls the four tracking aliases (bd-tracking@,
// gtm-tracking@, workstreams@, news@dt-capital.net) from the connected Gmail
// inbox and new files from the shared "Venture Pulse KB" Drive, extracts
// knowledge with Gemini, and saves everything permanently to the knowledge tabs.
//
// Bounded per run (thread/file caps) and idempotent (dedupe by source id), so
// the cron route can call it every 15 minutes safely.

import { searchGmailRaw, type GmailMessage } from "./gmail.server";
import { fetchSheetTab } from "./sheets.server";
import { fetchPortcoWorkstreams } from "./asana.server";
import { getInternalConfig } from "./gmail.server";
import { isInternalEmail, isNoiseEmail } from "@/lib/email-noise";
import {
  ensureKnowledgeTabs,
  extractKnowledge,
  getHarvestState,
  setHarvestState,
  listKnowledgeRecords,
  listSuggestedContacts,
  recordIdFor,
  saveHarvestedActivities,
  saveKnowledgeRecords,
  saveSuggestedContacts,
  saveWorkstreamLinks,
  type HarvestedActivity,
  type KnowledgeRecord,
  type RecordSourceType,
  type SuggestedContact,
  type WorkstreamLink,
} from "./knowledge.server";
import { sha256Hex } from "./sha256";

const TRACKS: Array<{ track: string; sourceType: RecordSourceType; env: string }> = [
  { track: "BD", sourceType: "gmail-bd", env: "GMAIL_BD_ALIAS" },
  { track: "GTM", sourceType: "gmail-gtm", env: "GMAIL_GTM_ALIAS" },
  { track: "Workstream", sourceType: "gmail-workstreams", env: "GMAIL_WORKSTREAMS_ALIAS" },
  { track: "News", sourceType: "gmail-news", env: "GMAIL_NEWS_ALIAS" },
];

function aliasesFor(env: string): string[] {
  return (process.env[env] || "")
    .split(/[;,]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
}

export interface HarvestResult {
  ok: boolean;
  threadsSeen: number;
  recordsAdded: number;
  activitiesAdded: number;
  linksAdded: number;
  contactsSuggested: number;
  granolaNotesAdded: number;
  granolaCopiedToDrive: number;
  errors: string[];
}

/** All email addresses already known in Contacts + Targets (lowercased). */
async function knownEmails(): Promise<Set<string>> {
  const out = new Set<string>();
  const emailRe = /[\w.+-]+@[\w-]+\.[\w.]+/g;
  for (const tab of ["Contacts", "Targets"]) {
    try {
      const rows = await fetchSheetTab(tab);
      for (const row of rows) {
        for (const cell of row) {
          const matches = cell.toLowerCase().match(emailRe);
          if (matches) for (const m of matches) out.add(m);
        }
      }
    } catch {
      /* tab missing — ignore */
    }
  }
  return out;
}

/** Portfolio company names + workstream names per company (match candidates). */
async function matchCandidates(): Promise<{ names: string[]; workstreams: Record<string, string[]>; gidByName: Map<string, string> }> {
  const names = new Set<string>();
  const workstreams: Record<string, string[]> = {};
  const gidByName = new Map<string, string>();
  try {
    const ws = await fetchPortcoWorkstreams();
    for (const w of ws) {
      if (w.company) names.add(w.company);
      if (w.company && w.name) {
        (workstreams[w.company] ||= []).push(w.name);
        gidByName.set(`${w.company}::${w.name}`.toLowerCase(), w.gid);
      }
    }
  } catch (e) {
    console.error("[knowledge-harvest] workstream candidates failed:", e);
  }
  // Also pull company names from the Portfolio tab (workstreams may be empty).
  try {
    const rows = await fetchSheetTab("Portfolio Companies");
    for (const row of rows.slice(1)) {
      const name = (row[0] || "").trim();
      if (name && !/^(name|company)$/i.test(name)) names.add(name);
    }
  } catch {
    /* ignore */
  }
  return { names: [...names], workstreams, gidByName };
}

function threadText(messages: GmailMessage[]): string {
  return messages
    .sort((a, b) => a.date - b.date)
    .map((m) => `From: ${m.fromName} <${m.fromEmail}>\nDate: ${m.dateLabel}\nSubject: ${m.subject}\n\n${m.body}`)
    .join("\n\n---\n\n")
    .slice(0, 16000);
}

/** External people on a thread (for participants + suggested contacts). */
function externalPeople(messages: GmailMessage[]): Array<{ name: string; email: string }> {
  const internal = getInternalConfig();
  const seen = new Map<string, string>();
  for (const m of messages) {
    const all = [
      { name: m.fromName, email: m.fromEmail },
      ...m.toPeople.map((p) => ({ name: p.name, email: p.email })),
      ...m.ccPeople.map((p) => ({ name: p.name, email: p.email })),
    ];
    for (const p of all) {
      const email = (p.email || "").toLowerCase();
      if (!email || seen.has(email)) continue;
      if (isInternalEmail(email, internal) || isNoiseEmail(email)) continue;
      seen.set(email, p.name || "");
    }
  }
  return [...seen.entries()].map(([email, name]) => ({ name, email }));
}

/**
 * Granola is pulled ONLY when includeGranola is true (the manual "Import from
 * Granola" button) so notes can be cleaned up in Granola first. The scheduled
 * cron never passes it.
 */
export async function runKnowledgeHarvest(
  opts: { maxThreadsPerTrack?: number; maxGranolaNotes?: number; includeGranola?: boolean; includeGmail?: boolean; importedBy?: string } = {},
): Promise<HarvestResult> {
  const maxPerTrack = Math.max(1, Math.min(50, opts.maxThreadsPerTrack ?? 15));
  const result: HarvestResult = {
    ok: true, threadsSeen: 0, recordsAdded: 0, activitiesAdded: 0,
    linksAdded: 0, contactsSuggested: 0, granolaNotesAdded: 0, granolaCopiedToDrive: 0, errors: [],
  };

  await ensureKnowledgeTabs();
  const existing = new Set((await listKnowledgeRecords()).map((r) => `${r.sourceType}:${r.sourceId}`));
  const known = await knownEmails();
  const suggested = new Set((await listSuggestedContacts()).map((c) => c.email));
  const candidates = await matchCandidates();

  const newRecords: KnowledgeRecord[] = [];
  const newActivities: HarvestedActivity[] = [];
  const newLinks: WorkstreamLink[] = [];
  const newContacts: SuggestedContact[] = [];
  const now = new Date().toISOString();

  for (const { track, sourceType, env } of opts.includeGmail === false ? [] : TRACKS) {
    const aliases = aliasesFor(env);
    if (aliases.length === 0) continue;


    // Incremental window: since last harvest of this track (default 30d back).
    const last = await getHarvestState(`gmail:${track}`);
    const after = last
      ? last
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, "/");
    const aliasTerms = aliases.flatMap((a) => [`from:${a}`, `to:${a}`, `cc:${a}`, `deliveredto:${a}`]).join(" OR ");
    const q = `(${aliasTerms}) after:${after}`;

    // Read the shared mailbox (shane@) via delegated access when configured;
    // otherwise the connected inbox.
    const res = await searchGmailRaw(q, maxPerTrack * 4, process.env.GMAIL_KB_MAILBOX);
    if (!res.ok) {
      result.errors.push(`${track}: ${res.error || "gmail search failed"}`);
      continue;
    }

    // Group into threads.
    const byThread = new Map<string, GmailMessage[]>();
    for (const m of res.messages) {
      const key = m.threadId || m.id;
      (byThread.get(key) ?? byThread.set(key, []).get(key)!).push(m);
    }

    let processed = 0;
    for (const [threadId, messages] of byThread) {
      if (processed >= maxPerTrack) break;
      result.threadsSeen++;
      if (existing.has(`${sourceType}:${threadId}`)) continue;
      processed++;

      const newest = [...messages].sort((a, b) => b.date - a.date)[0]!;
      const text = threadText(messages);
      const extraction = await extractKnowledge(text, newest.subject, candidates.names, candidates.workstreams);

      const people = externalPeople(messages);
      const participants = people.map((p) => (p.name ? `${p.name} <${p.email}>` : p.email)).join("; ").slice(0, 900);
      const recordId = recordIdFor(sourceType, threadId);

      newRecords.push({
        recordId,
        sourceType,
        sourceId: threadId,
        date: newest.dateLabel || now.slice(0, 10),
        title: newest.subject || "(no subject)",
        portco: extraction.portco,
        participants,
        summary: extraction.summary,
        extractedJson: JSON.stringify(extraction).slice(0, 45000),
        textHash: sha256Hex(text),
        textRef: "",
        sourceUrl: newest.permalink,
        createdAt: now,
      });

      // Activities (news is knowledge-only, not activity).
      if (track !== "News") {
        extraction.activities.forEach((a, i) => {
          newActivities.push({
            activityId: sha256Hex(`${recordId}:${a.type}:${i}`).slice(0, 24),
            recordId,
            date: newest.dateLabel || now.slice(0, 10),
            track,
            type: a.type,
            title: a.title || newest.subject,
            portco: extraction.portco,
            person: a.person,
            owner: "",
            summary: a.summary,
            sourceUrl: newest.permalink,
            createdAt: now,
          });
        });
      }

      // Workstream link — for workstreams@ mail, or any item Gemini matched.
      if (extraction.workstreamName && (track === "Workstream" || extraction.portco)) {
        const gid = candidates.gidByName.get(`${extraction.portco}::${extraction.workstreamName}`.toLowerCase()) || "";
        const status: WorkstreamLink["status"] = gid
          ? extraction.workstreamConfidence === "high" ? "matched" : "suggested"
          : "create-new";
        newLinks.push({
          linkId: recordId,
          recordId,
          portco: extraction.portco,
          workstreamGid: gid,
          workstreamName: extraction.workstreamName,
          confidence: extraction.workstreamConfidence,
          status,
          createdAt: now,
          reviewedAt: "",
        });
      }

      // Suggested contacts — external people not already known or suggested.
      for (const p of people) {
        if (known.has(p.email) || suggested.has(p.email)) continue;
        suggested.add(p.email);
        newContacts.push({
          suggestionId: sha256Hex(p.email).slice(0, 24),
          name: p.name,
          email: p.email,
          company: extraction.people.find((x) => x.email === p.email)?.company || "",
          domain: p.email.split("@")[1] || "",
          portco: extraction.portco,
          firstSeen: `${newest.subject} (${newest.dateLabel})`.slice(0, 200),
          recordId,
          status: "pending",
          createdAt: now,
          reviewedAt: "",
        });
      }
    }

    await setHarvestState(`gmail:${track}`, new Date().toISOString().slice(0, 10).replace(/-/g, "/"));
  }

  // Granola meeting notes (read-only source) — manual sync only.
  if (!opts.includeGranola) {
    await saveKnowledgeRecords(newRecords);
  } else try {
    const { harvestGranola, verifyGranolaImports } = await import("./granola.server");
    const internal = getInternalConfig();
    const g = await harvestGranola({
      candidates, known, suggested, maxNotes: opts.maxGranolaNotes ?? 25,
      isExternal: (e) => !isInternalEmail(e, internal) && !isNoiseEmail(e),
    });
    newRecords.push(...g.records);
    newActivities.push(...g.activities);
    newLinks.push(...g.links);
    newContacts.push(...g.contacts);
    result.errors.push(...g.errors);
    result.granolaNotesAdded = g.records.length;
    result.granolaCopiedToDrive = g.copiedToDrive;
    await saveKnowledgeRecords(newRecords);
    if (g.records.length) await verifyGranolaImports({ noteIds: g.records.map((r) => r.sourceId) });
  } catch (e) {
    result.errors.push(`Granola: ${(e as Error).message}`);
    await saveKnowledgeRecords(newRecords);
  }
  // Stamp who triggered a manual import so the inbox can be scoped per person.
  if (opts.importedBy && newRecords.length) {
    for (const r of newRecords) await setHarvestState(`importedBy:${r.recordId}`, opts.importedBy);
  }
  await saveHarvestedActivities(newActivities);
  await saveWorkstreamLinks(newLinks);
  await saveSuggestedContacts(newContacts);

  result.recordsAdded = newRecords.length;
  result.activitiesAdded = newActivities.length;
  result.linksAdded = newLinks.length;
  result.contactsSuggested = newContacts.length;
  result.ok = result.errors.length === 0;
  return result;
}

// ── Manual note upload (file picker / drag-and-drop) ─────────

export async function uploadNote(input: { name: string; text: string; base64: string; mimeType: string; importedBy?: string }): Promise<{ recordId: string; portco: string }> {
  const text = (input.text || "").trim();
  if (!text) throw new Error("This file has no readable text (use .md or .txt).");
  await ensureKnowledgeTabs();
  const candidates = await matchCandidates();
  const title = input.name.replace(/\.[^.]+$/, "") || "Uploaded note";
  const ex = await extractKnowledge(text, title, candidates.names, candidates.workstreams);
  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  const textHash = sha256Hex(text);
  const recordId = recordIdFor("upload", textHash);
  if ((await listKnowledgeRecords()).some((r) => r.recordId === recordId)) {
    throw new Error("This note was already imported.");
  }

  let driveId = "";
  let driveUrl = "";
  const kb = process.env.GOOGLE_KB_DRIVE_ID;
  if (kb) {
    const { findOrCreateFolder } = await import("./granola.server");
    const { uploadDriveFile } = await import("./drive.server");
    const notes = await findOrCreateFolder("Meeting Notes", kb, kb);
    const co = await findOrCreateFolder(ex.portco || "Unmatched", notes, kb);
    const doc = await uploadDriveFile({ name: input.name, mimeType: input.mimeType || "text/plain", base64: input.base64, folderId: co });
    if (doc) { driveId = doc.id; driveUrl = doc.webViewLink; }
  }

  const known = await knownEmails();
  const suggested = new Set((await listSuggestedContacts()).map((c) => c.email));
  const internal = getInternalConfig();
  await saveKnowledgeRecords([{
    recordId, sourceType: "upload", sourceId: textHash, date, title, portco: ex.portco,
    participants: ex.people.map((p) => p.email ? `${p.name} <${p.email}>` : p.name).join("; ").slice(0, 900),
    summary: ex.summary, extractedJson: JSON.stringify(ex).slice(0, 45000), textHash,
    textRef: driveId, sourceUrl: driveUrl, createdAt: now,
  }]);
  if (input.importedBy) await setHarvestState(`importedBy:${recordId}`, input.importedBy);
  const acts = ex.activities.length ? ex.activities : [{ type: "meeting", title, person: "", summary: ex.summary }];
  await saveHarvestedActivities(acts.map((a, i) => ({
    activityId: sha256Hex(`${recordId}:${a.type}:${i}`).slice(0, 24), recordId, date, track: "Meeting – Upload",
    type: a.type || "meeting", title: a.title || title, portco: ex.portco, person: a.person, owner: "",
    summary: a.summary, sourceUrl: driveUrl, createdAt: now,
  })));
  if (ex.workstreamName && ex.portco) {
    const gid = candidates.gidByName.get(`${ex.portco}::${ex.workstreamName}`.toLowerCase()) || "";
    await saveWorkstreamLinks([{
      linkId: recordId, recordId, portco: ex.portco, workstreamGid: gid, workstreamName: ex.workstreamName,
      confidence: ex.workstreamConfidence,
      status: gid ? (ex.workstreamConfidence === "high" ? "matched" : "suggested") : "create-new",
      createdAt: now, reviewedAt: "",
    }]);
  }
  const contacts: SuggestedContact[] = [];
  for (const p of ex.people) {
    if (!p.email || known.has(p.email) || suggested.has(p.email)) continue;
    if (isInternalEmail(p.email, internal) || isNoiseEmail(p.email)) continue;
    suggested.add(p.email);
    contacts.push({
      suggestionId: sha256Hex(p.email).slice(0, 24), name: p.name, email: p.email, company: p.company,
      domain: p.email.split("@")[1] || "", portco: ex.portco, firstSeen: `${title} (${date})`.slice(0, 200),
      recordId, status: "pending", createdAt: now, reviewedAt: "",
    });
  }
  await saveSuggestedContacts(contacts);
  return { recordId, portco: ex.portco };
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireTeamAuth } from "./team-auth";

export const fetchPortcoListFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { loadPortcoList } = await import("./portco-list.server");
    const { list, file } = await loadPortcoList();
    return { list, file, error: "" };
  } catch (e) {
    console.error("[portco-list]", e);
    return { list: [], file: "", error: e instanceof Error ? e.message : "PortCo List unavailable" };
  }
});

const draftInput = z.object({
  sourceKind: z.string().max(40),
  sourceTitle: z.string().max(500),
  sourceText: z.string().max(20000),
  nextSteps: z.array(z.string().max(500)).max(30).optional(),
  recipients: z.array(z.string().max(200)).max(30),
  portcos: z.array(z.string().max(200)).max(30).optional(),
  history: z.array(z.string().max(500)).max(10).optional(),
  senderName: z.string().max(100).optional(),
  nudge: z.string().max(500).optional(),
});

export const draftFollowUpFn = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof draftInput>) => draftInput.parse(d))
  .handler(async ({ data }) => {
    const { draftFollowUpEmail } = await import("./gemini.server");
    try { return await draftFollowUpEmail(data); }
    catch (e) { console.error("[action-now] draft failed", e); return { found: false, error: e instanceof Error ? e.message : "Draft failed" }; }
  });

const completeInput = z.object({
  sourceKind: z.enum(["note", "activity", "workstream", "followup", "contact", "portco"]),
  sourceId: z.string().min(1).max(200),
  subject: z.string().max(500),
  recipients: z.array(z.object({ name: z.string().max(200), email: z.string().max(200) })).max(30),
  portcos: z.array(z.string().max(200)).max(30),
  tracks: z.array(z.enum(["BD", "GTM"])).max(2),
  actor: z.string().max(200),
  followUpActivityId: z.string().max(100).optional(),
  mode: z.enum(["email", "log"]).optional(),
  note: z.string().max(4000).optional(),
  /** Optional further follow-up to schedule when this action completes. */
  nextFollowUp: z.object({ date: z.string().min(8).max(20), note: z.string().max(500) }).optional(),
});

/** Action Now completion: registers the sent follow-up as activity, closes the follow-up, logs Ops. */
export const completeActionFn = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof completeInput>) => completeInput.parse(d))
  .handler(async ({ data }) => {
    const k = await import("./knowledge.server");
    const { logOpsEvent } = await import("./sheets.server");
    const { sha256Hex } = await import("./sha256");
    const { teamMemberFor } = await import("@/lib/user-ownership");
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const owner = teamMemberFor(data.actor)?.displayName || data.actor;
    const people = data.recipients.map((r) => r.name || r.email).join(", ");
    const tracks = data.tracks.length ? data.tracks : [""];
    const base = sha256Hex(`${data.sourceId}:${today}:${data.subject}`).slice(0, 16);
    await k.saveHarvestedActivities(tracks.map((track) => ({
      activityId: `action:${base}${track ? `:${track}` : ""}`,
      recordId: data.sourceId, date: today, track, type: data.mode === "log" ? "logged-action" : "follow-up",
      title: data.subject || (data.mode === "log" ? "Logged action" : "Follow-up email"), portco: data.portcos.join(", "), person: people, owner,
      summary: data.mode === "log"
        ? `Action with V.I.C. (${data.sourceKind}): logged action${people ? ` with ${people}` : ""}${data.note ? ` — ${data.note}` : ""}`
        : `Action with V.I.C. (${data.sourceKind}): follow-up emailed to ${people || "contacts"}`,
      sourceUrl: "", createdAt: now,
    })));
    if (data.followUpActivityId) await k.resolveHarvestedActivity(data.followUpActivityId, true);
    if (data.nextFollowUp?.date) {
      await k.saveHarvestedActivities([{
        activityId: `followup:${base}`,
        recordId: data.sourceId, date: data.nextFollowUp.date, track: "Follow-up", type: "follow-up",
        title: data.nextFollowUp.note || `Follow up: ${data.subject}`, portco: data.portcos.join(", "), person: people, owner,
        summary: `Follow-up set from Action with V.I.C. (${data.sourceKind}): ${data.nextFollowUp.note || data.subject}`,
        sourceUrl: "", createdAt: now,
      }]);
    }
    await logOpsEvent({ action: "edit", source: "My Actions", status: "ok", summary: `Action with V.I.C.: ${data.subject}`, records: data.recipients.length, details: { owner, source: data.sourceId }, items: data.recipients.map((r) => r.email) });
    return { ok: true, actionId: `action:${base}` };
  });

/** All recorded completions for the selected owner; undone actions stay hidden. */
export const listDoneActionsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { owner: string }) => z.object({ owner: z.string().max(200) }).parse(d))
  .handler(async ({ data }) => {
    const k = await import("./knowledge.server");
    const { completedActions } = await import("@/lib/completed-actions");
    const inbox = await import("./notes-inbox.server");
    const asana = await import("./asana.server");
    const sheets = await import("./sheets.server");
    const { isWorkstreamCompleted } = await import("@/lib/workstream-parse");
    const { isContactTask } = await import("@/lib/home-momentum");
    const { readFollowUpEdits } = await import("./follow-up-edit.server");
    const undone = new Set((await k.getHarvestState("action-undone")).split(",").filter(Boolean));
    const [activities, workstreams, contacts] = await Promise.all([k.listHarvestedActivities(), asana.fetchPortcoWorkstreams(), sheets.buildContacts()]);
    const notes = await inbox.listNotesInbox(true, data.owner, "notes");
    const emails = await inbox.listNotesInbox(true, data.owner, "activity");
    const edits = await readFollowUpEdits();
    const rows: import("@/lib/completed-actions").CompletedAction[] = [];
    const represented = new Set(activities.filter((a) => a.activityId.startsWith("action:") && !undone.has(a.activityId.split(":").slice(0, 2).join(":"))).map((a) => a.recordId));
    for (const a of activities) {
      const action = a.activityId.startsWith("action:");
      if (!action && !(a.track === "Follow-up" && a.resolved)) continue;
      if (!action && represented.has(a.activityId)) continue;
      const base = action ? a.activityId.split(":").slice(0, 2).join(":") : a.activityId;
      const edit = edits.get(a.activityId);
      rows.push({ id: base, kind: "followup", title: edit?.summary || a.title, date: a.resolvedAt || a.createdAt || a.date, person: edit?.people.map((p) => p.name || p.email).join(", ") || a.person, portco: edit?.company || a.portco, owner: edit?.owner || a.owner,
        ...(action ? { actionId: base, followUpActivityId: a.summary.includes("(followup)") && activities.some((x) => x.activityId === a.recordId) ? a.recordId : undefined } : {}) });
    }
    for (const w of workstreams.filter(isWorkstreamCompleted)) rows.push({ id: `ws:${w.gid}`, kind: "workstream", title: w.name || w.rawName, date: w.completedAt || w.lastActivity, person: "", portco: w.company, owner: w.owner, workstreamGid: w.gid });
    for (const [items, kind] of [[notes, "note"], [emails, "activity"]] as const) for (const n of items) {
      if (!n.review || n.review.status === "skipped") continue;
      rows.push({ id: `review:${n.recordId}`, kind, title: n.title, date: n.review.reviewedAt, person: "", portco: n.portco, owner: n.author || n.review.reviewedBy });
    }
    for (const c of contacts) for (const i of c.interactions) {
      if (!i.isFollowUp || !i.followUpComplete || !isContactTask(i.sourceRef)) continue;
      rows.push({ id: `network:${c.id}:${i.id}`, kind: "followup", title: i.summary, date: i.date, person: c.name, portco: c.company, owner: i.owner || c.prime });
    }
    return completedActions(rows, data.owner, undone);
  });

/** Recent activity trail for one workstream (emails sent, logged actions, linked notes, completed follow-ups). Read-only. */
export const workstreamTrailFn = createServerFn({ method: "POST" }).middleware([requireTeamAuth])
  .inputValidator((d: { gid: string; company: string; segment: string }) => z.object({ gid: z.string().min(1).max(40), company: z.string().max(200), segment: z.string().max(20) }).parse(d))
  .handler(async ({ data }) => {
    const k = await import("./knowledge.server");
    const { workstreamTrail } = await import("@/lib/workstream-trail");
    const [activities, links, undoneRaw] = await Promise.all([k.listHarvestedActivities(), k.listWorkstreamLinks(), k.getHarvestState("action-undone")]);
    return workstreamTrail({ ...data, activities, links, undone: new Set(undoneRaw.split(",").filter(Boolean)) });
  });

export const undoActionFn = createServerFn({ method: "POST" })
  .inputValidator((d: { actionId: string; followUpActivityId?: string }) => z.object({ actionId: z.string().min(1).max(120), followUpActivityId: z.string().max(100).optional() }).parse(d))
  .handler(async ({ data }) => {
    const k = await import("./knowledge.server");
    const cur = (await k.getHarvestState("action-undone")).split(",").filter(Boolean);
    await k.setHarvestState("action-undone", [...new Set([...cur, data.actionId])].join(","));
    if (data.followUpActivityId) await k.resolveHarvestedActivity(data.followUpActivityId, false);
    return { ok: true };
  });

const interpretInput = z.object({
  request: z.string().min(1).max(4000),
  sourceKind: z.string().max(40),
  sourceTitle: z.string().max(500),
  sourceText: z.string().max(12000),
  people: z.array(z.string().max(200)).max(30),
  portcos: z.array(z.string().max(200)).max(30),
  portcoOptions: z.array(z.string().max(200)).max(400),
  senderName: z.string().max(100).optional(),
  currentDraft: z.string().max(8000).optional(),
  focusCompany: z.string().max(200).optional(),
  conversation: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(10000) })).max(40).optional(),
  tone: z.enum(["formal", "informal"]).optional(),
  length: z.enum(["short", "long"]).optional(),
});

/** V.I.C. reads a typed/dictated request: picks email vs log, resolves people descriptions, detects PortCos, drafts. Proposes only. */
export const interpretActionRequestFn = createServerFn({ method: "POST" }).middleware([requireTeamAuth])
  .inputValidator((d: z.infer<typeof interpretInput>) => interpretInput.parse(d))
  .handler(async ({ data }) => {
    const { callGeminiJSON } = await import("./gemini.server");
    const { peopleDirectory } = await import("./notes-inbox.server");
    const { resolvePersonQuery, portcosMentioned } = await import("@/lib/action-people");
    const { actionStyle, canonicalActionNames, stripActionPortcoBullets } = await import("@/lib/action-drafting");
    const dir = (await peopleDirectory()).map((p) => ({ name: p.name, email: p.email, company: p.company, title: p.title || "", where: p.where }));
    const confirmed = dir.filter((p) => data.people.includes(p.name) || data.people.includes(p.email));
    const canonicalNames = [...new Set([...data.portcos, ...confirmed.map((p) => p.company).filter(Boolean)])];
    const system = `You are V.I.C., assistant to a venture investor at DT Capital (Dell Technologies Capital).
Interpret the user's request about an action. Output ONLY JSON:
{"mode":"email"|"log","people":[{"phrase":"exact words used","name":"full name if given","company":"company if given","role":"title like CEO if given","count":number if a count was given}],"portcos":["PortCo names mentioned"],"subject":"...","body":"email body or log notes","reply":"Conversational response explaining changes or asking a clarification question"}
- mode "log" when they describe something already done (called, met, introduced, logged); otherwise "email".
- people: only people newly described in the request; omit the people already listed as current recipients unless re-described.${data.focusCompany ? ` "their"/"them" refers to ${data.focusCompany}.` : ""}
- Email style: ${actionStyle(data.tone || "informal", data.length || "short")} No placeholders, never invent facts; refer to unresolved people by role. Sign off with the sender's first name if given.
- This is a continuing conversation. Interpret refinements in light of earlier messages and the current draft, not as unrelated requests. When a detail is unclear, ask a focused question in reply; leave subject/body empty if you cannot safely draft yet.
- Use the EXACT canonical spelling of confirmed people and companies, even when dictation misspells them. PortCo tags must come from the provided canonical options. Never silently resolve an ambiguous company or person: ask for confirmation.
- Do not write portfolio company bullets or websites: the application appends approved descriptions separately. Preserve requested removals from the current draft.`;
    const user = [
      `Request: ${data.request}`,
      `Source (${data.sourceKind}): ${data.sourceTitle}`, data.sourceText.slice(0, 6000),
      `Current recipients: ${data.people.join(", ") || "none"}`,
      `Confirmed people and companies: ${JSON.stringify(confirmed.map((p) => ({ name: p.name, company: p.company })))}`,
      `Canonical PortCo options: ${data.portcoOptions.join(", ")}`,
      data.conversation?.length ? `Conversation so far:\n${data.conversation.map((m) => `${m.role}: ${m.text}`).join("\n")}` : "",
      data.portcos.length ? `Tagged PortCos: ${data.portcos.join(", ")}` : "",
      data.senderName ? `Sender: ${data.senderName}` : "",
      data.currentDraft ? `Current draft:\n${data.currentDraft}` : "",
    ].filter(Boolean).join("\n\n");
    const r = await callGeminiJSON<{ mode?: string; people?: Array<{ phrase?: string; name?: string; company?: string; role?: string; count?: number }>; portcos?: string[]; subject?: string; body?: string; reply?: string }>(system, user, 2000);
    if (!r.ok || !r.data) return { ok: false as const, error: r.error || "V.I.C. couldn't read that request." };
    const people = (r.data.people || []).slice(0, 10).map((q) => resolvePersonQuery({
      phrase: String(q.phrase || ""), name: q.name || undefined, company: q.company || (q.name ? undefined : data.focusCompany), role: q.role || undefined,
      count: typeof q.count === "number" && q.count > 0 ? Math.round(q.count) : undefined,
    }, dir));
    const lower = new Map(data.portcoOptions.map((o) => [o.toLowerCase(), o]));
    const portcos = [...new Set([
      ...(r.data.portcos || []).map((p) => lower.get(String(p).toLowerCase())).filter((p): p is string => !!p),
      ...portcosMentioned(data.request, data.portcoOptions),
    ])];
    const names = [...canonicalNames, ...portcos];
    return { ok: true as const, mode: r.data.mode === "log" ? "log" as const : "email" as const, people, portcos, subject: canonicalActionNames(String(r.data.subject || ""), names), body: stripActionPortcoBullets(canonicalActionNames(String(r.data.body || ""), names), data.portcoOptions), reply: String(r.data.reply || "") };
  });

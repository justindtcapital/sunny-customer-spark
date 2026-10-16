import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
  sourceKind: z.enum(["note", "activity", "workstream", "followup"]),
  sourceId: z.string().min(1).max(200),
  subject: z.string().max(500),
  recipients: z.array(z.object({ name: z.string().max(200), email: z.string().max(200) })).max(30),
  portcos: z.array(z.string().max(200)).max(30),
  tracks: z.array(z.enum(["BD", "GTM"])).max(2),
  actor: z.string().max(200),
  followUpActivityId: z.string().max(100).optional(),
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
      recordId: data.sourceId, date: today, track, type: "follow-up",
      title: data.subject || "Follow-up email", portco: data.portcos.join(", "), person: people, owner,
      summary: `Action Now (${data.sourceKind}): follow-up emailed to ${people || "contacts"}`,
      sourceUrl: "", createdAt: now,
    })));
    if (data.followUpActivityId) await k.resolveHarvestedActivity(data.followUpActivityId, true);
    await logOpsEvent({ action: "edit", source: "My Actions", status: "ok", summary: `Action Now: ${data.subject}`, records: data.recipients.length, details: { owner, source: data.sourceId }, items: data.recipients.map((r) => r.email) });
    return { ok: true, actionId: `action:${base}` };
  });

/** Done tab: Action Now completions for this owner in the last 30 days (undone ones hidden). */
export const listDoneActionsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { owner: string }) => z.object({ owner: z.string().max(200) }).parse(d))
  .handler(async ({ data }) => {
    const k = await import("./knowledge.server");
    const { ownerMatches } = await import("@/lib/action-owners");
    const undone = new Set((await k.getHarvestState("action-undone")).split(",").filter(Boolean));
    const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const seen = new Set<string>();
    return (await k.listHarvestedActivities())
      .filter((a) => a.activityId.startsWith("action:") && a.date >= since && (!data.owner || ownerMatches(a.owner, data.owner)))
      .map((a) => ({ ...a, base: a.activityId.split(":").slice(0, 2).join(":") }))
      .filter((a) => !undone.has(a.base) && !seen.has(a.base) && (seen.add(a.base), true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

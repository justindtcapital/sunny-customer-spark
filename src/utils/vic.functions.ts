import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireTeamAuth } from "./team-auth";

/** Top-level Venture Pulse KB folders for Vic's folder picker. */
export const listKbFoldersFn = createServerFn({ method: "GET" })
  .middleware([requireTeamAuth])
  .handler(async () => {
    const { listKbFolders } = await import("./vic-kb.server");
    try { return { folders: await listKbFolders(), error: "" }; }
    catch (e) { return { folders: [], error: e instanceof Error ? e.message : "Couldn't read the knowledge base." }; }
  });

const followUpInput = z.object({
  title: z.string().min(1).max(300),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  owner: z.string().min(1).max(200),
  portco: z.string().max(300).default(""),
  person: z.string().max(300).default(""),
  details: z.string().max(2000).default(""),
  /** Client-stable key from the reviewed proposal so a double-click can't create two. */
  key: z.string().min(4).max(100),
});

/** Create one follow-up approved in Vic. Same store as My Actions; duplicate ids are skipped. */
export const createVicFollowUpFn = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((d: z.input<typeof followUpInput>) => followUpInput.parse(d))
  .handler(async ({ data }) => {
    const k = await import("./knowledge.server");
    const { sha256Hex } = await import("./sha256");
    const { teamMemberFor } = await import("@/lib/user-ownership");
    const { logOpsEvent } = await import("./sheets.server");
    const owner = teamMemberFor(data.owner)?.displayName || data.owner;
    const activityId = `followup:vic:${sha256Hex(data.key).slice(0, 16)}`;
    await k.saveHarvestedActivities([{
      activityId, recordId: `vic:${data.key}`, date: data.date, track: "Follow-up", type: "follow-up",
      title: data.title, portco: data.portco, person: data.person, owner,
      summary: `Follow-up created via Vic${data.details ? `: ${data.details}` : ""}`, sourceUrl: "", createdAt: new Date().toISOString(),
    }]);
    await logOpsEvent({ action: "edit", source: "Vic", status: "ok", summary: `Follow-up: ${data.title}`, records: 1, details: { owner, date: data.date }, items: [activityId] });
    return { ok: true, activityId };
  });

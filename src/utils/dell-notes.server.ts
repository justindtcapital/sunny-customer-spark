// V.I.C. drafts of Dell-facing engagement notes for the Dell Leverage Dashboard. Server-only.
// Internal workstream notes and status history are background for the model; the draft is
// sanitized so internal priorities, ROI, investment and ownership never appear, and it is only
// ever returned to the person reviewing it — saving goes through the normal workstream save.
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "./morning-brief-run-id.server";

const Schema = z.object({ notes: z.array(z.object({ n: z.number().int(), note: z.string() })) });

const SYSTEM = [
  "You are V.I.C., writing short engagement notes for a dashboard that is shown to Dell in a quarterly business review.",
  "For each numbered workstream write 1-3 plain sentences (max 60 words) on where the engagement with Dell stands:",
  "what has happened, who at Dell is involved, and the next concrete step or what help is needed from Dell.",
  "Use only facts given. Write neutrally and professionally, as something Dell may read.",
  "Lead with concrete facts from the background notes and status changes; do not just restate the status labels, and never contradict them.",
  "Never mention internal priorities, ROI, rankings, investment amounts, ownership, valuations, internal opinions of people, or how important the work is to us.",
  "If there is too little information, write one sentence stating the current status and that next steps are being defined.",
].join(" ");

const g = (s: string | undefined) => (s || "").replace(/\s+/g, " ").trim();

export async function draftDellEngagementNotes(gids: string[]): Promise<Record<string, string>> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("V.I.C. isn't connected right now.");
  const { readWorkstreams, CHANGE_LOG_TAB } = await import("./portco-store.server");
  const { fetchSheetTabIfExists } = await import("./sheets.server");
  const { statusChangesFromLog, sanitizeDellNote } = await import("@/lib/dell-leverage");
  const [all, log] = await Promise.all([readWorkstreams(), fetchSheetTabIfExists(CHANGE_LOG_TAB).catch(() => null)]);
  const want = new Set(gids);
  const items = all.filter((w) => want.has(w.gid));
  if (!items.length) return {};
  const changes = log ? statusChangesFromLog(log) : [];
  const lines = items.map((w, i) => {
    const history = changes.filter((c) => c.recordId === w.gid).slice(-5).map((c) => `${c.at.slice(0, 10)} ${c.field}: ${c.before || "none"} → ${c.after || "none"}`);
    return [
      `${i + 1}. Company: ${g(w.company)} | Workstream: ${g(w.name)}`,
      `Sell-In Status: ${g(w.sellInStatus) || "none"} | Sell With Dell Status: ${g(w.maturity) || "none"} | Work status: ${g(w.workstreamStatus) || "none"}`,
      `Dell BU: ${g(w.dellTargets) || "not set"} | Dell stakeholders: ${g(w.dellStakeholders) || "none named"} | Dell products: ${g(w.fields["Dell Products Aligned"]) || "none"}`,
      history.length ? `Recent status changes: ${history.join("; ")}` : "",
      `Background notes: ${g(w.notes).slice(0, 1500) || "none"}`,
    ].filter(Boolean).join("\n");
  });
  const runId = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" }, fetch: runId.fetch });
  const res = await generateText({
    model: provider.responses("openai/gpt-6-astra"),
    system: SYSTEM,
    prompt: lines.join("\n\n"),
    output: Output.object({ schema: Schema }),
    providerOptions: { openai: { store: false } },
  });
  const out: Record<string, string> = {};
  for (const { n, note } of (res.output as z.infer<typeof Schema>).notes) {
    const w = items[n - 1];
    const clean = w ? sanitizeDellNote(note) : "";
    if (w && clean) out[w.gid] = clean;
  }
  return out;
}

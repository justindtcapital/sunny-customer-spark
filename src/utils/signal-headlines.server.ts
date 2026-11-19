// Writes a short news headline into the Signals "Headline" column for rows
// that don't have one yet (digest links, news@ research, older scan rows).
// Runs as a step of the daily Signals job and once as a backfill. It only
// fills empty Headline cells — the signal text and every other column stay
// as they are, and the feed falls back to a derived headline until then.
// Server-only.
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import { acceptableHeadline } from "@/lib/signal-headline";
import { readableSummary } from "@/lib/signals-page";
import { createLovableAiGatewayRunIdFetch } from "./morning-brief-run-id.server";

const HEADLINE_COL = 23; // SIGNAL_HEADERS "Headline" (positional row contract)
const BATCH = 40;

const Schema = z.object({
  headlines: z.array(z.object({ n: z.number().int(), headline: z.string() })),
});

const SYSTEM = [
  "You write news headlines for a venture capital firm's Signals feed.",
  "For each numbered item write ONE headline: 8-14 words, at most 90 characters, active voice, present tense,",
  "naming the company and the concrete news (who did what). Example: \"IBM acquires identity security startup AuthMind\".",
  "Use only facts in the item. Never a category label like \"IBM — Funding/M&A\", never a question, no quotes, no trailing period.",
  "If an item has no concrete news, still write a plain factual headline from what it says.",
].join(" ");

interface Pending { rowNum: number; company: string; category: string; title: string; text: string }

export interface HeadlineRun { written: number; checked: number; remaining: number; error?: string }

export async function writeMissingSignalHeadlines(opts: { max?: number } = {}): Promise<HeadlineRun> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { written: 0, checked: 0, remaining: 0, error: "AI service not connected" };
  const { fetchSheetTab, updateSheetCells, colLetters, ensureHeaderWidth, SIGNAL_HEADERS, TAB_NAMES } = await import("./sheets.server");
  await ensureHeaderWidth(TAB_NAMES.signals, SIGNAL_HEADERS);
  // Fresh read: row numbers must match the sheet as it is now.
  const rows = await fetchSheetTab(TAB_NAMES.signals, true);
  const isHeader = (r: string[]) => (r[0] || "").trim().toLowerCase() === "id" && (r[2] || "").trim().toLowerCase() === "type";
  const start = rows.length && isHeader(rows[0]) ? 1 : 0;
  const g = (r: string[], i: number) => (r[i] || "").replace(/\s+/g, " ").trim();
  const pending: Array<Pending & { date: string }> = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i] || [];
    const type = g(r, 2).toLowerCase();
    if (!g(r, 0) || (type !== "recommendation" && type !== "awareness") || g(r, HEADLINE_COL)) continue;
    const text = readableSummary(g(r, 8));
    const title = type === "awareness" ? g(r, 10) : "";
    if (!text && !title) continue;
    pending.push({ rowNum: i + 1, date: g(r, 1), company: g(r, 5), category: g(r, 7), title, text });
  }
  pending.sort((a, b) => b.date.localeCompare(a.date));
  const todo = pending.slice(0, opts.max ?? 200);
  if (todo.length === 0) return { written: 0, checked: 0, remaining: 0 };

  const runId = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" }, fetch: runId.fetch });
  let written = 0;
  let error: string | undefined;
  for (let b = 0; b < todo.length; b += BATCH) {
    const batch = todo.slice(b, b + BATCH);
    const prompt = batch
      .map((p, n) => `${n + 1}. Company: ${p.company || "(industry)"}${p.title ? ` | Title: ${p.title.slice(0, 200)}` : ""} | Text: ${p.text.slice(0, 500)}`)
      .join("\n");
    let out: z.infer<typeof Schema>;
    try {
      const res = await generateText({
        model: provider.responses("openai/gpt-6-astra"),
        system: SYSTEM,
        prompt,
        output: Output.object({ schema: Schema }),
        providerOptions: { openai: { store: false } },
      });
      out = res.output as z.infer<typeof Schema>;
    } catch (e) {
      console.error("[signal-headlines] AI call failed", e);
      error = e instanceof Error ? e.message : "AI call failed";
      break;
    }
    const updates: Array<{ range: string; value: string }> = [];
    for (const h of out.headlines || []) {
      const p = batch[h.n - 1];
      const value = p && acceptableHeadline(h.headline, p.company);
      if (p && value) updates.push({ range: `${colLetters(HEADLINE_COL)}${p.rowNum}`, value });
    }
    if (updates.length) {
      // Literal so Sheets never reinterprets a headline (leading "=", dates).
      await updateSheetCells(TAB_NAMES.signals, updates, true);
      written += updates.length;
    }
  }
  return { written, checked: todo.length, remaining: Math.max(0, pending.length - written), ...(error ? { error } : {}) };
}

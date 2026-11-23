// Shared LinkedIn drafter for signals — used by the Broadcast dialog and V.I.C.
// Drafting only: nothing is posted or saved. Server-only.
import { callGeminiJSON } from "./gemini.server";
import { finalizeLinkedInPost } from "@/lib/linkedin-post";

export async function draftLinkedInPostText(data: {
  company?: string;
  headline: string;
  summary?: string;
  sourceUrl?: string;
}): Promise<{ ok: boolean; error?: string; post?: string }> {
  try {
    const system =
      "You write short, polished LinkedIn posts in the voice of Dell Technologies Capital (DTC), a deep-tech VC. " +
      "Tone: warm, credible, not hypey. 80-150 words. Reference the signal, add a brief DTC perspective, and end with " +
      "3-5 relevant hashtags that MUST include #DTC (never #DellTechCapital). When a Source URL is given, put it on its own line " +
      "just above the hashtags so LinkedIn shows the article preview. Do not fabricate facts beyond what's given. " +
      'Output ONLY JSON: {"post":"<the post text with real \\n line breaks>"}';
    const user =
      `Signal:\nCompany: ${data.company || "—"}\nHeadline: ${data.headline}\n` +
      `${data.summary ? `Summary: ${data.summary}\n` : ""}${data.sourceUrl ? `Source: ${data.sourceUrl}\n` : ""}`;
    const res = await callGeminiJSON<{ post?: string }>(system, user, 800);
    if (!res.ok || !res.data?.post) return { ok: false, error: res.error || "Draft failed" };
    return { ok: true, post: finalizeLinkedInPost(res.data.post, data.sourceUrl) };
  } catch (e) {
    console.error("[broadcast] draftLinkedInPost failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Draft failed" };
  }
}

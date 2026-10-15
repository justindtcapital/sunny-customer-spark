// Spoken/typed keyword → update category for the Tell Venture Pulse window.
// PortCo, contacts and follow-ups are tags, not categories.
export type VoiceCategory = "Network" | "Workstream" | "GTM" | "BD" | "PortCo Ops";

export const VOICE_CATEGORIES: VoiceCategory[] = ["Network", "Workstream", "GTM", "BD", "PortCo Ops"];

const RULES: [VoiceCategory, RegExp][] = [
  ["Network", /\b(network|nwk)\s+(update|note)s?\b/i],
  ["Workstream", /\bwork\s?stream\s+(update|note)s?\b/i],
  ["GTM", /\b(go[\s-]to[\s-]market|gtm)\s+(update|note)s?\b/i],
  ["BD", /\b(bd|business\s+development)\s+(update|note)s?\b/i],
  ["PortCo Ops", /\b(port\s?co|portfolio|port\s?dev)\s+(dev\s+)?(ops|operations)(\s+(update|note)s?)?\b/i],
];

/** First category keyword found in the text (earliest position wins). */
export function detectVoiceCategory(text: string): VoiceCategory | null {
  let best: { c: VoiceCategory; i: number } | null = null;
  for (const [c, re] of RULES) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.i)) best = { c, i: m.index };
  }
  return best?.c ?? null;
}

/** "PortCo - Category - Summary"; Network carries "NWK" so it routes to network review. */
export function voiceTitle(portcos: string[], category: VoiceCategory | null, summary: string): string {
  const cat = category === "Network" ? "NWK Network" : category || "Update";
  const short = summary.replace(/\s+/g, " ").trim().split(" ").slice(0, 10).join(" ").replace(/[.,;:]$/, "");
  return [portcos.join(" & "), cat, short].filter(Boolean).join(" - ");
}

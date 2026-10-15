// Spoken/typed keyword → update category for the Tell Venture Pulse window.
export type VoiceCategory = "Network" | "Workstream" | "PortCo" | "GTM" | "BD" | "Follow-up";

const RULES: [VoiceCategory, RegExp][] = [
  ["Network", /\b(network|nwk)\s+(update|note)s?\b/i],
  ["Workstream", /\bwork\s?stream\s+(update|note)s?\b/i],
  ["PortCo", /\b(port\s?co|portfolio(\s+company)?)\s+(update|note)s?\b/i],
  ["GTM", /\b(go[\s-]to[\s-]market|gtm)\s+(update|note)s?\b/i],
  ["BD", /\b(bd|business\s+development)\s+(update|note)s?\b/i],
  ["Follow-up", /\b(follow[\s-]?up|reminder)\s+(update|note)?s?\b/i],
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

/** Title used when saving; Network carries "NWK" so it routes to network review. */
export function voiceTitle(category: VoiceCategory | null, date: Date): string {
  const d = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const label = category === "Network" ? "NWK Network" : category ?? "Voice";
  return `${label} update — ${d}`;
}

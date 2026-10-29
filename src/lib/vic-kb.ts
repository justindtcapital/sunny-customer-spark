// Pure helpers for Vic's knowledge-base search (shared by server and tests).

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "do", "does", "any", "is", "are", "what", "who", "we", "our", "about"]);

export function kbTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)))].slice(0, 6);
}

/** Drive query: every term must appear in the file's indexed text or name. */
export function kbQueryClause(query: string): string {
  const terms = kbTerms(query);
  if (!terms.length) return "trashed=false";
  return terms.map((t) => `fullText contains '${t.replace(/\\/g, "").replace(/'/g, "\\'")}'`).join(" and ");
}

/** Up to `max` ~400-char passages around query-term hits, best (most terms) first. */
export function extractSnippets(text: string, query: string, max = 3): string[] {
  const terms = kbTerms(query);
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const lower = clean.toLowerCase();
  const scored: { start: number; score: number }[] = [];
  for (const t of terms) {
    let i = lower.indexOf(t);
    while (i !== -1 && scored.length < 200) {
      const start = Math.max(0, i - 150);
      const win = lower.slice(start, start + 400);
      scored.push({ start, score: terms.filter((x) => win.includes(x)).length });
      i = lower.indexOf(t, i + t.length);
    }
  }
  if (!scored.length) return [clean.slice(0, 400)];
  scored.sort((a, b) => b.score - a.score || a.start - b.start);
  const picked: number[] = [];
  for (const s of scored) {
    if (picked.length >= max) break;
    if (picked.every((p) => Math.abs(p - s.start) >= 400)) picked.push(s.start);
  }
  return picked.sort((a, b) => a - b).map((s) => (s > 0 ? "…" : "") + clean.slice(s, s + 400) + (s + 400 < clean.length ? "…" : ""));
}

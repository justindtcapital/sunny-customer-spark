// Pure helpers for the Signals page, the Morning Brief "Signals to know today"
// section and the "Send to news@" email. Browser-safe: no server imports.

/** Minimal card fields the Signals filters read (FeedCard satisfies this). */
export interface FilterableSignal {
  storedId?: string;
  company: string;
  segmentBucket: string;
  industry?: string;
  sourceType: string;
  headline: string;
  summary: string;
  sortTs: number;
}

export interface SignalsSearch {
  q?: string;
  seg?: string[];
  ind?: string[];
  pc?: string[];
  src?: string[];
  /** Max age in days, or "all"; missing = DEFAULT_DAYS. */
  days?: number | "all";
  /** Stored signal ID to open on arrival (e.g. from the Morning Brief). */
  open?: string;
}

export const DATE_WINDOWS = [
  { value: 1, label: "Today" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
] as const;
export const DEFAULT_DAYS = 30;

const list = (v: unknown): string[] | undefined => {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  const out = raw.map((x) => String(x).trim()).filter(Boolean).slice(0, 200);
  return out.length ? out : undefined;
};

/** URL search params → filters. Unknown/invalid values are dropped. */
export function validateSignalsSearch(search: Record<string, unknown>): SignalsSearch {
  const n = Number(search.days);
  const days = search.days === "all" ? "all" : DATE_WINDOWS.some((w) => w.value === n) ? n : undefined;
  return {
    q: typeof search.q === "string" && search.q.trim() ? search.q.trim().slice(0, 200) : undefined,
    seg: list(search.seg),
    ind: list(search.ind),
    pc: list(search.pc),
    src: list(search.src),
    days,
    open: typeof search.open === "string" && /^[\w-]{1,60}$/.test(search.open) ? search.open : undefined,
  };
}

const norm = (s?: string) => (s || "").trim().toLowerCase();

/**
 * Apply the Signals filters. Within a group values are OR'd; groups are AND'd.
 * The signal named by `open` always stays in the list so deep links never
 * land on an empty page.
 */
export function filterSignals<T extends FilterableSignal>(cards: T[], s: SignalsSearch, now = Date.now()): T[] {
  const words = norm(s.q).split(/\s+/).filter(Boolean);
  const pcs = new Set((s.pc || []).map(norm));
  const days = s.days === "all" ? 0 : s.days ?? DEFAULT_DAYS;
  const cutoff = days ? now - days * 86_400_000 : 0;
  return cards.filter((c) => {
    if (s.open && c.storedId === s.open) return true;
    if (s.seg?.length && !s.seg.includes(c.segmentBucket)) return false;
    if (s.ind?.length && !s.ind.includes(c.industry || "")) return false;
    if (pcs.size && !pcs.has(norm(c.company))) return false;
    if (s.src?.length && !s.src.includes(c.sourceType)) return false;
    if (cutoff && c.sortTs && c.sortTs < cutoff) return false;
    if (cutoff && !c.sortTs) return false;
    if (words.length) {
      const text = norm(`${c.company} ${c.headline} ${c.summary}`);
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
}

// ── Morning Brief ────────────────────────────────────────────────

/** Stored-signal fields the brief ranking reads (StoredSignal satisfies this). */
export interface RankableSignal {
  id: string;
  dateFound: string;
  company: string;
  signal: string;
  subject?: string;
  sourceType: string;
  sourceUrl: string;
  relevance: number;
  rankScore?: number | null;
}

export interface BriefSignal {
  id: string;
  company: string;
  headline: string;
  sourceType: string;
  sourceUrl: string;
  date: string;
  /** True when the signal is about a PortCo on today's meeting list. */
  inMeeting: boolean;
}

/** YYYY-MM-DD one day before `today` (YYYY-MM-DD). */
export function dayBefore(today: string): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Score used for ordering: rank score (0–100) when present, else relevance (0–10) scaled. */
const strength = (s: RankableSignal) => (s.rankScore != null && !Number.isNaN(s.rankScore) ? s.rankScore : (s.relevance || 0) * 10);

/**
 * "Signals to know today": signals found since yesterday. Signals about PortCos
 * in today's meetings come first, then the highest-ranked, then newest.
 * Each real story appears once (same source link or same company + headline).
 */
export function briefSignals(rows: RankableSignal[], opts: { today: string; meetingPortcos: string[]; limit?: number }): BriefSignal[] {
  const since = dayBefore(opts.today);
  const meeting = new Set(opts.meetingPortcos.map(norm).filter(Boolean));
  const seen = new Set<string>();
  const fresh = rows
    .filter((r) => (r.dateFound || "").slice(0, 10) >= since && (r.signal || r.subject))
    .map((r) => ({ r, inMeeting: meeting.has(norm(r.company)) }))
    .sort((a, b) =>
      Number(b.inMeeting) - Number(a.inMeeting) ||
      strength(b.r) - strength(a.r) ||
      (b.r.dateFound > a.r.dateFound ? 1 : b.r.dateFound < a.r.dateFound ? -1 : 0));
  const out: BriefSignal[] = [];
  for (const { r, inMeeting } of fresh) {
    const headline = (r.subject || r.signal).trim();
    const key = /^https?:\/\//i.test(r.sourceUrl) ? `u:${norm(r.sourceUrl)}` : `h:${norm(r.company)}|${norm(headline)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: r.id, company: r.company, headline, sourceType: r.sourceType, sourceUrl: r.sourceUrl, date: r.dateFound.slice(0, 10), inMeeting });
    if (out.length >= (opts.limit ?? 6)) break;
  }
  return out;
}

// ── Send to Venture Pulse via news@ ──────────────────────────────

export type SignalNewsKind = "PortCo" | "Industry";

/** Marks a news@ email as already saved on the Signals tab, so ingest never re-adds it. */
export const SIGNAL_MARKER = "VP-Signal-Id:";
export const SIGNAL_MARKER_RE = /VP-Signal-Id:\s*([\w-]+)/;

/**
 * Drops the internal relevance-scoring breakdown ("Attribution 6.3/10 — … LLM
 * prior 8/10 weighted 25%. — ") that scans prepend to a suggestion's reason,
 * keeping only the human-readable explanation. "" when nothing readable remains.
 */
export function readableSummary(text?: string): string {
  const t = (text || "").trim();
  if (!/^Attribution \d/.test(t)) return t;
  const m = /weighted \d+%\.?\s*(?:—|-)\s*/.exec(t);
  return m ? t.slice(m.index + m[0].length).trim() : "";
}

export function signalNewsEmail(s: {
  id?: string;
  kind: SignalNewsKind;
  company?: string;
  headline: string;
  summary?: string;
  sourceUrl?: string;
  sharedBy?: string;
}): { subject: string; body: string } {
  const company = (s.company || "").trim();
  const subject = `${s.kind === "PortCo" ? "PortCo news" : "Industry news"}${company ? ` — ${company}` : ""}: ${s.headline.trim()}`.slice(0, 250);
  const lines = [
    s.headline.trim(),
    "",
    readableSummary(s.summary),
    "",
    /^https?:\/\//i.test(s.sourceUrl || "") ? `Source: ${s.sourceUrl}` : "",
    company ? `${s.kind === "PortCo" ? "PortCo" : "Company"}: ${company}` : "",
    `Type: ${s.kind === "PortCo" ? "PortCo news" : "Industry news"}`,
    s.sharedBy ? `Shared by: ${s.sharedBy}` : "",
    s.id ? `${SIGNAL_MARKER} ${s.id}` : "",
  ];
  return { subject, body: lines.filter((l, i, a) => l || (i > 0 && a[i - 1])).join("\n").trim() };
}

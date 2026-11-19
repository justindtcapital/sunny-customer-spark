// Signal card headlines: a short news headline (one or two lines), never a
// "Company — Category" label. Pure and browser-safe — the feed, the Morning
// Brief, V.I.C. and the headline writer all pick headlines the same way.

/** Target length: fits one or two lines on a Signals tile. */
export const HEADLINE_MAX = 90;

const CATEGORY_WORDS =
  /^(funding\/m&a|product\/milestone|executive movement|thought leadership|partnership\/customer win|crisis\/regulatory|industry trend|personal milestone|industry research|signal|update|news)$/i;

const clean = (s?: string) => (s || "").replace(/\s+/g, " ").trim();

/**
 * True for labels that aren't headlines: "IBM — Funding/M&A", a bare category,
 * "X — industry research", "X published an update", forwarded-mail subjects.
 */
export function isLabelTitle(title: string, company = ""): boolean {
  const t = clean(title);
  if (!t) return true;
  if (CATEGORY_WORDS.test(t)) return true;
  const dash = /^(.*?)\s+[—–-]\s+(.+)$/.exec(t);
  if (dash && CATEGORY_WORDS.test(dash[2].trim())) return true;
  if (company && t.toLowerCase() === company.trim().toLowerCase()) return true;
  if (/\bpublished an update\b/i.test(t)) return true;
  if (/^(fwd?|fw|re)\s*:/i.test(t)) return true;
  return false;
}

const DANGLING = /\s+(and|or|the|a|an|to|of|for|in|on|with|by|at|as|its|their|from|into|that|which|while)$/i;
const BOUNDARIES = [";", " — ", " – ", ", which", ", while", ", as ", ", with ", ", aiming", ", according", ", amid", ", after", ", marking", ", bringing", ", making", ", and "];

/**
 * Shorten text to a headline of at most `max` characters: first sentence,
 * cut at a natural clause break when it's too long, else at a word boundary
 * with an ellipsis. No trailing period.
 */
export function shortenHeadline(text: string, max = HEADLINE_MAX): string {
  let t = clean(text).replace(/^\*\*|\*\*$/g, "");
  if (!t) return "";
  // First sentence (don't split on "Inc." / "U.S." style abbreviations).
  const m = /^(.+?[a-z0-9)”"'][.!?])\s+[A-Z“"]/.exec(t);
  if (m && m[1].length >= 25) t = m[1];
  t = t.replace(/[.\s]+$/, "");
  if (t.length <= max) return t;
  let cut = -1;
  for (const b of BOUNDARIES) {
    const i = t.indexOf(b);
    if (i >= 35 && i <= max && (cut < 0 || i < cut)) cut = i;
  }
  if (cut > 0) return t.slice(0, cut).replace(DANGLING, "").replace(/[,:;\s]+$/, "");
  const room = t.slice(0, max);
  const lastSpace = room.lastIndexOf(" ");
  const head = (lastSpace > 40 ? room.slice(0, lastSpace) : room).replace(DANGLING, "").replace(/[,:;\s—–-]+$/, "");
  return `${head}…`;
}

export interface HeadlineSource {
  /** Written headline (Signals "Headline" column / scan output). */
  headline?: string;
  /** Article or document title (awareness rows keep it in Subject). */
  title?: string;
  /** The stored signal sentence(s). */
  signal?: string;
  company?: string;
}

/**
 * The headline shown for a signal: the written headline, else a real article
 * title, else the lead fact of the signal text, shortened to one or two lines.
 */
export function cardHeadline(s: HeadlineSource): string {
  const company = clean(s.company);
  const written = clean(s.headline);
  // Written headlines get a little slack so a 95-character one isn't cut mid-phrase.
  if (written && !isLabelTitle(written, company)) return shortenHeadline(written, HEADLINE_MAX + 10);
  const title = clean(s.title);
  if (title && !isLabelTitle(title, company) && title.length <= 140) return shortenHeadline(title);
  const fact = shortenHeadline(s.signal || "");
  if (fact) return fact;
  return company ? `${company} update` : "Signal";
}

/** A model-written headline is usable when it's short, real text and not a label. */
export function acceptableHeadline(h: string, company = ""): string {
  const t = clean(h).replace(/^["“]|["”]$/g, "").replace(/\.$/, "");
  if (t.length < 12 || t.length > HEADLINE_MAX + 10) return "";
  if (isLabelTitle(t, company)) return "";
  return t;
}

const plain = (s: string) => clean(s).replace(/…$/, "").replace(/[.\s]+$/, "").toLowerCase();

/**
 * The summary line under a headline, without repeating it: "" when the summary
 * is just the headline; the rest of the text when the headline was cut from it.
 */
export function summaryBelowHeadline(summary: string, headline: string): string {
  const s = clean(summary);
  const h = plain(headline);
  if (!s || !h) return s;
  if (plain(s) === h) return "";
  if (s.toLowerCase().startsWith(h)) {
    const rest = s.slice(h.length).replace(/^[\s.,;:—–-]+/, "").trim();
    return rest.length >= 20 ? rest.charAt(0).toUpperCase() + rest.slice(1) : "";
  }
  return s;
}

/** Headline for a stored Signals row (recommendation Subjects are email subjects, not titles). */
export function storedHeadline(s: { type?: string; headline?: string; subject?: string; signal?: string; company?: string }): string {
  return cardHeadline({ headline: s.headline, title: s.type === "recommendation" ? "" : s.subject, signal: s.signal, company: s.company });
}

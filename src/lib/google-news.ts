// Pure helpers for the two Google news sources feeding the Signals scan:
// Google News RSS (headline feed) and Google-grounded Gemini search. Browser-
// safe and side-effect free so the parsing/attribution rules are unit-tested.

export interface GoogleNewsItem {
  company: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m);
}

/** True when `text` names `company` as a whole word/phrase (case-insensitive). */
export function namesCompany(text: string, company: string): boolean {
  const c = company.trim().toLowerCase();
  if (!c) return false;
  const esc = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i").test(text);
}

/** Google News RSS search URL for an OR-batch of exact company names. */
export function googleNewsRssUrl(names: string[], windowDays: number, context = ""): string {
  const days = Math.max(1, Math.min(30, Math.round(windowDays)));
  const who = names.map((n) => `"${n.replace(/"/g, "")}"`).join(" OR ");
  const q = `${context ? `(${who}) ${context}` : who} when:${days}d`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]!).trim() : "";
}

/**
 * Parse a Google News RSS feed into articles, keeping only items whose headline
 * names one of `companies` (OR-queries return loose matches) and that were
 * published within `windowDays` of `now`.
 */
export function parseGoogleNewsRss(
  xml: string,
  companies: string[],
  windowDays: number,
  now = Date.now(),
): GoogleNewsItem[] {
  const out: GoogleNewsItem[] = [];
  const cutoff = now - Math.max(1, windowDays) * 86_400_000;
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = m[1]!;
    const source = tag(block, "source");
    let title = tag(block, "title");
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    const url = tag(block, "link");
    if (!title || !/^https?:\/\//.test(url)) continue;
    const pub = Date.parse(tag(block, "pubDate"));
    if (Number.isFinite(pub) && pub < cutoff) continue;
    const company = companies.find((c) => namesCompany(title, c));
    if (!company) continue;
    out.push({
      company,
      title,
      description: title,
      url,
      source,
      publishedAt: Number.isFinite(pub) ? new Date(pub).toISOString() : "",
    });
  }
  return out;
}

/** Prompt for one grounded-search batch; answers come back one story per line. */
export function groundedNewsPrompt(names: string[], windowDays: number, mode: "companies" | "topics"): string {
  const subject =
    mode === "topics"
      ? `about these subjects (name the real company each story is about): ${names.join("; ")}`
      : `about these companies: ${names.join("; ")}`;
  return (
    `Search Google News for notable news published in the last ${windowDays} days ${subject}.\n` +
    `Look for funding, acquisitions, product launches, partnerships, customer wins, leadership changes, security incidents and strategy shifts.\n` +
    `List one story per line exactly as: Company | Headline | YYYY-MM-DD | one-sentence factual summary\n` +
    `Use the company name exactly as written above. Only real, dated stories from the search results — skip a company with no news. No other text.`
  );
}

export interface GroundedLine {
  company: string;
  title: string;
  date: string;
  summary: string;
  /** Indexes into the grounding chunks backing this line. */
  chunks: number[];
}

/**
 * Turn a grounded answer into stories. A line is kept only when Google tied it
 * to at least one search result (no source = possibly invented) and, in
 * company mode, it names one of the batch's companies.
 */
export function parseGroundedLines(
  text: string,
  supports: Array<{ text: string; chunks: number[] }>,
  names: string[],
  mode: "companies" | "topics",
): GroundedLine[] {
  const out: GroundedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[\s*\-•\d.]+(?=\S)/, "").trim();
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 4) continue;
    const [who, title, date, ...rest] = parts as [string, string, string, ...string[]];
    const summary = rest.join(" | ").trim();
    if (!who || !title || /^company$/i.test(who)) continue;
    let company = who;
    if (mode === "companies") {
      const hit = names.find((n) => n.toLowerCase() === who.toLowerCase()) || names.find((n) => namesCompany(who, n));
      if (!hit) continue;
      company = hit;
    }
    const chunks = new Set<number>();
    for (const s of supports) {
      const seg = s.text.trim();
      if (seg.length >= 12 && (line.includes(seg) || seg.includes(title))) s.chunks.forEach((i) => chunks.add(i));
    }
    if (chunks.size === 0) continue;
    out.push({
      company,
      title,
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
      summary,
      chunks: [...chunks].sort((a, b) => a - b),
    });
  }
  return out;
}

/** Lowercase letters/digits only — "Fly.io" → "flyio", "Bland AI" → "blandai". */
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Pick the source URL for a story from its resolved Google sources (in
 * Google's order). A source whose address names the company wins (its own
 * site or an article slug with its name); otherwise Google's first source,
 * skipping bare home pages. Longest-path picking chose off-topic pages.
 */
export function pickArticleUrl(urls: string[], company = ""): string {
  const name = slug(company.replace(/\b(inc|corp|ai|labs|security|systems|technologies)\b\.?/gi, "")) || slug(company);
  const parsed: Array<{ url: string; hay: string; path: string }> = [];
  for (const u of urls) {
    try {
      const x = new URL(u);
      if (!/^https?:$/.test(x.protocol)) continue;
      parsed.push({ url: u, hay: slug(x.hostname + x.pathname), path: x.pathname.replace(/\/+$/, "") });
    } catch {
      /* skip */
    }
  }
  if (name.length >= 3) {
    const named = parsed.filter((p) => p.hay.includes(name));
    const article = named.find((p) => p.path.split("/").filter(Boolean).length >= 2) || named[0];
    if (article) return article.url;
  }
  return (parsed.find((p) => p.path.length > 1) || parsed[0])?.url || "";
}

/** Narrows Google News for big employers to technology and major business moves. */
export const ENTERPRISE_NEWS_CONTEXT =
  "(AI OR technology OR cloud OR cybersecurity OR acquisition OR acquires OR partnership OR launches OR CIO OR CTO OR CISO)";

/** Rotating slice of `items` so long lists are all covered over a few days. */
export function dailySlice<T>(items: T[], size: number, day: number): T[] {
  if (items.length <= size) return items;
  const start = (day * size) % items.length;
  return [...items.slice(start), ...items.slice(0, start)].slice(0, size);
}

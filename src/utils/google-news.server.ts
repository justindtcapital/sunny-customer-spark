// Google news sources for the Signals scan — used up front on every scan:
//   1. Google News RSS: free headline search, real publisher links via Google.
//   2. Google-grounded Gemini search: Gemini reads live Google results and we
//      keep only stories Google tied to a source, resolved to the real article.
// Both return the shared NewsArticle shape and degrade to [] on failure.

import { groundedSearch, isGeminiConfigured } from "./gemini.server";
import { articleUrlKey, uniqueSearchNames, type NewsArticle } from "./news.server";
import {
  dailySlice,
  googleNewsRssUrl,
  groundedNewsPrompt,
  parseGoogleNewsRss,
  parseGroundedLines,
  pickArticleUrl,
} from "@/lib/google-news";

function dedupe(items: NewsArticle[], max: number): NewsArticle[] {
  const seen = new Set<string>();
  const out: NewsArticle[] = [];
  for (const a of items.sort((x, y) => (y.publishedAt > x.publishedAt ? 1 : -1))) {
    const k = articleUrlKey(a.url);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out.slice(0, max);
}

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Google News RSS for the given names (OR-batched, a few requests at a time). */
export async function fetchGoogleNewsRss(
  companies: string[],
  windowDays: number,
  opts?: { batchSize?: number; max?: number; context?: string },
): Promise<NewsArticle[]> {
  const batches = chunked(uniqueSearchNames(companies), opts?.batchSize ?? 8);
  const out: NewsArticle[] = [];
  let blocked = false;
  for (const group of chunked(batches, 4)) {
    if (blocked) break;
    const results = await Promise.all(
      group.map(async (batch) => {
        try {
          const res = await fetch(googleNewsRssUrl(batch, windowDays, opts?.context), {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; VenturePulse/1.0)", Accept: "application/rss+xml" },
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) {
            if (res.status === 429 || res.status === 503) blocked = true;
            console.error(`[google-news] rss ${res.status}`);
            return [];
          }
          return parseGoogleNewsRss(await res.text(), batch, windowDays);
        } catch (e) {
          console.error("[google-news] rss failed:", e);
          return [];
        }
      }),
    );
    for (const r of results) out.push(...r);
  }
  return dedupe(out, opts?.max ?? 80);
}

async function resolveRedirect(uri: string): Promise<string> {
  if (!uri) return "";
  if (!/grounding-api-redirect/.test(uri)) return uri;
  try {
    const res = await fetch(uri, { redirect: "manual", signal: AbortSignal.timeout(8_000) });
    return res.headers.get("location") || "";
  } catch {
    return "";
  }
}

/**
 * Google-grounded search: Gemini answers from live Google results, one story
 * per line; a story is kept only with a Google source, resolved to the real
 * article URL. Long name lists rotate daily (`maxBatches` per run).
 */
export async function fetchGoogleSearchNews(
  names: string[],
  windowDays: number,
  opts?: { mode?: "companies" | "topics"; batchSize?: number; maxBatches?: number; max?: number },
): Promise<NewsArticle[]> {
  if (!isGeminiConfigured()) return [];
  const mode = opts?.mode ?? "companies";
  const size = opts?.batchSize ?? 12;
  const maxBatches = opts?.maxBatches ?? 8;
  const uniq = uniqueSearchNames(names);
  const day = Math.floor(Date.now() / 86_400_000);
  const todays = dailySlice(uniq, size * maxBatches, day);
  const out: NewsArticle[] = [];
  for (const batch of chunked(todays, size)) {
    const r = await groundedSearch(groundedNewsPrompt(batch, windowDays, mode));
    if (!r.ok) {
      console.error("[google-search-news] batch failed:", r.error);
      if (/quota|per day|expired|not configured/i.test(r.error)) break;
      continue;
    }
    const { text, chunks, supports } = r.result;
    const lines = parseGroundedLines(text, supports, batch, mode);
    const resolved = new Map<number, string>();
    await Promise.all(
      [...new Set(lines.flatMap((l) => l.chunks))].map(async (i) => {
        resolved.set(i, await resolveRedirect(chunks[i]?.uri || ""));
      }),
    );
    for (const l of lines) {
      const url = pickArticleUrl(l.chunks.map((i) => resolved.get(i) || "").filter(Boolean), l.company);
      if (!url) continue;
      let source = "";
      try {
        source = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        /* ignore */
      }
      out.push({
        company: l.company,
        title: l.title,
        description: l.summary.slice(0, 300),
        url,
        source,
        publishedAt: l.date,
      });
    }
  }
  return dedupe(out, opts?.max ?? 80);
}

// Enterprise watch: which network companies the daily scan checks for technology
// and significant business announcements. Pure — safe to unit test.
// Companies come from the employers of rated network people at the watched
// levels; PortCos (scanned separately), Dell and non-companies are left out.
import type { Contact, Temperature } from "@/lib/types";
import { ratedLevel } from "@/lib/contact-kind";
import { isDellContact } from "@/lib/dell-contacts";
import { isPortCoContact, portcoKeys } from "@/lib/portco-contacts";

export const WATCH_LEVELS: Temperature[] = ["Council", "Hot", "Warm"];
/** Companies checked per daily run; the list rotates so each gets its turn. */
export const WATCH_BATCH_SIZE = 20;

const WEIGHT: Partial<Record<Temperature, number>> = { Council: 3, Hot: 2, Warm: 1 };

// Free-text "companies" that aren't an organisation with news of its own.
const NOT_A_COMPANY = new Set([
  "", "self", "self employed", "selfemployed", "independent", "freelance", "freelancer",
  "consultant", "consulting", "advisor", "adviser", "stealth", "stealth startup",
  "stealth mode", "retired", "none", "na", "n a", "unknown", "tbd", "confidential", "private",
]);

// Investors aren't the enterprise logos this watch is for (their news is rarely
// about them). "Capital" alone isn't enough — Capital One is a bank.
const INVESTOR_RE = /\b(ventures?|venture capital|vc|investments?|investors?|private equity|angels?|fund|funds)\b/;

const SUFFIX_RE = /\b(incorporated|inc|corp|corporation|llc|ltd|limited|plc|co|company|gmbh|ag|sa|bv|nv|lp|llp)\b/g;

/** Grouping key so "NVIDIA", "Nvidia Corp." and "NVIDIA Corporation" are one company. */
export function companyKey(name?: string): string {
  return (name || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(SUFFIX_RE, " ").replace(/\s+/g, " ").trim();
}

export interface WatchCompany {
  name: string;
  council: number;
  hot: number;
  warm: number;
  /** Council ×3, Hot ×2, Warm ×1 — ranks who gets checked first. */
  score: number;
}

export function enterpriseWatchList(
  contacts: Contact[],
  opts: { portcoNames: string[]; levels?: Temperature[] },
): WatchCompany[] {
  const levels = new Set(opts.levels ?? WATCH_LEVELS);
  const keys = portcoKeys(opts.portcoNames);
  const groups = new Map<string, { spellings: Map<string, number>; council: number; hot: number; warm: number }>();
  for (const c of contacts) {
    const level = ratedLevel(c);
    if (!level || !levels.has(level)) continue;
    const name = (c.company || "").trim();
    const key = companyKey(name);
    if (NOT_A_COMPANY.has(key) || key.length < 2 || INVESTOR_RE.test(key)) continue;
    if (isDellContact(c) || isPortCoContact(c, keys)) continue;
    const g = groups.get(key) ?? { spellings: new Map(), council: 0, hot: 0, warm: 0 };
    g.spellings.set(name, (g.spellings.get(name) ?? 0) + 1);
    if (level === "Council") g.council++;
    else if (level === "Hot") g.hot++;
    else if (level === "Warm") g.warm++;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => {
      const name = [...g.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      const score = g.council * (WEIGHT.Council ?? 0) + g.hot * (WEIGHT.Hot ?? 0) + g.warm * (WEIGHT.Warm ?? 0);
      return { name, council: g.council, hot: g.hot, warm: g.warm, score };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** Today's slice of the ranked list; consecutive days walk through every company. */
export function todaysWatchBatch<T>(list: T[], opts: { now: number; batchSize?: number }): T[] {
  const size = Math.max(1, opts.batchSize ?? WATCH_BATCH_SIZE);
  if (list.length <= size) return list;
  const batches = Math.ceil(list.length / size);
  const day = Math.floor(opts.now / 86_400_000);
  const i = ((day % batches) + batches) % batches;
  return list.slice(i * size, i * size + size);
}

/**
 * A scan story belongs in the enterprise watch only when it is about one of the
 * watched companies (or a PortCo) and actually names it — the model sometimes
 * files a story under the employer of the person it suggests, e.g. NVIDIA news
 * under a VC firm, which this drops.
 */
export function isWatchedStory(
  story: { company?: string; text: string },
  opts: { watchNames: string[]; portcoNames: string[] },
): boolean {
  const key = companyKey(story.company);
  if (!key) return false;
  const known = [...opts.watchNames, ...opts.portcoNames].some((n) => companyKey(n) === key);
  return known && storyNamesCompany(story);
}

/** The story text names the company it is filed under (full name or its first word). */
export function storyNamesCompany(story: { company?: string; text: string }): boolean {
  const key = companyKey(story.company);
  if (!key) return false;
  const text = ` ${companyKey(story.text)} `;
  const first = key.split(" ")[0];
  return text.includes(` ${key} `) || (first.length >= 3 && text.includes(` ${first} `));
}

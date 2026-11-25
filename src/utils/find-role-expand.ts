// Normalize Apollo people-search role & seniority criteria.
// Apollo evaluates `person_titles` as OR and intersects it with `person_seniorities` (AND).
// Never inject generic seniority titles (CEO, CISO, VP, Director…) into `person_titles`:
// doing so drowns out specific job functions like "Supply Chain" with unrelated executives.

/** Apollo person_seniorities keys, most-senior → least (matches Find chips). */
export const SENIORITY_ORDER = [
  "owner",
  "founder",
  "c_suite",
  "partner",
  "vp",
  "head",
  "director",
  "manager",
  "senior",
  "entry",
  "intern",
] as const;

export type ApolloSeniority = (typeof SENIORITY_ORDER)[number];

/** UI job-level checkboxes (Campaigns / Prospects) → Apollo person_seniorities. */
export const JOB_LEVEL_SENIORITIES: Record<string, readonly ApolloSeniority[]> = {
  "C-Suite": ["c_suite"],
  SVP: ["vp"],
  VP: ["vp", "head"],
  Director: ["director"],
  Manager: ["manager"],
};

/** Split comma/semicolon-separated role/function terms, trimming and deduping. */
export function parseRoleTerms(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    for (const part of entry.split(/[,;]/)) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

/**
 * Keep selected Apollo seniority levels exact, only adding "head" when "vp" is
 * picked (many orgs title their VP-level leader "Head of …"). Never expands
 * downward into more-numerous tiers like "manager", which otherwise crowd out
 * Director/VP/C-Suite results.
 */
export function expandSeniorities(selected: string[]): string[] {
  const out = new Set<string>();
  for (const key of selected) {
    const clean = key.trim();
    if (!clean) continue;
    out.add(clean);
    if (clean === "vp") out.add("head");
  }
  return [...out];
}

/**
 * Keep `titles` strictly to user-entered role/function terms and preserve the
 * selected Apollo seniority levels (including "head" alongside "vp"). Empty inputs stay empty.
 */
export function expandFindRoleQuery(input: {
  titles?: string[];
  seniorities?: string[];
}): { titles: string[]; seniorities: string[] } {
  const titles = parseRoleTerms(input.titles || []);
  const selected = (input.seniorities || []).map((s) => s.trim()).filter(Boolean);
  const seniorities = expandSeniorities(selected);
  return { titles, seniorities };
}

/**
 * Build Apollo search parameters from Campaigns/Prospects job-level checkboxes
 * and role/function text without polluting `person_titles` with generic C-suite titles.
 */
export function buildApolloAttributeQuery(input: {
  jobLevels?: string[];
  jobFunctions?: string[];
}): { titles: string[]; seniorities: string[] } {
  const titles = parseRoleTerms(input.jobFunctions || []);
  const seniorities = [
    ...new Set(
      (input.jobLevels || []).flatMap((level) => JOB_LEVEL_SENIORITIES[level] || []),
    ),
  ];
  return { titles, seniorities };
}

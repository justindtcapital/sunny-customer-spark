// Pure, browser-safe helpers for the campaign "Build list" audience pickers:
// pick many PortCos (by domain / market / search) and resolve their people,
// or refine Network & Prospecting by tier, domain, market, seniority and company.
import { domainCategory, DOMAIN_CATEGORIES } from "@/lib/types";
import { companyDomainMap, normalizeDomain } from "@/lib/company-domains";
import { portcoKeys } from "@/lib/portco-contacts";
import { marketFor, type Market } from "@/lib/network-pyramid";

// ── Roles / seniority from a free-text title ──────────────────────────

export const ROLE_GROUPS = ["Founders & C-suite", "Sales & GTM", "Everyone else"] as const;
export type RoleGroup = (typeof ROLE_GROUPS)[number];

// "Vice President" is not a president; strip it before the leadership test.
const stripVp = (t: string) => (t || "").replace(/\b(senior |executive |associate )?vice[- ]president\b/gi, "vp");
const LEADER =
  /\b(co-?founder|founder|ceo|cto|cfo|coo|cro|cmo|cpo|ciso|cio|cso|chief|president|owner|managing (director|partner)|general partner)\b/i;
const GTM =
  /\b(sales|revenue|gtm|go[- ]to[- ]market|business development|bd|bdr|sdr|partnerships?|alliances?|channel|account (executive|manager|director)|marketing|commercial|customer success|growth)\b/i;

/** Which role group a PortCo person's title falls into (leadership wins over GTM). */
export function roleGroupOf(title: string): RoleGroup {
  const t = stripVp(title);
  if (LEADER.test(t)) return "Founders & C-suite";
  if (GTM.test(t)) return "Sales & GTM";
  return "Everyone else";
}

export const SENIORITIES = ["C-suite", "VP", "Director", "Manager", "Other"] as const;
export type Seniority = (typeof SENIORITIES)[number];

export function seniorityOf(title: string): Seniority {
  const t = stripVp(title);
  if (LEADER.test(t)) return "C-suite";
  if (/\b(vp|svp|evp|avp|head of)\b/i.test(t)) return "VP";
  if (/\bdirector\b/i.test(t)) return "Director";
  if (/\b(manager|lead)\b/i.test(t)) return "Manager";
  return "Other";
}

// ── Portfolio companies ──────────────────────────────────────────────

export const PORTCO_DOMAINS = [...DOMAIN_CATEGORIES, "Other"] as const;

export interface PortcoLike {
  name: string;
  domain: string;
  location?: string;
  website?: string;
  domainAliases?: string[];
}

export interface PortcoFilter {
  search: string;
  /** Shared domain categories (empty = all). */
  domains: string[];
  /** Markets from the company location (empty = all). */
  markets: string[];
}

export const portcoDomainOf = (c: Pick<PortcoLike, "domain">) => domainCategory(c.domain);
export const portcoMarketOf = (c: Pick<PortcoLike, "location">): Market => marketFor(c.location);

export function filterPortcos<T extends PortcoLike>(companies: T[], f: PortcoFilter): T[] {
  const s = f.search.trim().toLowerCase();
  return companies.filter(
    (c) =>
      (!s || c.name.toLowerCase().includes(s)) &&
      (!f.domains.length || f.domains.includes(portcoDomainOf(c))) &&
      (!f.markets.length || f.markets.includes(portcoMarketOf(c))),
  );
}

const compact = (s: string) => (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

/**
 * People on record at each PortCo: an email on the company's website domain or a verified
 * alias, or a Company field matching the PortCo name. Each person is listed under one PortCo.
 */
export function portcoPeopleIndex<P extends { email?: string; company?: string }>(
  companies: PortcoLike[],
  people: P[],
): Map<string, P[]> {
  const byDomain = new Map<string, string>();
  const byKey = new Map<string, string>();
  for (const c of companies) {
    for (const d of companyDomainMap(c).keys()) if (!byDomain.has(d)) byDomain.set(d, c.name);
    for (const k of portcoKeys([c.name])) if (!byKey.has(k)) byKey.set(k, c.name);
  }
  const out = new Map<string, P[]>(companies.map((c) => [c.name, []]));
  for (const p of people) {
    let hit: string | undefined;
    for (const e of (p.email || "").split(/[;,\s]+/)) {
      const d = normalizeDomain(e);
      if (d && byDomain.has(d)) { hit = byDomain.get(d); break; }
    }
    if (!hit) {
      const co = p.company || "";
      hit = byKey.get(compact(co)) || byKey.get(compact(co.replace(/\s*(,?\s*(inc|llc|ltd|corp|corporation|co|company|technologies|labs|ai|hq|group)\.?)+$/i, "")));
    }
    if (hit) out.get(hit)?.push(p);
  }
  return out;
}

/** Keep people whose title is in one of the chosen role groups (empty = everyone). */
export function filterByRoles<P extends { title: string }>(people: P[], roles: RoleGroup[]): P[] {
  return roles.length ? people.filter((p) => roles.includes(roleGroupOf(p.title))) : people;
}

// ── Network & Prospecting refinement ────────────────────────────────

export interface AudiencePerson {
  name: string;
  company: string;
  email: string;
  title: string;
  /** Council/Hot/Warm/Cold/Prospect, or "PortCo" for unrated PortCo people. */
  tier: string;
  domain: string;
  market: string;
  seniority: Seniority;
}

export interface NetworkFilter {
  search: string;
  title: string;
  tiers: string[];
  domains: string[];
  markets: string[];
  seniority: string[];
  companies: string[];
}

export const EMPTY_NETWORK_FILTER: NetworkFilter = {
  search: "", title: "", tiers: [], domains: [], markets: [], seniority: [], companies: [],
};

export type NetworkFacet = "tiers" | "domains" | "markets" | "seniority" | "companies";
const FACET_FIELD: Record<NetworkFacet, (p: AudiencePerson) => string> = {
  tiers: (p) => p.tier,
  domains: (p) => p.domain,
  markets: (p) => p.market,
  seniority: (p) => p.seniority,
  companies: (p) => p.company.trim(),
};

function matches(p: AudiencePerson, f: NetworkFilter, skip?: NetworkFacet): boolean {
  const s = f.search.trim().toLowerCase();
  if (s && !`${p.name} ${p.company} ${p.email}`.toLowerCase().includes(s)) return false;
  const ti = f.title.trim().toLowerCase();
  if (ti && !p.title.toLowerCase().includes(ti)) return false;
  for (const facet of Object.keys(FACET_FIELD) as NetworkFacet[]) {
    if (facet === skip || !f[facet].length) continue;
    const v = FACET_FIELD[facet](p);
    if (facet === "companies" ? !f.companies.some((c) => c.toLowerCase() === v.toLowerCase()) : !f[facet].includes(v)) return false;
  }
  return true;
}

export function filterAudience<P extends AudiencePerson>(people: P[], f: NetworkFilter): P[] {
  return people.filter((p) => matches(p, f));
}

/** Counts per value of one facet, given every other active filter (so chips show what you'd get). */
export function facetCounts(people: AudiencePerson[], f: NetworkFilter, facet: NetworkFacet): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of people) {
    if (!matches(p, f, facet)) continue;
    const v = FACET_FIELD[facet](p);
    if (v) out.set(v, (out.get(v) || 0) + 1);
  }
  return out;
}

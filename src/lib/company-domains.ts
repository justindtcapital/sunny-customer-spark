// Company ↔ contact domain matching. Pure — safe to unit test.
// Links are exact (website domain or a human-verified alias); similar domains are
// only ever suggestions, and shared mail providers never link anyone.

import { GENERIC_EMAIL_DOMAINS } from "./domain-utils";

const SHARED_PROVIDERS = new Set([
  ...GENERIC_EMAIL_DOMAINS,
  "yahoo.co.uk", "hotmail.co.uk", "outlook.co.uk", "btinternet.com", "comcast.net",
  "att.net", "verizon.net", "sbcglobal.net", "qq.com", "163.com", "mac.com",
  "zoho.com", "fastmail.com", "pm.me", "web.de", "yandex.com", "mail.ru", "rocketmail.com",
]);

// Two-part public suffixes where the company name sits one label further left.
const TWO_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk",
  "com.au", "net.au", "org.au", "co.nz", "co.jp", "ne.jp", "co.kr", "co.in", "co.il",
  "co.za", "com.br", "com.mx", "com.sg", "com.hk", "com.cn", "com.tw", "com.tr", "com.ar",
]);

/**
 * Normalize a website URL, bare domain or email address to its registrable domain:
 * lowercase, no protocol/www/path/port/trailing dot, subdomains collapsed
 * (mail.acme.com → acme.com, eu.acme.co.uk → acme.co.uk). Null when unusable.
 */
export function normalizeDomain(input?: string | null): string | null {
  let v = (input || "").trim().toLowerCase();
  if (!v) return null;
  if (v.includes("@")) v = v.slice(v.lastIndexOf("@") + 1);
  v = v.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.+$/, "").replace(/^www\d*\./, "");
  if (!/^[a-z0-9.-]+$/.test(v) || !v.includes(".")) return null;
  const parts = v.split(".").filter(Boolean);
  if (parts.length < 2) return null;
  const lastTwo = parts.slice(-2).join(".");
  const keep = TWO_PART_SUFFIXES.has(lastTwo) ? 3 : 2;
  if (parts.length < keep) return null;
  return parts.slice(-keep).join(".");
}

export function isSharedEmailDomain(domain?: string | null): boolean {
  const d = normalizeDomain(domain);
  return !d || SHARED_PROVIDERS.has(d);
}

/** Parse "a.com, b.io; c.ai" (or a list) into unique normalized domains. */
export function parseDomainList(input?: string | string[] | null): string[] {
  const raw = Array.isArray(input) ? input : (input || "").split(/[\s,;|]+/);
  const out: string[] = [];
  for (const r of raw) {
    const d = normalizeDomain(r);
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

export interface DomainOwner { name: string; website?: string; domainAliases?: string[] }

/** domain → "website" | "alias" for one company. Shared providers are dropped. */
export function companyDomainMap(c: DomainOwner): Map<string, "website" | "alias"> {
  const map = new Map<string, "website" | "alias">();
  const site = normalizeDomain(c.website);
  if (site && !isSharedEmailDomain(site)) map.set(site, "website");
  for (const a of parseDomainList(c.domainAliases)) {
    if (!map.has(a) && !isSharedEmailDomain(a)) map.set(a, "alias");
  }
  return map;
}

export interface AliasCheck { accepted: string[]; rejected: { domain: string; reason: string }[] }

/** Validate proposed aliases: no shared providers, no duplicates of the website, no domain owned by another company. */
export function validateDomainAliases(
  proposed: string | string[],
  self: DomainOwner,
  others: DomainOwner[],
): AliasCheck {
  const out: AliasCheck = { accepted: [], rejected: [] };
  const site = normalizeDomain(self.website);
  const selfKey = self.name.trim().toLowerCase();
  for (const d of parseDomainList(proposed)) {
    if (isSharedEmailDomain(d)) { out.rejected.push({ domain: d, reason: "shared email provider — can't identify a company" }); continue; }
    if (d === site) continue; // already the website domain
    const owner = others.find((o) => o.name.trim().toLowerCase() !== selfKey && companyDomainMap(o).has(d));
    if (owner) { out.rejected.push({ domain: d, reason: `already belongs to ${owner.name}` }); continue; }
    out.accepted.push(d);
  }
  return out;
}

export interface LinkedPerson<T> { contact: T; domain: string; via?: string }

/** Contacts whose email matches the website domain or a verified alias. `via` is set for alias matches. */
export function linkContactsByDomain<T extends { email?: string }>(contacts: T[], company: DomainOwner): LinkedPerson<T>[] {
  const map = companyDomainMap(company);
  if (!map.size) return [];
  const out: LinkedPerson<T>[] = [];
  for (const c of contacts) {
    for (const e of (c.email || "").split(/[;,\s]+/)) {
      const d = normalizeDomain(e);
      const kind = d ? map.get(d) : undefined;
      if (d && kind) { out.push({ contact: c, domain: d, via: kind === "alias" ? d : undefined }); break; }
    }
  }
  return out;
}

const compact = (s: string) => (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const SUFFIX = /\s*(,?\s*(inc|llc|ltd|corp|corporation|co|company|technologies|technology|labs|hq|group)\.?)+$/i;
const label = (d: string) => compact(d.split(".")[0]);

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

function similarLabel(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return a === b;
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a)) return true;
  return Math.min(a.length, b.length) >= 5 && editDistance(a, b) <= 1;
}

export interface DomainSuggestion<T> { domain: string; reason: "similar domain" | "company name"; contacts: T[] }

/**
 * Review-only suggestions: unlinked contact domains that look like this company
 * (similar domain label, or the contact's company name matches). Never links anything.
 */
export function suggestDomainMatches<T extends { email?: string; company?: string }>(
  contacts: T[],
  company: DomainOwner & { dismissedDomains?: string[] },
  others: DomainOwner[] = [],
): DomainSuggestion<T>[] {
  const linked = companyDomainMap(company);
  const dismissed = new Set(parseDomainList(company.dismissedDomains));
  const owned = new Set<string>();
  for (const o of others) if (o.name !== company.name) for (const d of companyDomainMap(o).keys()) owned.add(d);
  const labels = [...linked.keys()].map(label);
  const nameKeys = [compact(company.name), compact(company.name.replace(SUFFIX, ""))].filter((k) => k.length >= 3);
  if (nameKeys.length) labels.push(...nameKeys);
  const byDomain = new Map<string, DomainSuggestion<T>>();
  for (const c of contacts) {
    const d = normalizeDomain((c.email || "").split(/[;,\s]+/)[0]);
    if (!d || linked.has(d) || dismissed.has(d) || owned.has(d) || isSharedEmailDomain(d)) continue;
    const co = compact(c.company || ""), coBare = compact((c.company || "").replace(SUFFIX, ""));
    let reason: DomainSuggestion<T>["reason"] | null = null;
    if (labels.some((l) => similarLabel(label(d), l))) reason = "similar domain";
    else if (co && nameKeys.some((k) => k === co || k === coBare)) reason = "company name";
    if (!reason) continue;
    const s = byDomain.get(d) || { domain: d, reason, contacts: [] };
    s.contacts.push(c);
    byDomain.set(d, s);
  }
  return [...byDomain.values()].sort((a, b) => b.contacts.length - a.contacts.length || a.domain.localeCompare(b.domain));
}

/** Existing company that a new company would duplicate: same name, website domain or alias. */
export function findCompanyClash<T extends DomainOwner>(
  existing: T[],
  candidate: DomainOwner,
): { company: T; reason: string } | null {
  const nameKey = compact(candidate.name.replace(SUFFIX, ""));
  const wanted = companyDomainMap(candidate);
  for (const c of existing) {
    if (nameKey && compact(c.name.replace(SUFFIX, "")) === nameKey) return { company: c, reason: "same name" };
    const theirs = companyDomainMap(c);
    for (const d of wanted.keys()) if (theirs.has(d)) return { company: c, reason: `uses ${d}` };
  }
  return null;
}

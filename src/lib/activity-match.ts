// Heuristic matching of Asana BD/GTM activities to CRM records. Activities carry
// free-text company/person strings (parsed from Asana custom fields or the task
// name), so matching is name/email-substring based rather than keyed.

import type { AsanaActivity, Contact } from "@/lib/types";

const norm = (s?: string) => (s || "").trim().toLowerCase();

// Every whole email address appearing in a text blob, lowercased. Used for
// token-exact contact joins instead of substring containment.
export function addressTokens(text?: string): string[] {
  return ((text || "").toLowerCase().match(/[^\s<>;,"']+@[^\s<>;,"']+/g) || []).map((t) =>
    t.replace(/[.,;:]+$/, ""),
  );
}

// The Portfolio Company field can tag several companies ("Maven, Comcast"); split
// it into normalized whole names so matching is exact per-name — never a substring
// (which would wrongly match "Mave" against "Maven").
export function taggedCompanies(a: AsanaActivity): string[] {
  return (a.company || "")
    .split(/[;,/|]/)
    .map((s) => norm(s))
    .filter(Boolean);
}

// An activity belongs to a contact when it names the person (a person field equals
// the contact name, or the task text mentions their full name or email), OR when
// the contact works at the company the activity is tagged to (e.g. GTM tasks carry
// only a Portfolio Company field — those surface on that company's people).
export function matchActivitiesToContact(
  activities: AsanaActivity[],
  contact: Contact,
): AsanaActivity[] {
  const name = norm(contact.name);
  const emails = (contact.email || "")
    .split(";")
    .map((e) => norm(e))
    .filter(Boolean);
  const company = norm(contact.company);
  if (!name && emails.length === 0 && !company) return [];
  return activities.filter((a) => {
    const gmailSourced = a.gid.startsWith("gmail-");
    const hay = `${a.name} ${a.notes || ""} ${a.person || ""} ${a.url || ""}`.toLowerCase();

    // Gmail BD/GTM rows always carry exact counterparty emails on the notes
    // "People:" line. Compare WHOLE addresses (token-exact) — a raw substring
    // check let jo@x.com match inside jjo@x.com.
    if (gmailSourced) {
      const tokens = new Set(addressTokens(a.notes));
      return emails.some((e) => e && tokens.has(e));
    }


    if (name && norm(a.person) === name) return true;
    // Person named in the task title/notes (full name or email — specific enough).
    if (name && name.length > 3 && hay.includes(name)) return true;
    if (emails.some((e) => e && hay.includes(e))) return true;
    // Contact works at a company the activity is tagged to (exact, per-name).
    // Never company-fan-out for Gmail (handled above); Asana GTM often only tags company.
    if (company && taggedCompanies(a).includes(company)) return true;
    return false;
  });
}

// Targets are pre-CRM prospects: match only on the person (whole email address,
// or full name in the task text). No company fan-out — a target should never
// inherit every activity tagged to their employer.
export function matchActivitiesToTarget(
  activities: AsanaActivity[],
  target: { name?: string; email?: string },
): AsanaActivity[] {
  const name = norm(target.name);
  const emails = (target.email || "")
    .split(/[;,]/)
    .map((e) => norm(e))
    .filter((e) => e.includes("@"));
  if (!name && emails.length === 0) return [];
  return activities.filter((a) => {
    const tokens = new Set(addressTokens(`${a.notes || ""} ${a.name} ${a.person || ""}`));
    if (emails.some((e) => tokens.has(e))) return true;
    if (a.gid.startsWith("gmail-")) return false; // email is the only safe join
    if (name && norm(a.person) === name) return true;
    const hay = `${a.name} ${a.notes || ""} ${a.person || ""}`.toLowerCase();
    return Boolean(name && name.length > 3 && hay.includes(name));
  });
}

// An activity belongs to a company/PortCo when its company field matches, or the
// task text mentions the company name.
export function matchActivitiesToCompany(
  activities: AsanaActivity[],
  companyName: string,
): AsanaActivity[] {
  const co = norm(companyName);
  if (!co || co.length < 2) return [];
  return activities.filter((a) => {
    if (taggedCompanies(a).includes(co)) return true;
    if (co.length < 3) return false;
    const hay = `${a.name} ${a.notes || ""} ${a.company || ""}`.toLowerCase();
    return hay.includes(co);
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `key` appears in `hay` as its own token — not as a prefix/substring
 * of a longer word. Prevents portfolio "Mave" matching subject "Maven".
 */
export function portcoNameMentioned(hay: string, key: string): boolean {
  const k = norm(key);
  if (!k || k.length < 3) return false;
  // Allow soft boundaries: start/end, whitespace, or punctuation (/, -, :, etc.).
  const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(k)}(?=[^a-z0-9]|$)`, "i");
  return re.test(hay || "");
}

/**
 * Resolve which portfolio companies an activity mentions — from the Asana/Gmail
 * company field and from name/notes text. Returns canonical PortCo display names
 * (preferring the longest match first so "Maven AGI" beats "Maven").
 */
export function resolvePortcosMentioned(a: AsanaActivity, portfolioNames: string[]): string[] {
  if (!portfolioNames.length) return [];
  // Longest first so nested names resolve to the more specific PortCo.
  const sorted = [...portfolioNames]
    .map((n) => ({ raw: n, key: norm(n) }))
    .filter((p) => p.key.length >= 3)
    .sort((x, y) => y.key.length - x.key.length);

  const tagged = new Set(taggedCompanies(a));
  const hay = `${a.name} ${a.notes || ""} ${a.company || ""}`.toLowerCase();
  const found: string[] = [];
  const claimed = new Set<string>();

  for (const p of sorted) {
    if (claimed.has(p.key)) continue;
    // Exact tag on the company field, or token-boundary mention in text.
    const hit = tagged.has(p.key) || portcoNameMentioned(hay, p.key);
    if (!hit) continue;
    found.push(p.raw);
    claimed.add(p.key);
    // Also claim shorter PortCo keys that are prefixes of this match so a
    // tagged "Maven" row never also picks up a stray "Mave" portfolio entry.
    for (const other of sorted) {
      if (other.key !== p.key && p.key.startsWith(other.key)) claimed.add(other.key);
    }
  }
  return found;
}

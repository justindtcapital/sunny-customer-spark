// Canonicalize BD/GTM activities against the CRM before they are displayed or
// written to sheets.
//
// Two problems this fixes:
//   * Person was whatever the mail headers happened to say ("Falloon, Chris"),
//     even when the address exactly matches a Contact whose canonical name is
//     "Chris Falloon" — the sheet and the contact page then disagreed.
//   * Company was title-cased from the sender's email domain, so a thread about
//     MaxIQ's Dell pursuit was filed under "Dell" because a Dell teammate sent it.
//
// Company precedence: portfolio/target name found in subject+notes → CRM company
// of the matched counterparty → counterparty email domain (last resort).

import type { AsanaActivity, Contact } from "./types";
import { resolvePortcosMentioned } from "./activity-match";

const norm = (s?: string) => (s || "").trim().toLowerCase();

/** Emails listed on the machine-readable "People:" line of a synced note. */
export function peopleEmailsFromNotes(notes?: string): string[] {
  const line = (notes || "")
    .split("\n")
    .find((l) => /^people\s*:/i.test(l.trim()));
  if (!line) return [];
  return line
    .replace(/^\s*people\s*:/i, "")
    .split(/[;,]/)
    .map((chunk) => {
      const m = chunk.match(/<([^<>]+)>/) || chunk.match(/([^\s<>]+@[^\s<>]+)/);
      return m ? m[1].trim().toLowerCase() : "";
    })
    .filter(Boolean);
}

/** Index contacts by every address they carry, for exact-email lookups. */
export function contactsByEmail(contacts: Contact[]): Map<string, Contact> {
  const map = new Map<string, Contact>();
  for (const c of contacts) {
    for (const raw of (c.email || "").split(";")) {
      const e = norm(raw);
      if (e && !map.has(e)) map.set(e, c);
    }
  }
  return map;
}

/**
 * Replace Person/Company on Gmail-sourced activities with CRM-canonical values.
 * Asana rows keep their custom-field values (they are already curated).
 */
export function canonicalizeActivities(
  activities: AsanaActivity[],
  contacts: Contact[],
  portfolioNames: string[] = [],
): AsanaActivity[] {
  const byEmail = contactsByEmail(contacts);
  return activities.map((a) => {
    if (!a.gid.startsWith("gmail-")) return a;
    const emails = peopleEmailsFromNotes(a.notes);
    const match = emails.map((e) => byEmail.get(e)).find(Boolean);

    const person = match?.name?.trim() || a.person;
    const mentioned = resolvePortcosMentioned(a, portfolioNames);
    const company =
      mentioned[0] || match?.company?.trim() || a.company || undefined;

    if (person === a.person && company === a.company) return a;
    return { ...a, person, company };
  });
}

// ── K: user corrections ──────────────────────────────────────────
// A human said "this touch is on the wrong person/company". Corrections live in
// the Attribution Feedback tab and are replayed over every canonicalization, so
// one fix sticks across syncs instead of being overwritten on the next run.

export interface AttributionCorrection {
  /** Activity gid (gmail-<id>) — exact target. */
  gid?: string;
  /** Gmail thread id — covers later replies in the same conversation. */
  threadId?: string;
  person?: string;
  company?: string;
}

/** Thread id recorded on the audit line of a synced Gmail note. */
export function threadIdFromNotes(notes?: string): string {
  const m = (notes || "").match(/thread\s+([A-Za-z0-9_-]+)/);
  return m ? m[1] : "";
}

export function applyAttributionCorrections(
  activities: AsanaActivity[],
  corrections: AttributionCorrection[],
): AsanaActivity[] {
  if (corrections.length === 0) return activities;
  const byGid = new Map<string, AttributionCorrection>();
  const byThread = new Map<string, AttributionCorrection>();
  for (const c of corrections) {
    if (c.gid) byGid.set(c.gid, c);
    if (c.threadId) byThread.set(c.threadId, c);
  }
  return activities.map((a) => {
    const fix = byGid.get(a.gid) || byThread.get(threadIdFromNotes(a.notes));
    if (!fix) return a;
    return {
      ...a,
      person: fix.person?.trim() || a.person,
      company: fix.company?.trim() || a.company,
    };
  });
}

// ── I: ambiguity detection (input for the Gemini fallback) ───────

export interface AttributionCandidate {
  name: string;
  email: string;
}

export interface AmbiguousActivity {
  gid: string;
  subject: string;
  notes: string;
  candidates: AttributionCandidate[];
  /**
   * What Gemini has to decide. "person" = the counterparty is already resolved
   * from the CRM but no portfolio company is tagged; "both" = neither is known.
   */
  needs: "company" | "both";
  /** Person already resolved deterministically (when needs === "company"). */
  knownPerson?: string;
}


/** Names + emails from the machine-readable "People:" line of a synced note. */
export function peopleFromNotes(notes?: string): AttributionCandidate[] {
  const line = (notes || "").split("\n").find((l) => /^people\s*:/i.test(l.trim()));
  if (!line) return [];
  return line
    .replace(/^\s*people\s*:/i, "")
    .split(";")
    .map((chunk) => {
      const m = chunk.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
      if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
      const bare = chunk.match(/([^\s<>]+@[^\s<>]+)/);
      return bare ? { name: "", email: bare[1].toLowerCase() } : { name: "", email: "" };
    })
    .filter((p) => p.email);
}

/**
 * Gmail activities whose attribution is genuinely uncertain: no exact CRM email
 * match AND either several plausible counterparties or no company resolved from
 * content. Everything else is decided deterministically — the LLM never sees it.
 */
export function findAmbiguousActivities(
  activities: AsanaActivity[],
  contacts: Contact[],
  portfolioNames: string[] = [],
): AmbiguousActivity[] {
  const byEmail = contactsByEmail(contacts);
  const out: AmbiguousActivity[] = [];
  for (const a of activities) {
    if (!a.gid.startsWith("gmail-")) continue;
    const candidates = peopleFromNotes(a.notes);
    if (candidates.some((p) => byEmail.has(p.email))) continue; // CRM decided it
    const mentioned = resolvePortcosMentioned(a, portfolioNames);
    const uncertain = candidates.length > 1 || mentioned.length === 0;
    if (!uncertain || candidates.length === 0) continue;
    out.push({
      gid: a.gid,
      subject: a.name || "",
      notes: (a.notes || "").slice(0, 700),
      candidates,
    });
  }
  return out;
}


/** Subject key for cross-source duplicate detection (RE:/FW: and noise stripped). */
export function normalizeSubjectKey(subject: string): string {
  return (subject || "")
    .replace(/^\s*(?:(?:re|fw|fwd|tr|aw)\s*:\s*)+/gi, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function dayNumber(date?: string): number | null {
  if (!date) return null;
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : null;
}

/**
 * Drop Gmail activities that duplicate an Asana task: nearly every tracked
 * thread is also sent to an x+…@mail.asana.com intake address, so the same touch
 * arrives twice. Rule (documented, one-way): the ASANA record wins — it carries
 * richer custom fields — and the Gmail twin is discarded when the normalized
 * subject matches within `windowDays` on the same track.
 */
export function dedupeAcrossSources(
  activities: AsanaActivity[],
  windowDays = 3,
): { activities: AsanaActivity[]; dropped: number } {
  const asanaKeys: { key: string; day: number | null; track: string }[] = [];
  for (const a of activities) {
    if (a.gid.startsWith("gmail-")) continue;
    const key = normalizeSubjectKey(a.name);
    if (key.length < 6) continue;
    asanaKeys.push({ key, day: dayNumber(a.date), track: a.track });
  }
  if (asanaKeys.length === 0) return { activities, dropped: 0 };

  let dropped = 0;
  const kept = activities.filter((a) => {
    if (!a.gid.startsWith("gmail-")) return true;
    const key = normalizeSubjectKey(a.name);
    if (key.length < 6) return true;
    const day = dayNumber(a.date);
    const twin = asanaKeys.some(
      (k) =>
        k.key === key &&
        k.track === a.track &&
        (k.day === null || day === null || Math.abs(k.day - day) <= windowDays),
    );
    if (twin) dropped++;
    return !twin;
  });
  return { activities: kept, dropped };
}

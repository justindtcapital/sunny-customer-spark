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

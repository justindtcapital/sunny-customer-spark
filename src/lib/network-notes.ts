// Pure helpers for Network (NWK) notes and person ↔ note matching.

/** Notes/emails with "NWK" as a word in the title are Network management notes. */
export function isNetworkTitle(title: string): boolean {
  return /(^|[^a-z0-9])nwk([^a-z0-9]|$)/i.test(title || "");
}

export interface PersonKey {
  name?: string;
  email?: string;
}

/** Does this person appear in a note's people text (participants, extracted people, linked contacts)? */
export function personInText(person: PersonKey, haystack: string): boolean {
  const h = (haystack || "").toLowerCase();
  const email = (person.email || "").trim().toLowerCase();
  if (email && h.includes(email)) return true;
  const name = (person.name || "").trim().toLowerCase().replace(/\s+/g, " ");
  // Full name only (first + last) — single first names match too many people.
  if (name.split(" ").length >= 2 && name.length >= 5) return h.replace(/\s+/g, " ").includes(name);
  return false;
}

/** Simple contact search scoring: every query word must match name, email or company. */
export function matchesQuery(q: string, fields: string[]): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const text = fields.join(" ").toLowerCase();
  return words.every((w) => text.includes(w));
}

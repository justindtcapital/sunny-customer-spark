import type { Contact } from "./types";
import { teamMemberFor } from "./user-ownership";
import { isPortCoContact, portcoKeys } from "./portco-contacts";

/** Evidence shortlist only; no ratings or records are changed. */
export function introductionCandidates(contacts: Contact[], input: { terms: string[]; mine: boolean; teamEmail: string; portcos: string[]; target: string }) {
  const terms = [...new Set(input.terms.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  if (!terms.length) return { candidates: [], total: 0, truncated: false };
  const me = teamMemberFor(input.teamEmail);
  const keys = portcoKeys(input.portcos);
  const seen = new Set<string>();
  const candidates = contacts.flatMap((c) => {
    if (c.portco || isPortCoContact(c, keys)) return [];
    if (input.mine && (!me || teamMemberFor(c.prime)?.email !== me.email)) return [];
    const identity = c.urid || c.email.trim().toLowerCase();
    if (!identity || seen.has(identity)) return [];
    const fields = [c.title, c.company, c.sector, ...(c.areasOfInterest || []), c.primaryArea || "", c.sourceContext || ""];
    const evidence = terms.filter((t) => fields.some((f) => f.toLowerCase().includes(t)));
    if (!evidence.length) return [];
    seen.add(identity);
    return [{ urid: c.urid || "", name: c.name, title: c.title, company: c.company, email: c.email,
      prime: teamMemberFor(c.prime)?.displayName || c.prime || "Unassigned", level: c.temperature,
      matchedTerms: evidence, interests: c.areasOfInterest, previousIntroductions: c.portCoIntros || [],
      alreadyIntroduced: (c.portCoIntros || []).some((p) => p.trim().toLowerCase() === input.target.trim().toLowerCase()),
      location: c.location || "", score: evidence.length }];
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { candidates: candidates.slice(0, 30), total: candidates.length, truncated: candidates.length > 30 };
}
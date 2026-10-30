import { isNetworkTitle, extractEmails } from "./network-notes";
import { isPlaceholderName, type DirPerson } from "./meeting-roster";
import { scorePortcoNameMatch } from "./portco-names";

export function meetingTitleDefaults(title: string) {
  const subject = (title || "").replace(/^(?:(?:re|fw|fwd):\s*)+/i, "").trim();
  const investor = subject.match(/^investor\b\s*(?::|[-–—])?\s*(.*)$/i);
  if (investor) return {
    folder: "investor" as const,
    investor: (investor[1] || "").replace(/\s+(?:portco\s+)?1\s*[:/]\s*1\b.*$/i, "").trim(),
    people: [] as Array<{ name: string; email: string; company: string }>,
  };
  const nwk = subject.match(/^nwk\b\s*(?::|[-–—])?\s*(.*)$/i);
  const people: Array<{ name: string; email: string; company: string }> = [];
  if (nwk?.[1]) {
    const parts = nwk[1].split(/\s+[-–—]\s+/);
    // "NWK: Company - Person & Person" versus "NWK: Person - Company".
    const companyFirst = /[&,]/.test(parts[1] || "");
    const names = companyFirst ? parts[1] || "" : parts[0] || "";
    const company = companyFirst ? parts[0] || "" : parts.slice(1).join(" - ");
    for (const name of names.split(/\s*(?:&|;|,|\band\b)\s*/i)) {
      const cleaned = name.trim();
      if (cleaned && !isPlaceholderName(cleaned)) people.push({ name: cleaned, email: "", company });
    }
  }
  return { folder: isNetworkTitle(subject) ? "network" as const : "portco" as const, investor: "", people };
}

const nameKey = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();

/** Never turn a first name, shared email, or ambiguous full name into an automatic link. */
export function uniqueReviewPerson<T extends DirPerson>(person: { name: string; email?: string }, directory: T[]): T | undefined {
  const email = (person.email || "").trim().toLowerCase();
  const name = nameKey(person.name);
  const candidates = email
    ? directory.filter((p) => extractEmails(p.email).includes(email))
    : name.split(" ").length >= 2 && !isPlaceholderName(name)
      ? directory.filter((p) => nameKey(p.name) === name)
      : [];
  // Multiple source rows are ambiguous, even if their names/emails happen to agree.
  if (candidates.length !== 1) return undefined;
  const hit = candidates[0];
  if (!hit) return undefined;
  const emails = extractEmails(hit.email);
  const primary = email || emails[0];
  if (!primary || directory.filter((p) => extractEmails(p.email).includes(primary)).length !== 1) return undefined;
  return { ...hit, email: primary };
}

/** Formatting/suffix variants only, not substring/fuzzy guesses; ties stay separate. */
export function reviewCompanyName(name: string, canonicalNames: string[]): string {
  const scored = canonicalNames.map((canonical) => ({ canonical, score: scorePortcoNameMatch(name, canonical) }))
    .filter((x) => x.score >= 850).sort((a, b) => b.score - a.score);
  const first = scored[0];
  return first && (!scored[1] || scored[1].score < first.score) ? first.canonical : name.trim();
}

export function reviewCompanyOptions(canonical: string[], others: string[]): string[] {
  const names = new Map<string, string>();
  for (const name of [...canonical, ...others.map((n) => reviewCompanyName(n, canonical))]) {
    const trimmed = name.trim();
    if (trimmed && !names.has(trimmed.toLowerCase())) names.set(trimmed.toLowerCase(), trimmed);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** One canonical Contacts table, status decides the view, never a second Targets read. */
export function reviewPeopleFromRows(rows: string[][]): Array<DirPerson & { where: "Network" | "Prospecting" }> {
  const headers = (rows[0] || []).map((h) => h.trim().toLowerCase());
  const col = (re: RegExp) => headers.findIndex((h) => re.test(h));
  const n = col(/^(full )?name$|^contact name$/), e = col(/^e-?mail(?: address)?$/), c = col(/^company|organization|employer/);
  const f = col(/^first name$/), l = col(/^last name$/), t = col(/^(job )?title$|^position$|^role$/);
  const status = col(/^relationship status$/);
  return rows.slice(1).flatMap((r) => {
    const name = (n >= 0 ? r[n] || "" : `${r[f] || ""} ${r[l] || ""}`).trim();
    const email = (r[e] || "").trim().toLowerCase();
    return name || email ? [{ name, email, company: (r[c] || "").trim(), title: (r[t] || "").trim(),
      where: (r[status] || "").trim().toLowerCase() === "prospecting" ? "Prospecting" as const : "Network" as const }] : [];
  });
}
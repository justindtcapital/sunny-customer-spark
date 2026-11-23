// Pure ranking and duplicate grouping for the people finder on review cards
// (My Actions inbox). The server ranks; the card groups likely duplicates so
// they can be merged or picked right where the name is being matched.

import { emailIdentities } from "./import-dedupe";
import { companyKey } from "./contact-merge";
import { personNameKey } from "./contact-identity";

export interface FinderPerson { name: string; email: string; company: string; title?: string; where: string; urid?: string }

const fold = (s?: string) => (s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Score one person against a query: exact email > exact name > name starts
 * with the query > every word starts a name part > words anywhere in the name
 * > match only via company/title/email. Every query word must appear somewhere.
 * Company/domain hints from the meeting add a small boost.
 */
export function scorePerson(q: string, p: FinderPerson, hints: string[] = []): number {
  const query = fold(q);
  const words = query.split(" ").filter(Boolean);
  if (!words.length) return 0;
  const name = fold(p.name), email = fold(p.email), company = fold(p.company), title = fold(p.title);
  const all = `${name} ${email} ${company} ${title}`;
  if (!words.every((w) => all.includes(w))) return 0;
  const parts = name.split(" ");
  let score = 30;
  if (emailIdentities(p.email).includes(query)) score = 100;
  else if (name === query) score = 90;
  else if (name.startsWith(query)) score = 80;
  else if (words.every((w) => parts.some((part) => part.startsWith(w)))) score = 70;
  else if (words.every((w) => name.includes(w))) score = 60;
  const ck = companyKey(p.company), domain = (p.email.split("@")[1] || "").split(".")[0] || "";
  const hinted = hints.map(fold).filter((h) => h.length >= 2).some((h) => (ck && (ck.includes(h) || h.includes(ck))) || (domain.length >= 2 && h.includes(domain)));
  return score + (hinted ? 5 : 0);
}

export function rankPeopleMatches<T extends FinderPerson>(q: string, people: T[], hints: string[] = [], max = 20): T[] {
  return people.map((p, i) => ({ p, i, s: scorePerson(q, p, hints) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || Number(a.p.where === "Prospecting") - Number(b.p.where === "Prospecting") || a.p.name.localeCompare(b.p.name) || a.i - b.i)
    .slice(0, max)
    .map((x) => x.p);
}

export interface DuplicateCluster<T> { people: T[]; reason: "Same email" | "Same name & company" | "Same name" }

/**
 * Groups of 2+ saved records that look like one person: a shared email, or the
 * same full name with the same (or one blank) company. Team rows and rows
 * without a record ID are never grouped — only real records can be merged.
 */
export function duplicateClusters<T extends FinderPerson>(people: T[]): DuplicateCluster<T>[] {
  const list = people.filter((p) => p.urid && p.where !== "Team");
  const parent = list.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const why = new Map<string, DuplicateCluster<T>["reason"]>();
  const rank = { "Same email": 0, "Same name & company": 1, "Same name": 2 } as const;
  const link = (a: number, b: number, reason: DuplicateCluster<T>["reason"]) => {
    const ra = find(a), rb = find(b);
    parent[ra] = rb;
    for (const k of [String(ra), String(rb)]) { const prev = why.get(k); if (!prev || rank[reason] < rank[prev]) why.set(k, reason); }
  };
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i]!, b = list[j]!;
    if ((a.urid || "").toLowerCase() === (b.urid || "").toLowerCase()) continue;
    const ea = emailIdentities(a.email), eb = emailIdentities(b.email);
    if (ea.some((e) => eb.includes(e))) { link(i, j, "Same email"); continue; }
    const na = personNameKey(a.name);
    if (!na.includes(" ") || na !== personNameKey(b.name)) continue;
    const ca = companyKey(a.company), cb = companyKey(b.company);
    if (ca && cb && ca === cb) link(i, j, "Same name & company");
    else if (!ca || !cb) link(i, j, "Same name");
  }
  const groups = new Map<number, T[]>();
  list.forEach((p, i) => { const r = find(i); groups.set(r, [...(groups.get(r) || []), p]); });
  const out: DuplicateCluster<T>[] = [];
  for (const [root, members] of groups) {
    if (members.length < 2) continue;
    const reasons = [...why.entries()].filter(([k]) => find(Number(k)) === root).map(([, v]) => v).sort((x, y) => rank[x] - rank[y]);
    out.push({ people: members, reason: reasons[0] || "Same name" });
  }
  return out;
}

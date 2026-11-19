// "V.I.C. suggests": who might care about a signal, and which PortCos fit it.
// Pure helpers — candidate shaping for the prompt and validation of the model's
// picks against real records, so a suggestion can never name an invented person
// or company. Browser-safe.
import type { Contact, PortfolioCompany } from "@/lib/types";
import { ratedLevel } from "@/lib/contact-kind";

export const MATCH_TIERS = ["Council", "Hot", "Warm"] as const;
export const MAX_PEOPLE = 4;
export const MAX_PORTCOS = 3;
const MAX_CANDIDATES = 450;
export const PORTCO_ANGLES = ["Competitive", "GTM opening", "Validation", "Partnership", "Risk"] as const;
export type PortcoAngle = (typeof PORTCO_ANGLES)[number];

const norm = (s?: string) => (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clip = (s: string | undefined, n: number) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
const tierRank = (t: string | null) => (t === "Council" ? 0 : t === "Hot" ? 1 : t === "Warm" ? 2 : 3);

export interface PersonCandidate {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  tier: string;
  prime: string;
  interests: string;
  lastContact: string;
}

export interface PortcoCandidate {
  name: string;
  focus: string;
  about: string;
  founderName: string;
  founderEmail: string;
}

/**
 * People V.I.C. may suggest: rated Council, Hot or Warm (PortCo people are
 * never rated), plus anyone at the company in the news whatever their level.
 * Strongest tiers first, capped so the prompt stays a sensible size.
 */
export function personCandidates(contacts: Contact[], signalCompany?: string): PersonCandidate[] {
  const subject = norm(signalCompany);
  const out: Array<PersonCandidate & { rank: number }> = [];
  const seen = new Set<string>();
  for (const c of contacts) {
    if (!c.id || !c.name?.trim() || seen.has(c.id)) continue;
    const level = ratedLevel(c);
    const atSubject = !!subject && norm(c.company) === subject && !c.portco && c.kind !== "PortCo";
    if (!atSubject && !(level && (MATCH_TIERS as readonly string[]).includes(level))) continue;
    seen.add(c.id);
    out.push({
      id: c.id,
      name: c.name.trim(),
      title: clip(c.title, 90),
      company: clip(c.company, 80),
      email: (c.email || "").trim(),
      tier: level || "Unrated",
      prime: clip(c.prime, 60),
      interests: clip([c.primaryArea, ...(c.areasOfInterest || []), c.sector].filter(Boolean).join(", "), 140),
      lastContact: (c.lastContact || "").slice(0, 10),
      rank: atSubject ? -1 : tierRank(level),
    });
  }
  return out.sort((a, b) => a.rank - b.rank).slice(0, MAX_CANDIDATES).map(({ rank: _r, ...p }) => p);
}

export function portcoCandidates(portcos: PortfolioCompany[]): PortcoCandidate[] {
  const seen = new Set<string>();
  return portcos
    .filter((p) => p.name?.trim() && !seen.has(norm(p.name)) && seen.add(norm(p.name)))
    .map((p) => ({
      name: p.name.trim(),
      focus: clip([p.domain, p.sector].filter((x) => x && x !== "Other").join(" / "), 80),
      about: clip(p.description, 220),
      founderName: (p.contactName || "").trim(),
      founderEmail: (p.contactEmail || "").trim(),
    }));
}

/** One compact line per candidate for the prompt (ids are what the model must echo back). */
export const personLine = (p: PersonCandidate) =>
  [p.id, p.name, p.title, p.company, p.tier, p.interests && `interests: ${p.interests}`, p.prime && `DTC prime: ${p.prime}`, p.lastContact && `last contact ${p.lastContact}`]
    .filter(Boolean).join(" | ");
export const portcoLine = (p: PortcoCandidate) => [p.name, p.focus, p.about].filter(Boolean).join(" | ");

export interface RawMatches {
  portcos: { name: string; angle: string; why: string; talkingPoint: string }[];
  people: { id: string; why: string; opener: string }[];
  note: string;
}

export interface PortcoSuggestion { name: string; angle: PortcoAngle; why: string; talkingPoint: string; founderName: string; founderEmail: string }
export interface PersonSuggestion { id: string; name: string; title: string; company: string; email: string; tier: string; prime: string; why: string; opener: string }
export interface SignalMatches { portcos: PortcoSuggestion[]; people: PersonSuggestion[]; note: string }

/**
 * Keep only picks that resolve to real records: people by candidate id, PortCos
 * by exact (normalized) name. Drops duplicates, the PortCo the news is about,
 * empty reasons, and anything past the caps.
 */
export function validateMatches(raw: RawMatches, people: PersonCandidate[], portcos: PortcoCandidate[], signalCompany?: string): SignalMatches {
  const byId = new Map(people.map((p) => [p.id, p]));
  const byName = new Map(portcos.map((p) => [norm(p.name), p]));
  const subject = norm(signalCompany);
  const pcSeen = new Set<string>();
  const outPc: PortcoSuggestion[] = [];
  for (const m of raw.portcos || []) {
    const hit = byName.get(norm(m.name));
    const why = clip(m.why, 600);
    if (!hit || !why || norm(hit.name) === subject || pcSeen.has(hit.name)) continue;
    pcSeen.add(hit.name);
    const angle = (PORTCO_ANGLES as readonly string[]).includes(m.angle) ? (m.angle as PortcoAngle) : "Validation";
    outPc.push({ name: hit.name, angle, why, talkingPoint: clip(m.talkingPoint, 400), founderName: hit.founderName, founderEmail: hit.founderEmail });
    if (outPc.length >= MAX_PORTCOS) break;
  }
  const pSeen = new Set<string>();
  const outP: PersonSuggestion[] = [];
  for (const m of raw.people || []) {
    const hit = byId.get(String(m.id || "").trim());
    const why = clip(m.why, 600);
    if (!hit || !why || pSeen.has(hit.id)) continue;
    pSeen.add(hit.id);
    outP.push({ id: hit.id, name: hit.name, title: hit.title, company: hit.company, email: hit.email, tier: hit.tier, prime: hit.prime, why, opener: clip(m.opener, 400) });
    if (outP.length >= MAX_PEOPLE) break;
  }
  return { portcos: outPc, people: outP, note: clip(raw.note, 300) };
}

/** Default follow-up date: three days out (YYYY-MM-DD), moved off weekends to Monday. */
export function defaultFollowUpDate(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 3));
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2);
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * A short, readable topic for drafts and follow-ups. Scan headlines are often
 * just "Company — Category" (e.g. "IBM — Funding/M&A"); those fall back to the
 * first sentence of the summary.
 */
export function signalTopic(s: { company: string; headline: string; summary: string }, max = 140): string {
  const h = clip(s.headline, 300);
  const generic = !h || h.length < 25 || /^[^—]{1,60} — [\w/&,\s-]{1,40}$/.test(h);
  const first = firstSentence(clip(s.summary, 600));
  const t = generic && first ? first : h;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const ABBREV = /\b(?:Corp|Inc|Co|Ltd|LLC|Mr|Ms|Mrs|Dr|St|Jr|Sr|vs|U\.S|U\.K|e\.g|i\.e)\.$/i;
/** First sentence, ignoring stops after abbreviations ("IBM Corp.") and very short fragments. */
function firstSentence(text: string): string {
  const re = /[.!?](?=\s+[A-Z0-9"“])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const head = text.slice(0, m.index + 1);
    if (head.length >= 12 && !ABBREV.test(head)) return head.trim();
  }
  return text.trim();
}

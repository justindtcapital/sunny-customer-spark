// Pure shaping and filtering of Network, Prospecting, Dossiers and Pyramid for V.I.C. (read-only).
import type { Contact, ContactType, TargetLead, Temperature } from "@/lib/types";
import { PORTCO_UNRATED, ratedLevel } from "@/lib/contact-kind";
import { marketFor, movementKpis, primaryDomainFor, PYRAMID_TIERS, type Movement, type PyramidTier } from "@/lib/network-pyramid";
import { canonicalOwnerName, teamMemberFor } from "@/lib/user-ownership";

const lc = (s: string | undefined) => (s || "").trim().toLowerCase();
const matchesText = (needle: string, ...hay: (string | undefined)[]) => {
  const words = lc(needle).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = lc(hay.filter(Boolean).join(" "));
  return words.every((w) => text.includes(w));
};

export interface UnifiedPersonRow {
  urid: string;
  name: string;
  title: string;
  company: string;
  email: string;
  list: "Network" | "Prospecting";
  kind: ContactType;
  tier: Temperature | "Prospect" | typeof PORTCO_UNRATED;
  prime: string;
  domain: string;
  market: string;
  location: string;
  linkedin: string;
}

export function unifyForVic(contacts: Contact[], prospects: TargetLead[]): UnifiedPersonRow[] {
  const net: UnifiedPersonRow[] = contacts.map((c) => {
    const level = ratedLevel(c);
    return {
      urid: c.urid || c.id,
      name: c.name,
      title: c.title,
      company: c.company,
      email: c.email,
      list: "Network",
      kind: c.kind || "Network",
      tier: level ?? PORTCO_UNRATED,
      prime: canonicalOwnerName(c.prime || ""),
      domain: primaryDomainFor(c.primaryArea, c.areasOfInterest),
      market: marketFor(c.location || c.address),
      location: c.location || c.address || "",
      linkedin: c.linkedinUrl || "",
    };
  });
  const pros: UnifiedPersonRow[] = prospects.map((t) => ({
    urid: t.urid || t.id,
    name: t.name,
    title: t.title,
    company: t.company,
    email: t.email,
    list: "Prospecting",
    kind: (t.contactType as ContactType) || "Network",
    tier: "Prospect",
    prime: canonicalOwnerName(t.prime || ""),
    domain: primaryDomainFor("", t.sector ? [t.sector] : []),
    market: marketFor(t.location),
    location: t.location || "",
    linkedin: t.linkedinUrl || "",
  }));
  return [...net, ...pros];
}

export interface NetworkFilterInput {
  query?: string;
  tier?: string;
  kind?: string;
  domain?: string;
  market?: string;
  owner?: string;
  company?: string;
  includeProspects?: boolean;
  teamEmail?: string;
  offset?: number;
  limit?: number;
}

export function filterNetworkContacts(rows: UnifiedPersonRow[], opts: NetworkFilterInput) {
  const ownerRaw = (opts.owner || "").trim();
  const wantOwner = ownerRaw
    ? (teamMemberFor(/^me$/i.test(ownerRaw) ? (opts.teamEmail || "") : ownerRaw)?.displayName || canonicalOwnerName(ownerRaw))
    : "";
  const wantTier = lc(opts.tier);
  const wantKind = lc(opts.kind);
  const wantDomain = lc(opts.domain);
  const wantMarket = lc(opts.market);
  const wantCompany = lc(opts.company);
  const includeProspects = opts.includeProspects ?? (wantTier === "prospect");

  const list = rows.filter((r) => {
    if (!includeProspects && r.list === "Prospecting") return false;
    if (wantTier && lc(r.tier) !== wantTier) return false;
    if (wantKind && lc(r.kind) !== wantKind) return false;
    if (wantDomain && lc(r.domain) !== wantDomain) return false;
    if (wantMarket && lc(r.market) !== wantMarket && !lc(r.location).includes(wantMarket)) return false;
    if (wantOwner && lc(r.prime) !== lc(wantOwner)) return false;
    if (wantCompany && !lc(r.company).includes(wantCompany)) return false;
    if (opts.query?.trim() && !matchesText(opts.query, r.name, r.title, r.company, r.email, r.location, r.domain)) return false;
    return true;
  });

  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 100));
  const page = list.slice(offset, offset + limit);
  return { total: list.length, offset, people: page, truncated: offset + page.length < list.length };
}

export function vicContactDossier(input: {
  contact?: Contact;
  prospect?: TargetLead;
  campaigns: Array<{ id: string; name: string; status: string; sentDate: string; result: string }>;
  emails: Array<{ date: string; subject: string; owner: string; direction?: string }>;
}) {
  const { contact: c, prospect: p, campaigns, emails } = input;
  if (c) {
    const level = ratedLevel(c);
    return {
      list: "Network" as const,
      urid: c.urid || c.id,
      name: c.name,
      title: c.title,
      company: c.company,
      email: c.email,
      phone: c.phone,
      linkedin: c.linkedinUrl || "",
      location: c.location || c.address || "",
      market: marketFor(c.location || c.address),
      kind: c.kind || "Network",
      level: level ?? PORTCO_UNRATED,
      prime: canonicalOwnerName(c.prime || ""),
      sector: c.sector,
      primaryDomain: primaryDomainFor(c.primaryArea, c.areasOfInterest),
      areasOfInterest: c.areasOfInterest,
      dateAdded: c.dateAdded || "",
      lastContact: c.lastContact || "",
      followUpPending: !!c.followUpPending,
      portcoIntros: c.portCoIntros,
      eventsAttended: c.eventsAttended,
      eventsInvited: c.eventsInvited,
      interactions: [...c.interactions]
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        .slice(0, 40)
        .map((i) => ({ date: i.date, type: i.type, owner: i.owner || "", summary: i.summary.slice(0, 500), isFollowUp: !!i.isFollowUp, followUpComplete: !!i.followUpComplete })),
      campaigns,
      recentEmails: emails.slice(0, 20),
    };
  }
  if (p) {
    return {
      list: "Prospecting" as const,
      urid: p.urid || p.id,
      name: p.name,
      title: p.title,
      company: p.company,
      email: p.email,
      phone: p.phone,
      linkedin: p.linkedinUrl || "",
      location: p.location || "",
      market: marketFor(p.location),
      kind: p.contactType || "Network",
      level: "Prospect",
      stage: p.stage,
      prime: canonicalOwnerName(p.prime || ""),
      sector: p.sector,
      originSource: p.originSource,
      reasonSurfaced: p.reasonSurfaced || "",
      portcoTags: p.portcoTags || [],
      eventsAttended: p.eventsAttended || [],
      eventsInvited: p.eventsInvited || [],
      dateAdded: p.dateAdded || "",
      followUpDue: p.followUpDue || "",
      campaigns,
      recentEmails: emails.slice(0, 20),
    };
  }
  return null;
}

export function vicNetworkSummary(input: {
  rows: UnifiedPersonRow[];
  targets: Record<string, number>;
  movements: Movement[];
  nowMs?: number;
}) {
  const byTier: Record<string, number> = Object.fromEntries(PYRAMID_TIERS.map((t) => [t, 0]));
  const byKind: Record<string, number> = { Network: 0, PortCo: 0, Dell: 0, Partner: 0 };
  const byDomain: Record<string, number> = {};
  const byMarket: Record<string, number> = {};
  for (const r of input.rows) {
    byKind[r.kind] = (byKind[r.kind] || 0) + 1;
    if (r.tier in byTier) byTier[r.tier] = (byTier[r.tier] || 0) + 1;
    byDomain[r.domain] = (byDomain[r.domain] || 0) + 1;
    byMarket[r.market] = (byMarket[r.market] || 0) + 1;
  }
  const now = input.nowMs ?? Date.now();
  const dated: { email: string; tier: PyramidTier; dateAdded?: string }[] = input.rows
    .filter((r): r is UnifiedPersonRow & { tier: PyramidTier } => (PYRAMID_TIERS as string[]).includes(r.tier) && !!r.email)
    .map((r) => ({ email: r.email, tier: r.tier }));
  return {
    totalPeople: input.rows.length,
    byTier,
    targets: input.targets,
    byKind,
    byDomain,
    byMarket,
    movements: {
      last30d: movementKpis(input.movements, dated, 30, now),
      last6m: movementKpis(input.movements, dated, 182, now),
      last12m: movementKpis(input.movements, dated, 365, now),
    },
  };
}
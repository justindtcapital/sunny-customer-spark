// Pure helpers that decide which company a My Actions follow-up is shown under.
// Read-time only: nothing here is saved back to a follow-up or a contact.

/** "Bland AI" / "Bland" and "SiMa.ai" / "SiMa" share one key; punctuation and case are ignored. */
export function portcoMatchKey(name: string | undefined): string {
  const k = (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return k.length > 5 && k.endsWith("ai") ? k.slice(0, -2) : k;
}

export interface DirectoryPerson { name: string; email: string; company: string }
export interface GroupableReminder {
  company?: string;
  person?: string;
  email?: string;
  summary?: string;
  people?: { name: string; email: string }[];
}

const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z\s'-]/g, " ").replace(/\s+/g, " ").trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The outside person a follow-up is about and their company, looked up in Network/Prospecting.
 * Order: tagged people, the follow-up's own person, then one full name written in the title.
 * Teammates are skipped, and a name matching more than one person is left unresolved.
 */
export function resolveActionContact(
  r: GroupableReminder,
  directory: DirectoryPerson[],
  isTeammate: (nameOrEmail: string) => boolean,
): { name: string; company: string } | null {
  const byEmail = new Map<string, DirectoryPerson>();
  const byName = new Map<string, DirectoryPerson[]>();
  for (const p of directory) {
    if (p.email) byEmail.set(p.email.toLowerCase(), p);
    const k = nameKey(p.name);
    if (k.includes(" ")) byName.set(k, [...(byName.get(k) || []), p]);
  }
  const unique = (list?: DirectoryPerson[]) => {
    const withCo = (list || []).filter((p) => p.company.trim());
    const cos = new Set(withCo.map((p) => p.company.trim().toLowerCase()));
    return withCo.length && cos.size === 1 ? withCo[0]! : null;
  };
  const find = (name: string, email: string) => {
    if (isTeammate(email || name)) return null;
    const e = email ? byEmail.get(email.toLowerCase()) : undefined;
    if (e?.company.trim()) return e;
    return unique(byName.get(nameKey(name)));
  };
  const candidates = [...(r.people || []), ...(r.person ? [{ name: r.person, email: r.email || "" }] : [])];
  for (const c of candidates) {
    const hit = find(c.name || "", c.email || "");
    if (hit) return { name: hit.name, company: hit.company.trim() };
  }
  const title = ` ${nameKey(r.summary || "")} `;
  const mentioned = [...byName.entries()].filter(([k]) => title.includes(` ${k} `) || new RegExp(`\\b${escape(k)}\\b`).test(title));
  if (mentioned.length === 1) {
    const hit = unique(mentioned[0]![1]);
    if (hit && !isTeammate(hit.email || hit.name)) return { name: hit.name, company: hit.company.trim() };
  }
  // "Re-connect w Mongeon": a surname right after "w"/"with" that only one person has.
  const sur = title.match(/\b(?:w|with)\s+([a-z'-]{4,})\s/)?.[1];
  if (sur) {
    const people = directory.filter((p) => nameKey(p.name).split(" ").length > 1 && nameKey(p.name).endsWith(` ${sur}`));
    const hit = unique(people);
    if (hit && people.length === 1 && !isTeammate(hit.email || hit.name)) return { name: hit.name, company: hit.company.trim() };
  }
  return null;
}

/** How a follow-up is filed in My Actions: "auto" decides from its tags and the outside person. */
export type FollowUpFiling = "auto" | "portco" | "network";
export interface FilingInput {
  company?: string;
  filing?: FollowUpFiling;
  /** Company of the outside person the follow-up is about (read-time lookup). */
  groupCompany?: string;
  contactName?: string;
  person?: string;
}
export interface Filing { kind: "portcos" | "network" | "ops"; group: string; portcoTag: string; auto: boolean }

const OPS_TAG = /^(no portco|no company|portdev ops)$/i;

/**
 * Where a follow-up shows in My Actions. A PortCo follow-up sits under its PortCo; a Network
 * follow-up sits under the outside person's company and keeps the PortCo as a tag.
 * Auto: a PortCo-tagged follow-up about someone at a non-PortCo company is Network.
 * `portcoName` returns the canonical PortCo name for a company, or "" when it isn't one.
 */
export function fileFollowUp(r: FilingInput, portcoName: (name: string) => string, isTeammate: (name: string) => boolean): Filing {
  const tags = (r.company || "").split(/\s*,\s*/).map((t) => t.trim()).filter((t) => t && !OPS_TAG.test(t));
  const portcoTag = tags.map(portcoName).find(Boolean) || "";
  const otherTag = tags.find((t) => !portcoName(t)) || "";
  const personCo = (r.groupCompany || "").trim();
  const personPortco = personCo ? portcoName(personCo) : "";
  const personName = (r.contactName || (r.person && !isTeammate(r.person) ? r.person : "") || "").trim();
  const networkGroup = (personCo && !personPortco ? personCo : "") || otherTag;
  const asPortco = (auto: boolean): Filing => {
    const group = portcoTag || personPortco;
    return group ? { kind: "portcos", group, portcoTag: group, auto } : { kind: "ops", group: "", portcoTag: "", auto };
  };
  const asNetwork = (auto: boolean): Filing => {
    const group = networkGroup || personName || personCo || portcoTag;
    return group ? { kind: "network", group, portcoTag, auto } : { kind: "ops", group: "", portcoTag, auto };
  };
  if (r.filing === "portco") return asPortco(false);
  if (r.filing === "network") return asNetwork(false);
  if (portcoTag) return networkGroup ? asNetwork(true) : asPortco(true);
  if (networkGroup) return asNetwork(true);
  if (personPortco) return asPortco(true);
  if (personName) return asNetwork(true);
  return { kind: "ops", group: "", portcoTag: "", auto: true };
}

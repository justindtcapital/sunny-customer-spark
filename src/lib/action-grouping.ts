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
  return null;
}

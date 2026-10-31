/** Pure resolver for V.I.C. people descriptions ("the CEO of Aka", "three people from Exxon"). Proposes only. */
export interface ActionPersonQuery { phrase: string; name?: string; company?: string; role?: string; count?: number }
export interface DirectoryPerson { name: string; email: string; company: string; title?: string; where: string }
export interface ResolvedPersonQuery { phrase: string; candidates: DirectoryPerson[]; preselected: string[]; note: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const ROLE_ALIASES: Record<string, string[]> = {
  ceo: ["ceo", "chief executive"], cto: ["cto", "chief technology"], cfo: ["cfo", "chief financial"],
  coo: ["coo", "chief operating"], cro: ["cro", "chief revenue"], cmo: ["cmo", "chief marketing"],
  ciso: ["ciso", "chief information security"], cio: ["cio", "chief information officer"],
  founder: ["founder", "co founder", "cofounder"], president: ["president"],
};

function roleTerms(role: string): string[] {
  const r = norm(role);
  return ROLE_ALIASES[r] || [r];
}

export function titleMatchesRole(title: string | undefined, role: string): boolean {
  const t = ` ${norm(title || "")} `;
  return roleTerms(role).some((term) => t.includes(` ${term} `) || t.includes(` ${term}`));
}

export function companyMatches(personCompany: string, company: string): boolean {
  const a = norm(personCompany), b = norm(company);
  if (!a || b.length < 2) return false;
  if (a === b) return true;
  const words = a.split(" ");
  const ac = a.replace(/ /g, ""), bc = b.replace(/ /g, "");
  return (bc.length >= 4 && ac.startsWith(bc)) || (b.length >= 3 && (words[0] === b || a.startsWith(`${b} `) || b.startsWith(`${a} `)));
}

const key = (p: DirectoryPerson) => p.email || p.name;

export function resolvePersonQuery(q: ActionPersonQuery, directory: DirectoryPerson[]): ResolvedPersonQuery {
  const phrase = q.phrase || q.name || [q.role, q.company].filter(Boolean).join(" at ");
  if (q.name?.trim()) {
    const tokens = norm(q.name).split(" ").filter(Boolean);
    let c = directory.filter((p) => { const n = norm(p.name); return tokens.every((t) => n.split(" ").includes(t)); });
    if (q.company) { const byCo = c.filter((p) => companyMatches(p.company, q.company!)); if (byCo.length) c = byCo; }
    c = c.slice(0, 12);
    return { phrase, candidates: c, preselected: c.length === 1 ? [key(c[0])] : [], note: c.length ? (c.length === 1 ? "" : "Several people match — pick one.") : "No match in Network or Prospecting." };
  }
  if (!q.company?.trim()) return { phrase, candidates: [], preselected: [], note: "Tell V.I.C. a name or company." };
  const atCompany = directory.filter((p) => companyMatches(p.company, q.company!));
  if (!atCompany.length) return { phrase, candidates: [], preselected: [], note: `No one at ${q.company} in Network or Prospecting.` };
  if (q.role?.trim()) {
    const byRole = atCompany.filter((p) => titleMatchesRole(p.title, q.role!));
    if (byRole.length === 1) return { phrase, candidates: byRole, preselected: [key(byRole[0])], note: "" };
    if (byRole.length > 1) return { phrase, candidates: byRole.slice(0, 12), preselected: [], note: `${byRole.length} people match — pick one.` };
    return { phrase, candidates: atCompany.slice(0, 12), preselected: [], note: `No ${q.role} on file at ${q.company} — pick from people there.` };
  }
  const c = atCompany.slice(0, 12);
  if (q.count && atCompany.length === q.count) return { phrase, candidates: c, preselected: c.map(key), note: "" };
  if (!q.count && atCompany.length === 1) return { phrase, candidates: c, preselected: [key(c[0])], note: "" };
  return { phrase, candidates: c, preselected: [], note: q.count ? `Found ${atCompany.length} at ${q.company}; you said ${q.count} — pick them.` : `Pick who at ${q.company}.` };
}

/** PortCos named in the request text (whole-word, case-insensitive, non-fuzzy). */
export function portcosMentioned(text: string, options: string[]): string[] {
  const t = ` ${norm(text)} `;
  return options.filter((o) => { const n = norm(o); return n.length >= 2 && t.includes(` ${n} `); });
}

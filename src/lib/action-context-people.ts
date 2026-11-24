/**
 * Pure helpers that give V.I.C. the people already tied to what you're actioning
 * (a workstream's Dell stakeholders and the PortCo's saved contacts), and resolve
 * "Travis", "their CEO" or "the Dell stakeholders" against them before searching
 * the whole directory. Proposes only — nothing is added without confirmation.
 */
import { companyMatches, resolvePersonQuery, titleMatchesRole, type ActionPersonQuery, type DirectoryPerson, type ResolvedPersonQuery } from "./action-people";
import { splitStakeholders } from "./workstream-stakeholders";
import { personNameKey } from "./contact-identity";
import { isDellContact } from "./dell-contacts";

export type ContextRole = "Dell stakeholder" | "PortCo contact";
export interface ContextPerson extends DirectoryPerson { why: ContextRole }

const MAX_COMPANY_PEOPLE = 40;
const isDellCompany = (company: string) => isDellContact({ company, email: "", contactType: "" });
const isDellPerson = (p: DirectoryPerson) => isDellContact({ company: p.company, email: p.email, contactType: "" });
const pkey = (p: DirectoryPerson) => (p.email || p.name).toLowerCase();

/** People on this workstream/company: linked Dell stakeholders first, then the PortCo's saved contacts. */
export function contextPeople(dir: DirectoryPerson[], opts: { company?: string; stakeholders?: string }): ContextPerson[] {
  const byName = new Map<string, DirectoryPerson[]>();
  const byEmail = new Map<string, DirectoryPerson[]>();
  for (const p of dir) {
    const k = personNameKey(p.name);
    if (k.includes(" ")) byName.set(k, [...(byName.get(k) || []), p]);
    for (const e of (p.email || "").split(/[;,\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => x.includes("@"))) byEmail.set(e, [...(byEmail.get(e) || []), p]);
  }
  const out: ContextPerson[] = [];
  const seen = new Set<string>();
  const push = (p: DirectoryPerson, why: ContextRole) => { const k = pkey(p); if (!k || seen.has(k)) return; seen.add(k); out.push({ ...p, why }); };
  for (const name of splitStakeholders(opts.stakeholders || "")) {
    const found = name.includes("@") ? byEmail.get(name.toLowerCase()) || [] : byName.get(personNameKey(name)) || [];
    const unique = [...new Map(found.map((p) => [pkey(p), p])).values()];
    const dell = unique.filter(isDellPerson);
    const pick = unique.length === 1 ? unique[0] : dell.length === 1 ? dell[0] : undefined;
    // Unlinked/ambiguous names stay name-only so V.I.C. still knows who they are, without guessing an email.
    push(pick || { name, email: "", company: "Dell", title: "", where: "Network" }, "Dell stakeholder");
  }
  const company = (opts.company || "").trim();
  if (company && !isDellCompany(company)) {
    dir.filter((p) => companyMatches(p.company, company)).slice(0, MAX_COMPANY_PEOPLE).forEach((p) => push(p, "PortCo contact"));
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const k = (p: DirectoryPerson) => p.email || p.name;
const strip = (p: ContextPerson): DirectoryPerson => ({ name: p.name, email: p.email, company: p.company, title: p.title, where: p.where });

/** Resolve one description against the workstream's people first, then the whole directory. */
export function resolveInContext(q: ActionPersonQuery, dir: DirectoryPerson[], context: ContextPerson[]): ResolvedPersonQuery {
  if (!context.length) return resolvePersonQuery(q, dir);
  const phrase = q.phrase || q.name || [q.role, q.company].filter(Boolean).join(" at ");
  const done = (hits: ContextPerson[], many: string, all = false): ResolvedPersonQuery => {
    const c = hits.slice(0, 12).map(strip);
    return { phrase, candidates: c, preselected: all || c.length === 1 ? c.map(k) : [], note: c.length === 1 || all ? "" : many };
  };
  if (q.name?.trim()) {
    const tokens = norm(q.name).split(" ").filter(Boolean);
    let hits = context.filter((p) => { const n = norm(p.name).split(" "); return tokens.every((t) => n.includes(t)); });
    if (q.company && hits.length) { const byCo = hits.filter((p) => companyMatches(p.company, q.company!) || (p.why === "Dell stakeholder" && isDellCompany(q.company!))); if (byCo.length) hits = byCo; }
    if (hits.length) return done(hits, "Several people on this workstream match — pick one.");
    return resolvePersonQuery(q, dir);
  }
  const stakeholders = context.filter((p) => p.why === "Dell stakeholder");
  if (/stakeholder/i.test(phrase) && stakeholders.length) return done(stakeholders, "", true);
  if (q.company?.trim()) {
    const dellAsk = isDellCompany(q.company);
    let hits = context.filter((p) => dellAsk ? p.why === "Dell stakeholder" : companyMatches(p.company, q.company!));
    if (q.role?.trim()) hits = hits.filter((p) => titleMatchesRole(p.title, q.role!));
    if (hits.length) {
      if (q.count && hits.length === q.count) return done(hits, "", true);
      return done(hits, `Pick who${q.role ? ` (${q.role})` : ""} at ${q.company} on this workstream.`);
    }
  }
  return resolvePersonQuery(q, dir);
}

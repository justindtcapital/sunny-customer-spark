// Dell Stakeholders on a workstream: stored as a comma-separated name list (the
// format every other reader uses), linked to saved people at read time. Only an
// exact full-name or email match links; same-name people prefer the Dell record,
// and anything still ambiguous stays unlinked for a human to pick.
import type { Contact } from "@/lib/types";
import { personNameKey } from "@/lib/contact-identity";
import { isDellContact } from "@/lib/dell-contacts";

export type StakeholderLink =
  | { name: string; status: "linked"; contact: Contact }
  | { name: string; status: "ambiguous"; candidates: Contact[] }
  | { name: string; status: "unlinked" };

/** Split the stored text into names (commas, semicolons, new lines, bullets), dropping repeats. */
export function splitStakeholders(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (text || "").split(/[,;\n•]+/)) {
    const name = raw.trim();
    const key = personNameKey(name) || name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export function joinStakeholders(names: string[]): string {
  return splitStakeholders(names.join(", ")).join(", ");
}

export function addStakeholder(text: string, name: string): string {
  return joinStakeholders([...splitStakeholders(text), name]);
}

export function removeStakeholder(text: string, index: number): string {
  return joinStakeholders(splitStakeholders(text).filter((_, i) => i !== index));
}

export function replaceStakeholder(text: string, index: number, name: string): string {
  return joinStakeholders(splitStakeholders(text).map((n, i) => (i === index ? name : n)));
}

function emailsOf(c: Pick<Contact, "email">): string[] {
  return (c.email || "").split(/[;,\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));
}

/** Link each stored name to a saved person: exact email or full name only, Dell first on ties. */
export function resolveStakeholders(text: string, contacts: Contact[]): StakeholderLink[] {
  const byName = new Map<string, Contact[]>();
  const byEmail = new Map<string, Contact[]>();
  for (const c of contacts) {
    const k = personNameKey(c.name);
    if (k && k.includes(" ")) byName.set(k, [...(byName.get(k) || []), c]);
    for (const e of emailsOf(c)) byEmail.set(e, [...(byEmail.get(e) || []), c]);
  }
  return splitStakeholders(text).map((name): StakeholderLink => {
    const found = name.includes("@") ? byEmail.get(name.toLowerCase()) || [] : byName.get(personNameKey(name)) || [];
    const unique = [...new Map(found.map((c) => [c.urid || c.id || c.email, c])).values()];
    if (unique.length === 1) return { name, status: "linked", contact: unique[0]! };
    if (unique.length === 0) return { name, status: "unlinked" };
    const dell = unique.filter((c) => isDellContact({ company: c.company, email: c.email, contactType: c.contactType || "" }));
    if (dell.length === 1) return { name, status: "linked", contact: dell[0]! };
    return { name, status: "ambiguous", candidates: dell.length ? dell : unique };
  });
}

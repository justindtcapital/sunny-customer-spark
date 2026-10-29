import { canonicalValue } from "./bulk-operation";

export interface PersonIdentity { urid?: string; name?: string; company?: string; email?: string; linkedin?: string; linkedinUrl?: string }
export const normalizeIdentity = (s?: string) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
export function emailIdentities(s?: string): string[] {
  return [...new Set((s || "").split(/[|;,\s]+/).map(normalizeIdentity).filter(s => s.includes("@")))].sort();
}
export function linkedinIdentity(s?: string): string {
  return normalizeIdentity(s).replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
}
export function peopleCandidates<T extends PersonIdentity>(p: PersonIdentity, rows: T[]): T[] {
  const emails = emailIdentities(p.email), li = linkedinIdentity(p.linkedin || p.linkedinUrl);
  return rows.filter(r => Boolean(
    (p.urid && r.urid === p.urid) || emailIdentities(r.email).some(e => emails.includes(e)) ||
    (li && li === linkedinIdentity(r.linkedin || r.linkedinUrl)) ||
    (normalizeIdentity(p.name) && normalizeIdentity(p.company) && normalizeIdentity(p.name) === normalizeIdentity(r.name) && normalizeIdentity(p.company) === normalizeIdentity(r.company))
  ));
}
/** Match proof covers every supplied business field; missing/differing associations require review. */
export function suppliedFieldsMatch(input: Record<string, unknown>, saved: Record<string, unknown>, ignore: string[] = []): boolean {
  return Object.entries(input).filter(([k,v]) => !ignore.includes(k) && v !== undefined && v !== "" && v !== null && !(Array.isArray(v) && v.length === 0))
    .every(([k,v]) => k === "email" ? canonicalValue(emailIdentities(String(v))) === canonicalValue(emailIdentities(String(saved[k] || ""))) : canonicalValue(v) === canonicalValue(saved[k]));
}
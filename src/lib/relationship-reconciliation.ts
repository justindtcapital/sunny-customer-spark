import type { BulkOutcome } from "./bulk-operation";

export interface RelationshipSelector {
  urid?: string; email: string; name?: string; temperature: string;
  destination?: string | null;
}
const norm = (s: string) => s.trim().toLowerCase();
export function sheetHeaders(rows: string[][]): string[] {
  const headers = (rows[0] || []).map(norm);
  const nonempty = headers.filter(Boolean);
  if (!headers.includes("urid") || new Set(nonempty).size !== nonempty.length)
    throw new Error("Missing stable ID column or duplicate headers; no safe verification is possible.");
  return headers;
}
export const sheetCell = (headers: string[], row: string[], key: string) => row[headers.indexOf(key)] || "";
export function sourceProfile(headers: string[], row: string[]): Record<string, string> {
  if (headers.some((h, i) => !h && Boolean(row[i]))) throw new Error("A populated source column has no header; source retained.");
  return Object.fromEntries(headers.flatMap((h, i) => h ? [[h, row[i] || ""]] : []));
}
export function exactProfile(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => a[k] === b[k]);
}
export function prospectProjection(profile: Record<string, string>): Record<string, string> {
  const names = (profile.name || profile["full name"] || "").trim().split(/\s+/);
  return { "first name": names[0] || "", "last name": names.slice(1).join(" "),
    email: profile.email || "", role: profile.role || profile.title || "", stage: "Prospecting",
    prime: profile["relationship prime"] || profile.prime || "", phone: profile["phone number"] || profile.phone || "",
    sector: profile["industry category"] || profile.sector || "" };
}
export function verifiedProspect(headers: string[], row: string[], urid: string): Record<string, string> | null {
  try {
    const profile = JSON.parse(sheetCell(headers, row, "network profile"));
    if (!profile || typeof profile !== "object" || Array.isArray(profile) || profile.urid !== urid || Object.values(profile).some(v => typeof v !== "string")) return null;
    const expected = prospectProjection(profile);
    return Object.entries(expected).every(([key,value]) => sheetCell(headers,row,key) === value) ? profile : null;
  } catch { return null; }
}
/** Pure, full-request inspection. No IDs are assigned and no records are changed. */
export function reconcileRelationships(selected: RelationshipSelector[], contacts: string[][], targets: string[][]): BulkOutcome[] {
  const ch = sheetHeaders(contacts), th = sheetHeaders(targets), seen = new Set<string>();
  return selected.map(s => {
    const key = s.urid || norm(s.email);
    const base = { key, label: s.name || s.email || "Contact", from: s.temperature, to: s.destination || "" };
    if (!s.urid) return { ...base, status: "blocked", reason: "Original request lacks a stable ID; review identity before retry." };
    if (seen.has(s.urid)) return { ...base, status: "duplicate", reason: "Same stable ID occurs twice in this request; no repeat write." };
    seen.add(s.urid);
    const network = contacts.slice(1).filter(r => sheetCell(ch,r,"urid") === s.urid);
    const prospects = targets.slice(1).filter(r => sheetCell(th,r,"urid") === s.urid);
    if (network.length > 1 || prospects.length > 1) return { ...base, status: "blocked", reason: "Duplicate stable IDs in saved records; manual review required." };
    if (s.destination === "Prospecting") {
      const target = prospects[0];
      const profile = target ? verifiedProspect(th,target,s.urid) : null;
      if (!network.length && prospects.length === 1 && profile) return { ...base, status: "already_complete", reason: "Verified full saved Prospecting profile and no Network source; no repeat transfer." };
      const source = network[0];
      if (source && (!target || (profile && exactProfile(sourceProfile(ch,source),profile)))) {
        const rating = norm(sheetCell(ch,source,"relationship status")) || "cold";
        if (rating !== norm(s.temperature)) return { ...base, status: "blocked", reason: `Saved rating is ${rating}; review the changed source.` };
        return { ...base, status: "failed", retryable: true, reason: target ? "Verified copy exists; unchanged Network source remains. Ready for reviewed continuation." : "Network source retained; no Prospecting copy. Ready for reviewed continuation." };
      }
      return { ...base, status: "blocked", reason: "Missing source or incompatible Prospecting profile; no deletion or overwrite authorized." };
    }
    const source = network[0];
    if (!source) return { ...base, status: "blocked", reason: "Network source missing; rating cannot be verified." };
    const rating = norm(sheetCell(ch,source,"relationship status")) || "cold";
    if (s.destination && rating === norm(s.destination)) return { ...base, status: "already_complete", reason: "Original destination rating is saved; no second tier change." };
    if (rating === norm(s.temperature) && s.destination) return { ...base, status: "failed", retryable: true, reason: "Original source rating remains; ready for reviewed continuation." };
    return { ...base, status: "blocked", reason: "Saved rating differs from the original request; review teammate changes." };
  });
}
import type { Contact } from "@/lib/types";

const compact = (s: string) => (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const SUFFIX = /\s*(,?\s*(inc|llc|ltd|corp|corporation|co|company|technologies|labs|ai|hq|group)\.?)+$/i;

/** Compact keys for each PortCo name, with and without common corporate suffixes. */
export function portcoKeys(names: string[]): Set<string> {
  const keys = new Set<string>();
  for (const n of names) {
    for (const v of [n, (n || "").replace(SUFFIX, "")]) {
      const k = compact(v);
      if (k.length >= 3) keys.add(k);
    }
  }
  return keys;
}

/**
 * A PortCo person works at a portfolio company (company matches a PortCo name, or the
 * legacy "Portfolio" sector). Derived at read time — the saved rating is never changed.
 */
export function isPortCoContact(c: Pick<Contact, "company" | "sector">, keys: Set<string>): boolean {
  if ((c.sector || "").trim().toLowerCase() === "portfolio") return true;
  const company = c.company || "";
  return keys.has(compact(company)) || keys.has(compact(company.replace(SUFFIX, "")));
}

/** Temperature filter: PortCo people match only "PortCo", never Hot/Warm/Cold/Council. */
export function matchesTemperatureFilter(c: Pick<Contact, "temperature" | "portco">, selected: string[]): boolean {
  if (!selected.length) return true;
  return c.portco ? selected.includes("PortCo") : selected.includes(c.temperature);
}

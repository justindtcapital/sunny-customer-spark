import type { Contact } from "@/lib/types";

const DELL_DOMAINS = new Set(["dell.com", "delltechnologies.com", "dellteam.com", "emc.com"]);

/**
 * A Dell person works at Dell: a Dell email address, a company that starts with the
 * word "Dell" (Dell Technologies, Dell EMC, Dell Financial Services…), or the manual
 * "Dell" contact type. Derived at read time for visibility only — records are never changed.
 */
export function isDellContact(c: Pick<Contact, "company" | "email" | "contactType">): boolean {
  if (c.contactType === "Dell") return true;
  const company = (c.company || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (company === "dell" || company.startsWith("dell ")) return true;
  return (c.email || "")
    .split(/[;,\s]+/)
    .map((e) => e.trim().toLowerCase().split("@")[1] || "")
    .some((d) => DELL_DOMAINS.has(d) || [...DELL_DOMAINS].some((dd) => d.endsWith(`.${dd}`)));
}

/** Visibility only: hide Dell people when the toggle is off. */
export function matchesDellVisibility(c: Pick<Contact, "company" | "email" | "contactType">, showDell: boolean): boolean {
  return showDell || !isDellContact(c);
}

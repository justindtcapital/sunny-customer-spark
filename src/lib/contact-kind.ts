// Who a person is (PortCo / Dell / Partner / Network), separate from how warm the
// relationship is. A manual pick in the Contact Type column always wins; otherwise
// the type is guessed at read time from the company/email. Never saved by the guess.
import type { Contact, ContactType } from "@/lib/types";
import { isPortCoContact, portcoKeys } from "@/lib/portco-contacts";
import { isDellContact } from "@/lib/dell-contacts";
import { matchPartner, type Partner } from "@/lib/partners";
import { linkContactsByDomain } from "@/lib/company-domains";

export type ContactKind = ContactType;
export const CONTACT_KINDS: ContactKind[] = ["PortCo", "Dell", "Partner", "Network"];
/** Network is everyone else, so only these three get a show/hide checkbox. */
export const TOGGLE_KINDS: ContactKind[] = ["PortCo", "Dell", "Partner"];

/** The manual type saved in Contact Type, or null (blank or legacy Customer/VC = automatic). */
export function manualKind(contactType?: string): ContactKind | null {
  const k = (contactType || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (k === "portco" || k === "portfolio") return "PortCo";
  if (k === "dell") return "Dell";
  if (k === "partner") return "Partner";
  if (k === "network") return "Network";
  return null;
}

/** Manual pick wins; otherwise PortCo, then Dell, then Partner, then Network. */
export function resolveKind(manual: ContactKind | null, guess: { portco: boolean; dell: boolean; partner: boolean }): ContactKind {
  if (manual) return manual;
  return guess.portco ? "PortCo" : guess.dell ? "Dell" : guess.partner ? "Partner" : "Network";
}

/** PortCo people aren't rated; Dell, Partner and Network people keep Council–Cold/Prospect. */
export const tracksRating = (kind?: ContactKind) => kind !== "PortCo";

/** Show/hide by type: hidden types drop out of the list and the pyramid. */
export function kindShown(c: Pick<Contact, "kind">, hidden: ContactKind[]): boolean {
  return !hidden.includes(c.kind || "Network");
}

export function toggleKind(hidden: ContactKind[], kind: ContactKind): ContactKind[] {
  return hidden.includes(kind) ? hidden.filter((k) => k !== kind) : [...hidden, kind];
}

/** Partner a person works at (company name, else verified domain). Dell has its own type. */
export function partnerForContact(c: { company?: string; email?: string }, partners: Partner[]): Partner | null {
  const list = partners.filter((p) => p.category !== "Dell");
  const byName = matchPartner(c.company || "", list);
  if (byName) return byName;
  for (const p of list) {
    if (linkContactsByDomain([{ email: c.email || "" }], { name: p.name, website: p.website, domainAliases: p.domainAliases })[0]) return p;
  }
  return null;
}

/** Stamp each person's read-time type (and the legacy portco flag) without touching saved fields. */
export function classifyContacts<T extends Contact>(contacts: T[], ctx: { portcoNames: string[]; partners: Partner[] }): T[] {
  const keys = portcoKeys(ctx.portcoNames);
  return contacts.map((c) => {
    const kind = resolveKind(manualKind(c.contactType), {
      portco: isPortCoContact(c, keys),
      dell: isDellContact({ company: c.company, email: c.email, contactType: "" }),
      partner: !!partnerForContact(c, ctx.partners),
    });
    return { ...c, kind, portco: kind === "PortCo" };
  });
}

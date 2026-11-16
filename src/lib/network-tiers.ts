// Network page tier toggles: Prospecting is one more tier on the unified
// Contacts list, so the pyramid toggles any mix of tiers on/off.
import type { Contact, TargetLead } from "@/lib/types";
import { targetKeyOf } from "@/lib/types";
import type { PyramidTier } from "@/lib/network-pyramid";

/** Opening view: the active network on, prospects one click away. */
export const DEFAULT_VISIBLE_TIERS: PyramidTier[] = ["Council", "Hot", "Warm", "Cold"];

/**
 * The pyramid tier a person sits in. PortCo people aren't rated, so they sit in no
 * tier (null) whatever rating is still saved on their row; prospects are "Prospect".
 */
export const contactTier = (c: Pick<Contact, "temperature" | "prospect" | "kind">): PyramidTier | null =>
  c.prospect ? "Prospect" : c.kind === "PortCo" ? null : c.temperature;

export function toggleTier(visible: PyramidTier[], tier: PyramidTier): PyramidTier[] {
  return visible.includes(tier) ? visible.filter((t) => t !== tier) : [...visible, tier];
}

/** Rated people follow the tier toggles; unrated PortCo people follow only the PortCo checkbox. */
export function tierVisible(c: Pick<Contact, "temperature" | "prospect" | "kind">, visible: PyramidTier[]): boolean {
  const tier = contactTier(c);
  return tier === null || visible.includes(tier);
}

/** Present a prospect-flagged row in the Network list (read-only view; never saved). */
export function prospectAsContact(t: TargetLead): Contact {
  return {
    id: `prospect:${t.id}`, urid: t.urid, name: t.name, title: t.title, company: t.company, email: t.email,
    phone: t.phone, address: "", prime: t.prime || "", sector: t.sector, areasOfInterest: [], temperature: "Cold",
    prospect: true, prospectKey: targetKeyOf(t), portCoIntros: [], eventsAttended: t.eventsAttended || [],
    eventsInvited: t.eventsInvited || [], interactions: [], location: t.location, linkedinUrl: t.linkedinUrl,
    dateAdded: t.dateAdded, followUpPending: t.followUp, contactType: t.contactType || "",
  };
}

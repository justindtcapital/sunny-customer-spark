// Network page tier toggles: Prospecting is one more tier on the unified
// Contacts list, so the pyramid toggles any mix of tiers on/off.
import type { Contact, TargetLead } from "@/lib/types";
import { targetKeyOf } from "@/lib/types";
import type { PyramidTier } from "@/lib/network-pyramid";

/** Opening view: the active network on, prospects one click away. */
export const DEFAULT_VISIBLE_TIERS: PyramidTier[] = ["Council", "Hot", "Warm", "Cold"];

export const contactTier = (c: Pick<Contact, "temperature" | "prospect">): PyramidTier => (c.prospect ? "Prospect" : c.temperature);

export function toggleTier(visible: PyramidTier[], tier: PyramidTier): PyramidTier[] {
  return visible.includes(tier) ? visible.filter((t) => t !== tier) : [...visible, tier];
}

/** Every shown person sits in a tier (PortCo people at their saved rating), so tiers filter everyone alike. */
export function tierVisible(c: Pick<Contact, "temperature" | "prospect">, visible: PyramidTier[]): boolean {
  return visible.includes(contactTier(c));
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

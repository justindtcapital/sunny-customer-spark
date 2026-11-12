// Pure helpers for a prospect's linked events (Prospecting profiles).
//
// Links live in the shared CRM "Events" tab (one row per person + event, keyed by
// Contact URID then email). Removal is append-only: matching rows get a
// "Removed At" stamp, or a stamped row is appended when only the legacy Targets
// "Event" cell carries the link — so nothing is deleted and provenance survives.

export type EventLinkType = "attended" | "invited";

export interface EventLinkRow {
  eventName: string;
  type?: string;
  removedAt?: string;
}

export interface ProspectEvents {
  eventsAttended: string[];
  eventsInvited: string[];
}

const keyOf = (name: string) => name.trim().toLowerCase();
export const linkTypeOf = (type?: string): EventLinkType =>
  (type || "attended").trim().toLowerCase() === "invited" ? "invited" : "attended";

/**
 * Resolve the events shown on a prospect profile.
 * - An (event, type) pair shows when any un-removed row exists for it.
 * - The legacy single "Event" cell counts as an Invited link unless a removal
 *   row exists for it (and no active row re-added it), or the person already
 *   has an Attended link to that same event.
 * - Names dedupe case-insensitively; the first spelling seen wins.
 */
export function resolveProspectEvents(rows: EventLinkRow[], legacyEvent?: string): ProspectEvents {
  const active = { attended: new Map<string, string>(), invited: new Map<string, string>() };
  const removed = { attended: new Set<string>(), invited: new Set<string>() };
  for (const r of rows) {
    const name = (r.eventName || "").trim();
    if (!name) continue;
    const t = linkTypeOf(r.type);
    if ((r.removedAt || "").trim()) removed[t].add(keyOf(name));
    else if (!active[t].has(keyOf(name))) active[t].set(keyOf(name), name);
  }
  const legacy = (legacyEvent || "").trim();
  // An Attended link for the same event wins: the legacy cell never shows them as Invited too.
  if (
    legacy &&
    !removed.invited.has(keyOf(legacy)) &&
    !active.invited.has(keyOf(legacy)) &&
    !active.attended.has(keyOf(legacy))
  ) {
    active.invited = new Map([[keyOf(legacy), legacy], ...active.invited]);
  }
  return { eventsAttended: [...active.attended.values()], eventsInvited: [...active.invited.values()] };
}

/** Add one link locally without replacing others; a duplicate (any case) is a no-op. */
export function addProspectEvent(current: ProspectEvents, name: string, type: EventLinkType): ProspectEvents {
  const n = name.trim();
  if (!n) return current;
  const field = type === "invited" ? "eventsInvited" : "eventsAttended";
  if (current[field].some((e) => keyOf(e) === keyOf(n))) return current;
  return { ...current, [field]: [...current[field], n] };
}

/** Remove only the named link of the given type locally. */
export function removeProspectEvent(current: ProspectEvents, name: string, type: EventLinkType): ProspectEvents {
  const field = type === "invited" ? "eventsInvited" : "eventsAttended";
  return { ...current, [field]: current[field].filter((e) => keyOf(e) !== keyOf(name)) };
}

/** Every event a prospect is linked to (for the Event filter and counts). */
export function prospectEventNames(t: { event?: string; eventsAttended?: string[]; eventsInvited?: string[] }): string[] {
  const seen = new Map<string, string>();
  const all = t.eventsAttended || t.eventsInvited
    ? [...(t.eventsAttended || []), ...(t.eventsInvited || [])]
    : [t.event || ""];
  for (const raw of all) {
    const n = (raw || "").trim();
    if (n && !seen.has(keyOf(n))) seen.set(keyOf(n), n);
  }
  return [...seen.values()];
}

/** Does this prospect already have this event linked (any type)? */
export function hasProspectEvent(t: { event?: string; eventsAttended?: string[]; eventsInvited?: string[] }, name: string): boolean {
  return prospectEventNames(t).some((e) => keyOf(e) === keyOf(name));
}

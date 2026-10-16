import { teamMemberFor } from "@/lib/user-ownership";
/** Dashboard "Action owners" — matched loosely on last-name stems (Hellock/Hillock, Beach/Beech). */
export const ACTION_OWNERS: { name: string; test: RegExp }[] = [
  { name: "Chris Falloon", test: /fall?oon/i },
  { name: "Chris Hillock", test: /h[ei]ll?ock/i },
  { name: "Shane Earley", test: /earl?e?y|shane/i },
  { name: "Julia Beech", test: /bee?ch|beach|julia/i },
];

export function ownerMatches(owner: string, selected: string): boolean {
  if (!selected) return true;
  const canonical = teamMemberFor(owner);
  if (canonical) return canonical.displayName === (teamMemberFor(selected)?.displayName || selected);
  const o = ACTION_OWNERS.find((a) => a.name === selected);
  if (!o) return (owner || "").toLowerCase() === selected.toLowerCase();
  // Any of a teammate's addresses (dell.com or DT Capital) identify them.
  for (const e of (owner || "").match(/[\w.+-]+@[\w.-]+/g) || []) if (teamMemberFor(e)?.displayName === selected) return true;
  return o.test.test(owner || "");
}

/** Lower is more important. "1 - High" → 1; text fallbacks; unset last. */
export function priorityRank(raw: string): number {
  const t = (raw || "").trim().toLowerCase();
  if (!t) return 99;
  const m = /^(\d+)/.exec(t);
  if (m) return Number(m[1]);
  if (/critical|urgent|needle/.test(t)) return 0;
  if (/high/.test(t)) return 1;
  if (/med|nurture/.test(t)) return 2;
  if (/low|back/.test(t)) return 3;
  return 50;
}

import { dtcStatusOf, type PlannerEvent } from "./event-planner";

/** Fields in the side-panel draft that differ from the saved event (only these are sent on save). */
export function changedFields(saved: PlannerEvent, draft: Partial<PlannerEvent>): Partial<PlannerEvent> {
  const out: Partial<PlannerEvent> = {};
  for (const k of Object.keys(draft) as (keyof PlannerEvent)[]) {
    if (JSON.stringify(draft[k] ?? "") !== JSON.stringify(saved[k] ?? "")) (out as Record<string, unknown>)[k] = draft[k];
  }
  return out;
}

/** Why a draft can't be saved yet, or "" when it can. rowOf maps a category to its planner row. */
export function draftProblem(saved: PlannerEvent, patch: Partial<PlannerEvent>, rowOf: (sub: string) => string, today: string): string {
  const next = { ...saved, ...patch };
  if ("name" in patch && !next.name.trim()) return "Event name is required";
  if ("dtcStatus" in patch || "subcategory" in patch) {
    const dtc = dtcStatusOf(next, today);
    if (dtc !== "Potential" && dtc !== "Declined" && rowOf(next.subcategory) === "Unassigned")
      return "Pick a category first so the event can move into its planner row.";
  }
  if (next.start && next.end && next.end < next.start) return "End date is before the start date";
  return "";
}

/** Case-insensitive list membership for picker values (official PortCo / Partner names). */
export function inList(list: string[], name: string): boolean {
  const n = name.trim().toLowerCase();
  return list.some((x) => x.trim().toLowerCase() === n);
}

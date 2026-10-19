import { ownerMatches } from "./action-owners";

export interface CompletedAction {
  id: string;
  kind: "workstream" | "followup" | "note" | "activity";
  title: string;
  date: string;
  person: string;
  portco: string;
  owner: string;
  actionId?: string;
  followUpActivityId?: string;
  workstreamGid?: string;
}

/** All recorded completions, without a date cutoff, deduplicated and owner-scoped. */
export function completedActions(rows: CompletedAction[], owner: string, undone: Set<string>): CompletedAction[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if ((owner && !ownerMatches(row.owner, owner)) || (row.actionId && undone.has(row.actionId)) || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));
}
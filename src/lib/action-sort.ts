// Pure helpers for the My Actions feed: which company kinds pass the filter, and list ordering.

export type CompanyKind = "portcos" | "network" | "ops";

/** With no company box ticked there is no company restriction — every company's items show. */
export function companyKindVisible(toggles: Record<CompanyKind, boolean>, kind: CompanyKind): boolean {
  const any = toggles.portcos || toggles.network || toggles.ops;
  return !any || toggles[kind];
}

export type ActionSort = "portco" | "date" | "due" | "priority";
export const ACTION_SORTS: { value: ActionSort; label: string }[] = [
  { value: "portco", label: "PortCo" },
  { value: "date", label: "Date" },
  { value: "due", label: "Due date" },
  { value: "priority", label: "Priority" },
];

/** 1 = Must Do, 2 = Should Do, 3 = Could Do, 4 = other wording, 5 = no priority. */
export function priorityRank(p: string | undefined): number {
  if (!p?.trim()) return 5;
  if (/must|^\s*1\b/i.test(p)) return 1;
  if (/should|^\s*2\b/i.test(p)) return 2;
  if (/could|^\s*3\b/i.test(p)) return 3;
  return 4;
}

/** What a feed row needs for sorting; `date` is when it was added or last touched. */
export interface SortableAction {
  company: string;
  title: string;
  date?: string;
  due?: string;
  priority?: string;
}

const day = (s?: string) => (s || "").slice(0, 10);

/**
 * Flat ordering for the non-PortCo sorts: Date is newest first, Due date is soonest first,
 * Priority is Must → Should → Could. Rows without the value go last; ties fall back to company then title.
 */
export function sortActions<T extends SortableAction>(items: T[], sort: ActionSort): T[] {
  const tie = (a: T, b: T) => a.company.localeCompare(b.company) || a.title.localeCompare(b.title);
  const cmp = (a: T, b: T): number => {
    if (sort === "date") {
      const x = day(a.date), y = day(b.date);
      if (x !== y) return !x ? 1 : !y ? -1 : y.localeCompare(x);
    } else if (sort === "due") {
      const x = day(a.due), y = day(b.due);
      if (x !== y) return !x ? 1 : !y ? -1 : x.localeCompare(y);
    } else if (sort === "priority") {
      const d = priorityRank(a.priority) - priorityRank(b.priority);
      if (d) return d;
      const x = day(a.due), y = day(b.due);
      if (x !== y) return !x ? 1 : !y ? -1 : x.localeCompare(y);
    }
    return tie(a, b);
  };
  return [...items].sort(cmp);
}

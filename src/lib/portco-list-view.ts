// Pure helpers for the PortCo list + detail layout (presentation only).
import { cleanPriority } from "@/lib/portco-matrix";

/** "1 - Needle Mover" → "NM"; "Back Burner" → "BB"; single words → first two letters. */
export function priorityAbbrev(raw: string): string {
  const words = cleanPriority(raw).split(/[\s/-]+/).filter(Boolean);
  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
}

export interface ListFilter {
  domain: string | "all";
  priority: string | "all";
}

/** Domain/priority chip filters, applied on top of the sidebar filters. */
export function matchesListFilter(
  c: { domain: string; priority: string },
  f: ListFilter,
): boolean {
  if (f.domain !== "all" && c.domain !== f.domain) return false;
  if (f.priority !== "all" && priorityChip(c.priority) !== f.priority) return false;
  return true;
}

/** The three DTC priority levels shown as chips, in display order. */
export const PRIORITY_CHIPS = ["NM", "NU", "BB"] as const;
export type PriorityChip = (typeof PRIORITY_CHIPS)[number];

export const PRIORITY_LABELS: Record<PriorityChip, string> = { NM: "Needle Mover", NU: "Nurture", BB: "Back Burner" };

/** Known chip for a raw priority, or null for anything else (no extra categories). */
export function priorityChip(raw: string): PriorityChip | null {
  const a = priorityAbbrev(raw);
  return (PRIORITY_CHIPS as readonly string[]).includes(a) ? (a as PriorityChip) : null;
}

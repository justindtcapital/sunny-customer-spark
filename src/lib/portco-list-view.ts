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
  if (f.priority !== "all" && cleanPriority(c.priority) !== f.priority) return false;
  return true;
}

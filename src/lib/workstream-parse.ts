/**
 * Asana subtask names follow a workstream convention:
 *   "MavenAGI -> GTM -> Pitch Evolution"
 *   "Savant -> BD -> Dell A/P"
 * Some are shorter ("BD -> Dell Services") or have no arrows at all.
 * This parser is pure so it can be unit tested.
 */

export type WorkstreamSegment = "BD" | "GTM" | "Other";

export interface ParsedWorkstreamName {
  /** Company token if the name led with one (may be empty). */
  company: string;
  segment: WorkstreamSegment;
  /** Human label for the workstream itself. */
  name: string;
}

function classify(token: string): WorkstreamSegment | null {
  const t = token.trim().toLowerCase();
  if (t === "bd" || t === "b/d" || t === "business development") return "BD";
  if (t === "gtm" || t === "go to market" || t === "go-to-market") return "GTM";
  return null;
}

export function parseWorkstreamName(raw: string, companyHint = ""): ParsedWorkstreamName {
  const parts = (raw || "")
    .split(/->|→|»/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return { company: companyHint, segment: "Other", name: (raw || "").trim() };

  let company = "";
  let segment: WorkstreamSegment = "Other";
  const rest: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const seg = classify(part);
    if (seg && segment === "Other") {
      segment = seg;
      continue;
    }
    if (
      i === 0 &&
      companyHint &&
      part.trim().toLowerCase() === companyHint.trim().toLowerCase()
    ) {
      company = part.trim();
      continue;
    }
    if (i === 0 && parts.length > 1 && !seg) {
      // Leading token before a segment marker is treated as the company.
      const nextIsSegment = classify(parts[1] || "") != null;
      if (nextIsSegment) {
        company = part.trim();
        continue;
      }
    }
    rest.push(part);
  }

  return {
    company: company || companyHint,
    segment,
    name: rest.join(" · ") || parts[parts.length - 1]!,
  };
}

export interface Workstream {
  gid: string;
  /** Lowercased portco key, matching fieldsByCompanyName. */
  companyKey: string;
  company: string;
  segment: WorkstreamSegment;
  name: string;
  rawName: string;
  status: string;
  category: string;
  sellInStatus: string;
  maturity: string;
  dellTargets: string;
  dellStakeholders: string;
  nextSteps: string;
  traction: string;
  owner: string;
  completed: boolean;
  lastActivity: string;
  url?: string;
}

/**
 * Sector vocabulary for the Targets tab (column "Sector").
 *
 * Some legacy/Apollo-sourced rows landed a person's *headline* or job title in the
 * Sector cell ("Field CTO", "Head of Digital Product Marketing", …). These helpers
 * keep the Sector column — and therefore the Sector filter — a clean industry list:
 * canonical casing for known industries, and title-like text rejected outright.
 */

export const CANONICAL_SECTORS = [
  "Airlines",
  "Automotive",
  "Consulting",
  "Consumer",
  "Education",
  "Energy & Utilities",
  "Financial Services",
  "Government",
  "Healthcare",
  "Industrials",
  "Infrastructure",
  "Insurance",
  "Logistics",
  "Manufacturing",
  "Media & Entertainment",
  "Portfolio",
  "Real Estate",
  "Retail",
  "Technology",
  "Telecom",
  "Travel & Hospitality",
] as const;

// Raw values (usually Apollo `industry`) mapped onto the canonical vocabulary.
const SECTOR_ALIASES: Record<string, string> = {
  "information technology & services": "Technology",
  "information technology and services": "Technology",
  "computer software": "Technology",
  software: "Technology",
  it: "Technology",
  internet: "Technology",
  "financial services": "Financial Services",
  banking: "Financial Services",
  finance: "Financial Services",
  "capital markets": "Financial Services",
  "venture capital & private equity": "Financial Services",
  insurance: "Insurance",
  "hospital & health care": "Healthcare",
  "health care": "Healthcare",
  healthcare: "Healthcare",
  pharmaceuticals: "Healthcare",
  biotechnology: "Healthcare",
  airlines: "Airlines",
  "airlines/aviation": "Airlines",
  aviation: "Airlines",
  utilities: "Energy & Utilities",
  energy: "Energy & Utilities",
  "oil & energy": "Energy & Utilities",
  "renewables & environment": "Energy & Utilities",
  telecommunications: "Telecom",
  telecom: "Telecom",
  wireless: "Telecom",
  retail: "Retail",
  "consumer goods": "Retail",
  supermarkets: "Retail",
  manufacturing: "Manufacturing",
  "industrial automation": "Manufacturing",
  machinery: "Manufacturing",
  automotive: "Automotive",
  "logistics & supply chain": "Logistics",
  "transportation/trucking/railroad": "Logistics",
  logistics: "Logistics",
  "media production": "Media & Entertainment",
  entertainment: "Media & Entertainment",
  broadcasting: "Media & Entertainment",
  "management consulting": "Consulting",
  consulting: "Consulting",
  government: "Government",
  "government administration": "Government",
  "public safety": "Government",
  "real estate": "Real Estate",
  construction: "Infrastructure",
  "civil engineering": "Infrastructure",
  infrastructure: "Infrastructure",
  "higher education": "Education",
  education: "Education",
  "education management": "Education",
  hospitality: "Travel & Hospitality",
  "travel & tourism": "Travel & Hospitality",
  portfolio: "Portfolio",
};

const CANONICAL_LOOKUP = new Map<string, string>(
  CANONICAL_SECTORS.map((s) => [s.toLowerCase(), s]),
);

// Words that only ever show up in a job title / headline, never in an industry.
const TITLE_TOKENS = [
  "chief",
  "cto",
  "cio",
  "ciso",
  "cdo",
  "coo",
  "ceo",
  "cfo",
  "president",
  "vp",
  "svp",
  "evp",
  "avp",
  "vice president",
  "director",
  "head of",
  "manager",
  "lead",
  "specialist",
  "coordinator",
  "engineer",
  "architect",
  "analyst",
  "officer",
  "executive",
  "strategist",
  "advisor",
  "principal",
  "partner ",
  "associate",
  "field ",
  "senior",
  "sr.",
  "jr.",
  "owner",
  "founder",
];

/**
 * True when a Sector cell clearly holds a person's role/headline instead of an
 * industry. Canonical sectors are always accepted first so legitimate values
 * containing a stray keyword can never be rejected.
 */
export function looksLikeJobTitle(value: string): boolean {
  const raw = (value || "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (CANONICAL_LOOKUP.has(lower) || SECTOR_ALIASES[lower]) return false;
  // Headlines are long and often pipe/comma separated.
  if (raw.includes("|")) return true;
  if (raw.length > 40) return true;
  return TITLE_TOKENS.some((t) => lower.includes(t));
}

/**
 * Normalize a raw sector value: canonical casing when recognized, "" when the
 * value is really a job title, otherwise the trimmed original.
 */
export function normalizeSector(value: string | undefined | null): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  const canonical = CANONICAL_LOOKUP.get(lower) || SECTOR_ALIASES[lower];
  if (canonical) return canonical;
  if (looksLikeJobTitle(raw)) return "";
  return raw;
}

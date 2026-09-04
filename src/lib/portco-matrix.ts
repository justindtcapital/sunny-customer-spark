/**
 * PortCo prioritization matrix — parse the Asana portfolio project custom
 * fields into typed points for the dashboard bubble chart.
 *
 * Field labels in Asana (verbatim, some carry trailing spaces):
 *   "GTM Marketing/PMF "   → "3 - Moderate"
 *   "Sales Maturity"       → "2 - Immature / Emerging"
 *   "DTC Investment ($M)"  → "8.7"
 *   "DTC Ownership"        → "0.116"  (fraction) or "11.6%" 
 *   "Lead Investor "       → "Radhika"
 *   "Company Stage"        → "Series A"
 *   "DTC Priority"         → "1 - Needle Mover"
 */

export interface MatrixPoint {
  key: string;
  name: string;
  /** 1..5 GTM maturity (PMF) or null when unscored. */
  gtm: number | null;
  /** 1..5 sales maturity or null when unscored. */
  sales: number | null;
  gtmLabel: string;
  salesLabel: string;
  /** DTC investment in millions of dollars. */
  investment: number | null;
  /** DTC ownership as a fraction (0.116 = 11.6%). */
  ownership: number | null;
  investor: string;
  stage: string;
  priority: string;
  website: string;
}

/** Find a field by fuzzy label match (labels carry stray whitespace/casing). */
function field(fields: Record<string, string>, test: RegExp): string {
  for (const [k, v] of Object.entries(fields)) {
    if (test.test(k.trim())) return (v || "").trim();
  }
  return "";
}

/** "4 - Proven & Refining" → 4; anything unparseable → null. */
export function parseScore(raw: string): number | null {
  const m = /(-?\d+(?:\.\d+)?)/.exec(raw || "");
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

function parseMoney(raw: string): number | null {
  const cleaned = (raw || "").replace(/[$,\s]/g, "");
  const m = /(-?\d+(?:\.\d+)?)/.exec(cleaned);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseOwnership(raw: string): number | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  const pct = trimmed.endsWith("%");
  const n = parseMoney(trimmed);
  if (n === null) return null;
  if (pct) return n / 100;
  // Bare values above 1 are almost certainly percentages typed without a sign.
  return n > 1 ? n / 100 : n;
}

export const SALES_LABELS = [
  "1: Founder Led",
  "2: Emerging",
  "3: Repeatable & Tooled",
  "4: Enterprise Ready",
  "5: Mature & Scaling",
];

export const GTM_LABELS = [
  "1: Premature",
  "2: Basic",
  "3: Moderate",
  "4: Proven & Refining",
  "5: Mature",
];

export function buildMatrixPoints(
  asanaFieldsByPortco: Record<string, Record<string, string>>,
  namesByPortco: Record<string, string>,
  websiteByPortco: Record<string, string> = {},
): MatrixPoint[] {
  const points: MatrixPoint[] = [];
  for (const [key, fields] of Object.entries(asanaFieldsByPortco || {})) {
    const gtmLabel = field(fields, /^gtm\s+marketing\/?pmf$/i) || field(fields, /pmf/i);
    const salesLabel = field(fields, /^sales\s+maturity$/i);
    points.push({
      key,
      name: namesByPortco[key] || key,
      gtm: parseScore(gtmLabel),
      sales: parseScore(salesLabel),
      gtmLabel,
      salesLabel,
      investment: parseMoney(field(fields, /^dtc\s+investment/i)),
      ownership: parseOwnership(field(fields, /^dtc\s+ownership/i)),
      investor: field(fields, /^lead\s+investor$/i),
      stage: field(fields, /^company\s+stage$/i),
      priority: field(fields, /^dtc\s+priority$/i),
      website: websiteByPortco[key] || "",
    });
  }
  return points.sort((a, b) => a.name.localeCompare(b.name));
}

/** Distinct lead investors across the matrix, alphabetical. */
export function matrixInvestors(points: MatrixPoint[]): string[] {
  return [...new Set(points.map((p) => p.investor).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Bubble radius in px from investment ($M). */
export function bubbleRadius(investment: number | null): number {
  const v = investment ?? 0;
  if (v <= 0) return 14;
  // sqrt scale keeps area proportional to dollars.
  return Math.max(14, Math.min(38, 11 + Math.sqrt(v) * 4.2));
}

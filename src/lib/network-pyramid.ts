// Pure helpers for the Network Pyramid dashboard (tiers × domain/market/KPI).

export type PyramidTier = "Prospect" | "Cold" | "Warm" | "Hot" | "Council";
/** Top → bottom, as drawn. */
export const PYRAMID_TIERS: PyramidTier[] = ["Council", "Hot", "Warm", "Cold", "Prospect"];

export const PRIMARY_DOMAINS = ["Security", "AI & Data", "Logistics", "Other"] as const;
export type PrimaryDomain = (typeof PRIMARY_DOMAINS)[number];

export const MARKETS = ["New York", "Boston", "San Francisco", "Austin", "Other US", "Europe", "Other International", "Unknown"] as const;
export type Market = (typeof MARKETS)[number];

/** Volume dots: large = 50, then 10, 5, 1. */
export function dotBreakdown(n: number): { size: 50 | 10 | 5 | 1; count: number }[] {
  let rest = Math.max(0, Math.floor(n));
  return ([50, 10, 5, 1] as const).map((size) => {
    const count = Math.floor(rest / size);
    rest -= count * size;
    return { size, count };
  });
}

const DOMAIN_RULES: [Exclude<PrimaryDomain, "Other">, RegExp][] = [
  ["Security", /secur|cyber|identity|zero.?trust|threat|soc\b|iam\b|privacy|risk/i],
  ["AI & Data", /\bai\b|a\.i\.|artificial|machine learning|\bml\b|genai|llm|data|analytic/i],
  ["Logistics", /logistic|supply.?chain|freight|shipping|transport|fleet|warehous/i],
];

/** One primary domain per person: an approved explicit value wins, else the first matching area. */
export function primaryDomainFor(explicit: string | undefined, areas: string[] = []): PrimaryDomain {
  const e = (explicit || "").trim().toLowerCase();
  const hit = PRIMARY_DOMAINS.find((d) => d.toLowerCase() === e);
  if (hit) return hit;
  for (const a of areas) for (const [d, re] of DOMAIN_RULES) if (re.test(a)) return d;
  return "Other";
}

const US_STATES = "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new mexico|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia";
const US_ABBR = "al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|mi|mn|ms|mo|mt|ne|nv|nh|nm|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc";
const EUROPE = /\b(uk|u\.k\.|united kingdom|england|scotland|wales|ireland|london|france|paris|germany|berlin|munich|netherlands|amsterdam|belgium|brussels|switzerland|zurich|geneva|austria|vienna|spain|madrid|barcelona|portugal|lisbon|italy|milan|rome|sweden|stockholm|norway|oslo|denmark|copenhagen|finland|helsinki|poland|warsaw|czech|prague|hungary|greece|romania|estonia|luxembourg|europe)\b/i;
const OTHER_INTL = /\b(canada|toronto|vancouver|montreal|mexico|brazil|argentina|chile|colombia|india|bangalore|bengaluru|mumbai|delhi|china|beijing|shanghai|hong kong|japan|tokyo|korea|seoul|singapore|australia|sydney|melbourne|new zealand|israel|tel aviv|uae|dubai|saudi|qatar|south africa|nigeria|kenya|egypt|turkey|istanbul|taiwan|philippines|vietnam|indonesia|malaysia|thailand)\b/i;

/** Roll a free-text location up to a major market. */
export function marketFor(location: string | undefined): Market {
  const s = (location || "").trim().toLowerCase();
  if (!s) return "Unknown";
  if (/new york|\bnyc\b|manhattan|brooklyn|queens|bronx|staten island|long island|\bny\b|new jersey|\bnj\b|jersey city|hoboken|newark|stamford|white plains/.test(s)) return "New York";
  if (/boston|massachusetts|\bma\b|cambridge, ?ma|somerville|waltham|burlington, ?ma|lexington|newton|woburn|quincy/.test(s)) return "Boston";
  if (/san francisco|\bsf\b|bay area|silicon valley|san jose|palo alto|menlo park|mountain view|sunnyvale|santa clara|redwood city|oakland|berkeley|san mateo|fremont|cupertino|los gatos|burlingame|south san francisco/.test(s)) return "San Francisco";
  if (/austin|round rock|cedar park|georgetown, ?tx|san marcos/.test(s)) return "Austin";
  if (EUROPE.test(s)) return "Europe";
  if (OTHER_INTL.test(s)) return "Other International";
  if (new RegExp(`\\b(${US_STATES})\\b|united states|\\busa?\\b|\\b(${US_ABBR})\\b`).test(s)) return "Other US";
  return "Unknown";
}

const RANK: Record<string, number> = { prospect: 0, prospecting: 0, cold: 1, warm: 2, hot: 3, council: 4 };
export function tierOf(raw: string): PyramidTier | null {
  const r = RANK[(raw || "").trim().toLowerCase()];
  return r === undefined ? null : (["Prospect", "Cold", "Warm", "Hot", "Council"] as PyramidTier[])[r];
}

export type MovementKind = "added" | "removed" | "promoted" | "demoted";
export interface Movement { ts: string; email: string; from: string; to: string }

/** Classify a Rating History row: blank → tier is Added, tier → "Removed" is Removed. */
export function classifyMovement(m: Pick<Movement, "from" | "to">): { kind: MovementKind; from: PyramidTier | null; to: PyramidTier | null } | null {
  const from = tierOf(m.from);
  const toRaw = (m.to || "").trim().toLowerCase();
  if (toRaw === "removed") return from ? { kind: "removed", from, to: null } : null;
  const to = tierOf(m.to);
  if (!to) return null;
  if (!from) return { kind: "added", from: null, to };
  const d = RANK[to.toLowerCase()] - RANK[from.toLowerCase()];
  if (d === 0) return null;
  return { kind: d > 0 ? "promoted" : "demoted", from, to };
}

export const WINDOWS = { "30d": 30, "6m": 182, "12m": 365 } as const;
export type WindowKey = keyof typeof WINDOWS;

export interface TierKpi { added: number; removed: number; promotedIn: number; demotedOut: number }

/**
 * Per-tier movement counts inside the window. "Added" unions logged additions
 * with people whose Date Added falls in the window (history predating the log).
 */
export function movementKpis(
  movements: Movement[],
  dated: { email: string; tier: PyramidTier; dateAdded?: string }[],
  days: number,
  now = Date.now(),
): Record<PyramidTier, TierKpi> {
  const since = now - days * 86_400_000;
  const out = Object.fromEntries(PYRAMID_TIERS.map((t) => [t, { added: 0, removed: 0, promotedIn: 0, demotedOut: 0 }])) as Record<PyramidTier, TierKpi>;
  const addedKeys = new Set<string>();
  const inWindow = (d?: string) => { const t = Date.parse(d || ""); return !Number.isNaN(t) && t >= since && t <= now; };
  for (const m of movements) {
    if (!inWindow(m.ts)) continue;
    const c = classifyMovement(m);
    if (!c) continue;
    if (c.kind === "added" && c.to) {
      const key = `${c.to}|${m.email.toLowerCase()}`;
      if (addedKeys.has(key)) continue;
      addedKeys.add(key); out[c.to].added++;
    } else if (c.kind === "removed" && c.from) out[c.from].removed++;
    else if (c.kind === "promoted" && c.to) out[c.to].promotedIn++;
    else if (c.kind === "demoted" && c.from) out[c.from].demotedOut++;
  }
  for (const d of dated) {
    if (!inWindow(d.dateAdded)) continue;
    const key = `${d.tier}|${d.email.toLowerCase()}`;
    if (addedKeys.has(key)) continue;
    addedKeys.add(key); out[d.tier].added++;
  }
  return out;
}

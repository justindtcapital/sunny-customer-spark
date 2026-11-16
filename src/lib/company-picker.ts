// Pure ranking for the PortCo / Partner / Company picker (browser-safe).
// Spaces, punctuation and case are ignored so "Glen Coco" finds "GlenCoCo".

export interface CompanyOption { name: string; kind: "PortCo" | "Partner" }

export const companyKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** True when every character of `q` appears in `s` in order ("tetr8" → "tetrate"). */
const subsequence = (q: string, s: string) => { let i = 0; for (const c of s) if (c === q[i]) i++; return i === q.length; };

/**
 * Options matching the typed text, best first: exact, starts with, contains, then
 * (3+ characters) letters in order. An empty query returns every option.
 */
export function rankCompanies(query: string, options: CompanyOption[]): CompanyOption[] {
  const q = companyKey(query);
  if (!q) return options;
  const score = (o: CompanyOption) => {
    const k = companyKey(o.name);
    if (k === q) return 0;
    if (k.startsWith(q)) return 1;
    if (k.includes(q)) return 2;
    if (q.length >= 3 && subsequence(q, k)) return 3;
    return -1;
  };
  return options.map((o) => [o, score(o)] as const).filter(([, s]) => s >= 0)
    .sort((a, b) => a[1] - b[1] || a[0].name.localeCompare(b[0].name)).map(([o]) => o);
}

/** The listed company a typed name refers to exactly (ignoring spaces/case), if any. */
export function exactCompany(query: string, options: CompanyOption[]): CompanyOption | undefined {
  const q = companyKey(query);
  return q ? options.find((o) => companyKey(o.name) === q) : undefined;
}

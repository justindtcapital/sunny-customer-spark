// Pure parsing for "Paste contacts" / "Paste targets": turns loose pasted text or
// spreadsheet rows into reviewable contacts. Header rows map columns by name, and
// separate First/Last name columns are detected so a surname never lands in Company.

export interface PastedContact {
  name: string;
  email: string;
  linkedinUrl: string;
  company: string;
  title: string;
}

export interface PasteParseResult {
  rows: PastedContact[];
  headerSkipped: number;
  unparseable: number;
  /** True when columns 1 & 2 look like separate first/last names (no header row). */
  firstLastDetected: boolean;
  /** True when a header row told us which column is which. */
  headerMapped: boolean;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/[^\s,|\t]+/i;
export const TITLE_RE =
  /\b(ceo|cto|ciso|cfo|coo|cmo|cio|cso|cdo|vp|svp|evp|avp|director|manager|head|chief|officer|president|founder|co-?founder|partner|engineer|lead|principal|analyst|consultant|architect|owner|associate|specialist|advisor|executive)\b/i;
const ORG_RE =
  /\b(inc|corp|corporation|llc|ltd|limited|plc|group|bank|capital|partners|holdings|technologies|technology|tech|labs|systems|solutions|software|ventures|university|college|services|financial|insurance|health|pharma|ai|co)\b|\.(com|ai|io|ca|net|org)\b|&/i;

const HEADER_FIELDS: Record<string, keyof PastedContact | "firstName" | "lastName" | "ignore"> = {
  name: "name", "full name": "name", "contact name": "name",
  "first name": "firstName", firstname: "firstName", first: "firstName", "given name": "firstName",
  "last name": "lastName", lastname: "lastName", last: "lastName", surname: "lastName", "family name": "lastName",
  email: "email", "email address": "email", "work email": "email", "e-mail": "email",
  company: "company", "company name": "company", organization: "company", organisation: "company", employer: "company", account: "company",
  title: "title", "job title": "title", role: "title", position: "title",
  linkedin: "linkedinUrl", "linkedin url": "linkedinUrl", "linkedin profile": "linkedinUrl", "profile url": "linkedinUrl",
  phone: "ignore", "phone number": "ignore", mobile: "ignore", location: "ignore", city: "ignore",
  sector: "ignore", industry: "ignore", prime: "ignore", country: "ignore", state: "ignore",
};

const cells = (line: string) => line.split(/\t|,|;/).map((t) => t.trim());
const isWord = (s: string) => /^[\p{L}][\p{L}'’.-]*$/u.test(s);

export function isHeaderLine(line: string): boolean {
  if (EMAIL_RE.test(line) || LINKEDIN_RE.test(line)) return false;
  const tokens = cells(line).map((t) => t.toLowerCase()).filter(Boolean);
  if (tokens.length === 0) return false;
  const known = tokens.filter((t) => t in HEADER_FIELDS).length;
  return known >= Math.max(1, Math.ceil(tokens.length / 2));
}

function normalizeLinkedin(url: string): string {
  const u = (url || "").trim();
  if (!u) return "";
  return (/^https?:\/\//i.test(u) ? u : `https://${u}`).replace(/\/+$/, "");
}

/** A row whose first two cells are both single words and the second isn't a title/company. */
function looksFirstLast(tokens: string[]): boolean {
  const [a, b] = tokens;
  return !!a && !!b && isWord(a) && isWord(b) && !TITLE_RE.test(b) && !ORG_RE.test(b);
}

function stripIds(raw: string) {
  const email = raw.match(EMAIL_RE)?.[0] ?? "";
  const linkedinUrl = normalizeLinkedin(raw.match(LINKEDIN_RE)?.[0] ?? "");
  let rest = raw;
  if (email) rest = rest.replace(email, "");
  rest = rest.replace(LINKEDIN_RE, "").replace(/[<>|]/g, " ");
  return { email, linkedinUrl, tokens: rest.split(/\t|,|;/).map((t) => t.trim()).filter(Boolean) };
}

function parseLoose(raw: string, firstLast: boolean): PastedContact | null {
  const { email, linkedinUrl, tokens } = stripIds(raw);
  let name = tokens[0] || "";
  let rest = tokens.slice(1);
  if (firstLast && looksFirstLast(tokens)) {
    name = `${tokens[0]} ${tokens[1]}`;
    rest = tokens.slice(2);
  }
  let title = "";
  let company = "";
  for (const tok of rest) {
    if (!title && TITLE_RE.test(tok)) title = tok;
    else if (!company) company = tok;
  }
  if (!name && !email && !linkedinUrl) return null;
  return { name, email, linkedinUrl, company, title };
}

function parseWithHeader(raw: string, map: (string | undefined)[]): PastedContact | null {
  const row = raw.split(/\t|,|;/).map((t) => t.trim());
  const get = (f: string) => row[map.indexOf(f)] ?? "";
  const ids = stripIds(raw);
  const name = get("name") || [get("firstName"), get("lastName")].filter(Boolean).join(" ");
  const email = (get("email").match(EMAIL_RE)?.[0] ?? "") || ids.email;
  const linkedinUrl = normalizeLinkedin(get("linkedinUrl")) || ids.linkedinUrl;
  if (!name && !email && !linkedinUrl) return null;
  return { name, email, linkedinUrl, company: get("company"), title: get("title") };
}

/**
 * Parse pasted text. `combineFirstLast` overrides auto-detection of separate
 * first/last name columns (undefined = auto).
 */
export function parsePastedContacts(text: string, combineFirstLast?: boolean): PasteParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let headerSkipped = 0;
  let headerMap: (string | undefined)[] | null = null;
  const data: string[] = [];
  for (const line of lines) {
    if (isHeaderLine(line)) {
      headerSkipped++;
      if (!headerMap) headerMap = cells(line).map((t) => HEADER_FIELDS[t.toLowerCase()]);
      continue;
    }
    data.push(line);
  }
  const usableHeader = !!headerMap && headerMap.some((f) => f === "name" || f === "firstName");
  // Auto-detect: most rows start with two single words that aren't a title or company.
  const sample = data.map((l) => stripIds(l).tokens).filter((t) => t.length >= 2);
  const detected = !usableHeader && sample.length > 0 && sample.filter(looksFirstLast).length / sample.length >= 0.6;
  const firstLast = combineFirstLast ?? detected;

  const rows: PastedContact[] = [];
  let unparseable = 0;
  for (const line of data) {
    const p = usableHeader ? parseWithHeader(line, headerMap!) : parseLoose(line, firstLast);
    if (p) rows.push(p);
    else unparseable++;
  }
  return { rows, headerSkipped, unparseable, firstLastDetected: detected, headerMapped: usableHeader };
}

// ── Single-name checks (shared by paste and CSV review) ─────────────────────

export const isSingleName = (name: string) => {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length === 1;
};

/**
 * A one-word name whose Company is a single surname-like word that also
 * appears in the person's email or LinkedIn handle (e.g. "Anu" / "Oladele"
 * with linkedin.com/in/anu-oladele) — a sign last names were saved as companies.
 */
export function companyLooksLikeSurname(r: { name: string; company?: string; email?: string; linkedin?: string; linkedinUrl?: string }): boolean {
  const company = (r.company || "").trim();
  if (!isSingleName(r.name) || !company || !isWord(company) || ORG_RE.test(company) || TITLE_RE.test(company)) return false;
  const key = company.toLowerCase().replace(/[^a-z]/g, "");
  if (key.length < 2) return false;
  const handle = `${(r.email || "").split("@")[0]} ${(r.linkedin || r.linkedinUrl || "").split("/in/")[1] || ""}`.toLowerCase().replace(/[^a-z ]/g, "");
  return handle.includes(key);
}

export interface SingleNameReport {
  /** Row indexes whose name is only one word. */
  singles: number[];
  /** Subset of singles whose Company looks like their last name. */
  surnameInCompany: number[];
}

export function singleNameReport(rows: { name: string; company?: string; email?: string; linkedin?: string; linkedinUrl?: string }[]): SingleNameReport {
  const singles: number[] = [];
  const surnameInCompany: number[] = [];
  rows.forEach((r, i) => {
    if (!isSingleName(r.name)) return;
    singles.push(i);
    if (companyLooksLikeSurname(r)) surnameInCompany.push(i);
  });
  return { singles, surnameInCompany };
}

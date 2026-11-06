// Pure pre-flight checks for contact imports: classify each file row before any
// write so people can fix or skip problems on screen, not mid-save.
export type PreflightStatus = "ready" | "existing" | "attention" | "skipped";
export interface PreflightFix { name?: string; email?: string; phone?: string; skip?: boolean }
export interface PreflightItem<T> { index: number; row: T; status: PreflightStatus; reason: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const firstEmail = (cell: string) => (cell.split(/[;,]/)[0] || "").trim();

/** Keeps a leading + and digits/spacing; never converts to a number. */
export function normalizePhone(raw: string): string {
  const t = (raw || "").trim().replace(/^'+/, "");
  if (!t) return "";
  const plus = t.startsWith("+");
  const body = t.replace(/[^\d()\-.\s x]/gi, "").replace(/\s+/g, " ").trim();
  return (plus ? "+" : "") + body.replace(/^\+/, "");
}

export function emailProblem(email: string): string {
  const e = firstEmail(email);
  if (!e) return "Missing email";
  if (!e.includes("@")) return "Email has no @";
  if (!EMAIL_RE.test(e)) return "Email is missing a domain ending (e.g. .com)";
  return "";
}

export function classifyImportRows<T extends { name: string; email: string; phone: string; linkedin?: string; company?: string }>(
  rows: T[], existingEmails: Iterable<string>, fixes: Record<number, PreflightFix> = {},
  opts: { emailOptional?: boolean } = {},
): PreflightItem<T>[] {
  const existing = new Set([...existingEmails].map(e => e.trim().toLowerCase()).filter(Boolean));
  const seen = new Set<string>();
  return rows.map((original, index) => {
    const fix = fixes[index] || {};
    const row = { ...original, ...(fix.name !== undefined ? { name: fix.name.trim() } : {}), ...(fix.email !== undefined ? { email: fix.email.trim().toLowerCase() } : {}), ...(fix.phone !== undefined ? { phone: fix.phone } : {}) } as T;
    row.phone = normalizePhone(row.phone);
    if (fix.skip) return { index, row, status: "skipped", reason: "Skipped by you" };
    if (!row.name.trim()) return { index, row, status: "attention", reason: "Missing name" };
    // Name + company (or LinkedIn) is enough without an email — enrichment can fill gaps.
    // A typed-but-broken email is still flagged.
    const noEmailOk = !row.email.trim() && (!!row.linkedin?.trim() || !!row.company?.trim());
    const problem = noEmailOk ? "" : emailProblem(row.email);
    if (problem) return { index, row, status: "attention", reason: !row.email.trim() ? "Needs an email, LinkedIn URL or company" : problem };
    if (noEmailOk) return { index, row, status: "ready", reason: "" };
    const key = firstEmail(row.email).toLowerCase();
    if (seen.has(key)) return { index, row, status: "skipped", reason: "Same email appears earlier in this file" };
    seen.add(key);
    if (existing.has(key)) return { index, row, status: "existing", reason: "Already in your contacts — won't be duplicated" };
    return { index, row, status: "ready", reason: "" };
  });
}

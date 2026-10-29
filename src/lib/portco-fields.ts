// Pure PortCo field helpers: LinkedIn company-page validation and name sorting.

/** True for an empty value or a linkedin.com company/school/showcase page link. */
export function isLinkedInCompanyUrl(input: string | undefined | null): boolean {
  const raw = (input || "").trim();
  if (!raw) return true;
  if (/\s/.test(raw)) return false;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    const host = u.hostname.toLowerCase();
    if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return false;
    return /^\/(company|school|showcase)\/[^/]+/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** A–Z by company name, ignoring case and surrounding whitespace; stable tie-break. */
export function compareCompanyNames(a: { name?: string; id?: string }, b: { name?: string; id?: string }): number {
  const an = (a.name || "").trim();
  const bn = (b.name || "").trim();
  const primary = an.localeCompare(bn, undefined, { sensitivity: "base", numeric: true });
  if (primary !== 0) return primary;
  const exact = an.localeCompare(bn);
  if (exact !== 0) return exact;
  return (a.id || "").localeCompare(b.id || "");
}

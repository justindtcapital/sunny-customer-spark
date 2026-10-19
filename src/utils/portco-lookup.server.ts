// Add-company research: look a company up from its website and/or LinkedIn
// company URL (Apollo organization enrich + public page text), draft a summary
// with the AI gateway, and list senior Apollo people as suggested Key People.
// Nothing here writes data — the dialog shows every field for manual edit first.
import { searchPeople, type ApolloPersonResult } from "./apollo.server";

const APOLLO_API_URL = "https://api.apollo.io/api/v1";

export interface CompanyLookupResult {
  name: string;
  website: string;
  linkedinUrl: string;
  focusArea: string;
  location: string;
  description: string;
  logoUrl: string;
  sources: string[];
  warnings: string[];
}

export function domainFromWebsite(input: string): string {
  const raw = (input || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function linkedinCompanySlug(url: string): string {
  const m = (url || "").match(/linkedin\.com\/(?:company|school|showcase)\/([^/?#\s]+)/i);
  return m ? decodeURIComponent(m[1]) : "";
}

async function apolloPost(path: string, body: Record<string, unknown>, query?: Record<string, string>) {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY is not configured");
  const url = new URL(`${APOLLO_API_URL}${path}`);
  if (query) url.search = new URLSearchParams(query).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Apollo ${path} [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Record<string, unknown>;
}

type Org = Record<string, unknown>;

async function apolloOrgByDomain(domain: string): Promise<Org | null> {
  const data = await apolloPost("/organizations/bulk_enrich", { domains: [domain] });
  const orgs = (data.organizations as Org[] | undefined) || [];
  return orgs.find(Boolean) || null;
}

async function apolloOrgByName(name: string, slug: string): Promise<Org | null> {
  const data = await apolloPost("/mixed_companies/search", {}, {
    q_organization_name: name,
    per_page: "5",
    page: "1",
  });
  const orgs = ((data.organizations as Org[]) || []).concat((data.accounts as Org[]) || []);
  if (!orgs.length) return null;
  if (slug) {
    const hit = orgs.find((o) => linkedinCompanySlug(String(o.linkedin_url || "")).toLowerCase() === slug.toLowerCase());
    if (hit) return hit;
  }
  return orgs[0];
}

function stripHtml(html: string): string {
  const meta = [
    ...html.matchAll(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["']/gi),
  ].map((m) => m[1]);
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "";
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [title, ...meta, body].join("\n").slice(0, 6000);
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VenturePulse/1.0)", Accept: "text/html" },
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) return "";
    return stripHtml(await res.text());
  } catch {
    return "";
  }
}

async function aiSummary(name: string, context: string): Promise<{ summary: string; focusArea: string }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key || !context.trim()) return { summary: "", focusArea: "" };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            'You write concise venture-portfolio company profiles. Reply with JSON only: {"summary": "2-3 factual sentences on what the company does, for whom, and how", "focusArea": "short sector label like AI / Data or Cybersecurity"}. Use only the provided source text; no hype.',
        },
        { role: "user", content: `Company: ${name}\n\nSources:\n${context.slice(0, 9000)}` },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    console.error("[portco-lookup] AI summary failed", res.status, (await res.text()).slice(0, 200));
    return { summary: "", focusArea: "" };
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content || "";
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim()) as { summary?: string; focusArea?: string };
    return { summary: (parsed.summary || "").trim(), focusArea: (parsed.focusArea || "").trim() };
  } catch {
    return { summary: raw.trim(), focusArea: "" };
  }
}

export async function lookupCompany(input: {
  name?: string;
  website?: string;
  linkedinUrl?: string;
}): Promise<CompanyLookupResult> {
  const warnings: string[] = [];
  const sources: string[] = [];
  let domain = domainFromWebsite(input.website || "");
  const slug = linkedinCompanySlug(input.linkedinUrl || "");
  const guessName = (input.name || "").trim() || slug.replace(/[-_]+/g, " ");

  let org: Org | null = null;
  try {
    if (domain) org = await apolloOrgByDomain(domain);
    if (!org && guessName) org = await apolloOrgByName(guessName, slug);
    if (org) sources.push("Apollo");
  } catch (e) {
    warnings.push(e instanceof Error ? e.message : "Apollo lookup failed");
  }

  const orgStr = (k: string) => (org && org[k] != null ? String(org[k]) : "");
  if (!domain) domain = domainFromWebsite(orgStr("website_url") || orgStr("primary_domain"));
  const website = domain ? (input.website?.trim() || orgStr("website_url") || `https://${domain}`) : (input.website || "").trim();
  const linkedinUrl = (input.linkedinUrl || "").trim() || orgStr("linkedin_url");
  const name = (input.name || "").trim() || orgStr("name") || guessName;
  const location = [orgStr("city"), orgStr("state"), orgStr("country") === "United States" ? "" : orgStr("country")]
    .filter(Boolean)
    .join(", ");

  const context: string[] = [];
  const apolloDesc = orgStr("short_description") || orgStr("seo_description");
  if (apolloDesc) context.push(`Apollo profile: ${apolloDesc}`);
  if (orgStr("industry")) context.push(`Industry: ${orgStr("industry")}`);
  const kw = org?.keywords;
  if (Array.isArray(kw) && kw.length) context.push(`Keywords: ${kw.slice(0, 15).join(", ")}`);
  if (website) {
    const t = await fetchPageText(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    if (t) { context.push(`Website text: ${t}`); sources.push("Website"); }
  }
  if (linkedinUrl) {
    const t = await fetchPageText(linkedinUrl);
    // LinkedIn usually gates pages; keep only if it returned real content.
    if (t && !/sign in|join linkedin/i.test(t.slice(0, 300))) { context.push(`LinkedIn page: ${t}`); sources.push("LinkedIn"); }
  }

  const ai = await aiSummary(name, context.join("\n\n"));
  if (ai.summary) sources.push("AI summary");
  else if (!context.length) warnings.push("No public description found — write the summary manually.");

  return {
    name,
    website,
    linkedinUrl,
    focusArea: ai.focusArea || orgStr("industry"),
    location,
    description: ai.summary || apolloDesc,
    logoUrl: orgStr("logo_url"),
    sources,
    warnings,
  };
}

export async function suggestKeyPeople(input: { website?: string; name?: string }): Promise<{
  people: ApolloPersonResult[];
  error?: string;
}> {
  const domain = domainFromWebsite(input.website || "");
  if (!domain && !input.name) return { people: [], error: "Add a website to search Apollo for key people." };
  const res = await searchPeople({
    organizationDomains: domain ? [domain] : undefined,
    keywords: domain ? undefined : input.name,
    seniorities: ["owner", "founder", "c_suite", "partner", "vp", "head"],
    perPage: 25,
  });
  return { people: res.people, error: res.error };
}

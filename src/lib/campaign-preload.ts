// People picked on the Network page, carried into a brand-new campaign (pure + browser-storage helpers).
import type { CandidatePerson } from "./campaigns";

export interface PreloadSource {
  name: string;
  email?: string;
  title?: string;
  company?: string;
  linkedinUrl?: string;
  location?: string;
  address?: string;
  sector?: string;
  urid?: string;
  prospect?: boolean;
}

/** A Network/Prospecting person as a campaign candidate; existing records are never edited. */
export function toCampaignCandidate(c: PreloadSource): CandidatePerson {
  return {
    name: c.name,
    email: (c.email || "").split(/[,;]/)[0].trim(),
    title: c.title || "",
    company: c.company || "",
    linkedin: c.linkedinUrl || "",
    location: c.location || c.address || "",
    sector: c.sector || "",
    origin: c.prospect ? "prospect" : "network",
    urid: c.urid,
  };
}

const KEY = "vp:campaign-preload";

export function savePreload(people: CandidatePerson[]) {
  sessionStorage.setItem(KEY, JSON.stringify({ people, at: Date.now() }));
}

export function readPreload(): CandidatePerson[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as { people?: CandidatePerson[] };
    return Array.isArray(v.people) ? v.people.filter((p) => p && typeof p.name === "string") : [];
  } catch {
    return [];
  }
}

export function clearPreload() {
  sessionStorage.removeItem(KEY);
}

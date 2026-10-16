// Partners are a separate entity from PortCos. Contacts are tagged to a partner
// by matching their company name — they are never moved out of Network/Prospecting.

export const PARTNER_CATEGORIES = ["Dell", "Resellers & Integrators", "Tech Partners", "Vendors"] as const;
export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number];

export interface Partner {
  name: string;
  category: PartnerCategory;
  website: string;
  notes: string;
  /** Extra company spellings that identify this partner (comma-separated in the sheet). */
  aliases: string[];
  /** One-paragraph description, generated once from the website. */
  summary?: string;
  location?: string;
}

/** Favicon/logo URL for a partner website (Google's favicon service). */
export function partnerLogoUrl(website: string): string {
  const host = (website || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return host ? `https://www.google.com/s2/favicons?domain=${host}&sz=128` : "";
}

export const SEED_PARTNERS: Array<Pick<Partner, "name" | "category" | "website"> & { aliases?: string[] }> = [
  { name: "Dell", category: "Dell", website: "https://www.dell.com", aliases: ["Dell Technologies", "Dell Inc"] },
  { name: "Trace3", category: "Resellers & Integrators", website: "https://www.trace3.com" },
  { name: "Redesign Group", category: "Resellers & Integrators", website: "https://www.redesign-group.com" },
  { name: "Arctiq", category: "Resellers & Integrators", website: "https://arctiq.com" },
  { name: "Crush Security", category: "Resellers & Integrators", website: "https://www.crushsecurity.com" },
  { name: "WWT", category: "Resellers & Integrators", website: "https://www.wwt.com", aliases: ["World Wide Technology"] },
  { name: "NVIDIA", category: "Tech Partners", website: "https://www.nvidia.com" },
  { name: "Intel", category: "Tech Partners", website: "https://www.intel.com", aliases: ["Intel Corporation"] },
  { name: "AWS", category: "Tech Partners", website: "https://aws.amazon.com", aliases: ["Amazon Web Services"] },
  { name: "Vation", category: "Vendors", website: "https://www.vationventures.com", aliases: ["Vation Ventures"] },
  { name: "GetProven", category: "Vendors", website: "https://www.getproven.com" },
  { name: "GBI Impact", category: "Vendors", website: "https://www.gbiimpact.com" },
];

export function normalizeCategory(v: string): PartnerCategory {
  const k = (v || "").trim().toLowerCase();
  return PARTNER_CATEGORIES.find((c) => c.toLowerCase() === k)
    || (k.includes("resell") || k.includes("integrat") ? "Resellers & Integrators"
      : k.includes("tech") ? "Tech Partners" : k.includes("dell") ? "Dell" : "Vendors");
}

const SUFFIX = /\b(inc|llc|ltd|corp|corporation|co|company|group|technologies|technology|plc|gmbh)\b/g;
function norm(s: string): string {
  return ` ${(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}
function core(s: string): string {
  return norm(s).replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
}

/** The partner a company name belongs to, or null. Whole-word, case-insensitive. */
export function matchPartner(company: string, partners: Partner[]): Partner | null {
  const c = core(company);
  if (!c) return null;
  const padded = ` ${c} `;
  for (const p of partners) {
    for (const n of [p.name, ...p.aliases]) {
      const k = core(n);
      if (!k) continue;
      if (c === k) return p;
      // "Dell Technologies Federal" → Dell; short names need an exact word hit at the start.
      if (k.length >= 3 && padded.startsWith(` ${k} `)) return p;
    }
  }
  return null;
}

/** Partner names mentioned as whole words in a block of text (for review suggestions). */
export function detectPartners(text: string, partners: Partner[]): string[] {
  const t = norm(text);
  return partners
    .filter((p) => [p.name, ...p.aliases].some((n) => { const k = norm(n).trim(); return k.length >= 3 && t.includes(` ${k} `); }))
    .map((p) => p.name);
}

// One people list: Prospecting is a Relationship Status on the Contacts tab,
// not a separate tab. These pure helpers present prospect rows in the legacy
// Targets column shape so prospect readers/writers keep working, and map
// writes back onto the single Contacts row (same URID, never copied).

export const PROSPECT_STATUS = "Prospecting";
export const NETWORK_TIERS = ["council", "hot", "warm", "cold"] as const;

const norm = (s: string) => (s || "").trim().toLowerCase();

/** Legacy Targets header (lowercase) → Contacts header that stores it. */
export const TARGET_TO_CONTACT: Record<string, string> = {
  urid: "URID",
  "first name": "First Name",
  "last name": "Last Name",
  company: "Company",
  role: "Role",
  linkedin: "LinkedIn",
  email: "Email",
  phone: "Phone Number",
  location: "Location",
  sector: "Sector",
  stage: "Prospecting Stage",
  source: "Source",
  "research purpose": "Research Purpose",
  "date added": "Date Added",
  "last contacted": "Last Contacted",
  "reason surfaced": "Reason Surfaced",
  campaign: "Campaign",
  event: "Event",
  "portco tags": "PortCo Tags",
  "follow up flag": "Follow Up Flag",
  "follow up due": "Follow Up Due",
  "network profile": "Network Profile",
  prime: "Relationship Prime",
};

/** Contacts columns the unified list needs beyond the original Network ones. */
export const UNIFIED_CONTACT_COLUMNS = ["First Name", "Last Name", "Prospecting Stage", "Research Purpose", "Reason Surfaced", "Last Contacted", "Follow Up Due", "Network Profile", "Origin"];

export const contactHeaderFor = (targetHeader: string) => TARGET_TO_CONTACT[norm(targetHeader)] || targetHeader.trim();

export const isProspectStatus = (status: string) => norm(status) === "prospecting";
export const isNetworkStatus = (status: string) => !isProspectStatus(status);

/** Legacy Targets view header order: the canonical order first, then any extra mapped fields. */
export function viewHeaders(targetHeaders: string[]): string[] {
  const out: string[] = [];
  for (const h of [...targetHeaders, "Follow Up Flag", "Follow Up Due", "Network Profile", "Prime"]) if (!out.some((o) => norm(o) === norm(h))) out.push(h);
  return out;
}

const splitName = (name: string) => { const parts = (name || "").trim().split(/\s+/).filter(Boolean); return { first: parts[0] || "", last: parts.slice(1).join(" ") }; };

export interface ProspectView { rows: string[][]; contactRowByViewRow: number[]; uridByViewRow: string[] }

/** Build the legacy Targets-shaped view (header + prospect rows) from raw Contacts rows. Row numbers are 1-based sheet rows. */
export function buildProspectView(contacts: string[][], headers: string[]): ProspectView {
  const ch = (contacts[0] || []).map(norm);
  const col = (h: string) => ch.indexOf(norm(h));
  const status = col("Relationship Status"), name = col("Name"), urid = col("URID");
  const rows: string[][] = [headers];
  const contactRowByViewRow: number[] = [1], uridByViewRow: string[] = [""];
  contacts.forEach((r, i) => {
    if (i === 0 || status < 0 || !isProspectStatus(r[status] || "")) return;
    const split = splitName(name >= 0 ? r[name] || "" : "");
    rows.push(headers.map((h) => {
      const key = norm(h), c = col(contactHeaderFor(h));
      const v = c >= 0 ? r[c] || "" : "";
      if (key === "first name") return v || split.first;
      if (key === "last name") return v || (col("First Name") >= 0 && r[col("First Name")] ? "" : split.last);
      return v;
    }));
    contactRowByViewRow.push(i + 1);
    uridByViewRow.push(urid >= 0 ? r[urid] || "" : "");
  });
  return { rows, contactRowByViewRow, uridByViewRow };
}

/** Map one Targets-shaped row (by its header) into a full Contacts row flagged Prospecting. */
export function contactRowFromTarget(targetHeaders: string[], values: string[], contactHeaders: string[], origin = PROSPECT_STATUS): string[] {
  const fields: Record<string, string> = {};
  targetHeaders.forEach((h, i) => { fields[norm(contactHeaderFor(h))] = values[i] || ""; });
  const first = fields["first name"] || "", last = fields["last name"] || "";
  fields["name"] = fields["name"] || [first, last].filter(Boolean).join(" ");
  fields["relationship status"] = PROSPECT_STATUS;
  fields["prospecting stage"] = fields["prospecting stage"] || PROSPECT_STATUS;
  fields["origin"] = fields["origin"] || origin;
  return contactHeaders.map((h) => fields[norm(h)] || "");
}

/** Plan in-place status changes; rows whose saved status no longer matches the expected one are skipped (reported). */
export function planStatusFlags(contacts: string[][], wanted: { urid: string; expected: string; to: string }[]) {
  const ch = (contacts[0] || []).map(norm);
  const u = ch.indexOf("urid"), s = ch.indexOf("relationship status");
  const results: { urid: string; row?: number; status: "change" | "already" | "missing" | "duplicate" | "changed-elsewhere"; current?: string }[] = [];
  for (const w of wanted) {
    const hits = contacts.flatMap((r, i) => (i > 0 && u >= 0 && (r[u] || "") === w.urid ? [i + 1] : []));
    if (!hits.length) { results.push({ urid: w.urid, status: "missing" }); continue; }
    if (hits.length > 1) { results.push({ urid: w.urid, status: "duplicate" }); continue; }
    const current = (contacts[hits[0] - 1][s] || "").trim();
    if (norm(current) === norm(w.to)) results.push({ urid: w.urid, row: hits[0], status: "already", current });
    else if (norm(current) !== norm(w.expected)) results.push({ urid: w.urid, row: hits[0], status: "changed-elsewhere", current });
    else results.push({ urid: w.urid, row: hits[0], status: "change", current });
  }
  return results;
}

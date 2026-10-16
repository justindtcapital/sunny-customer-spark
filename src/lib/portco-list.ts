// PortCo List: approved name / website / one-liner per portfolio company, read
// verbatim from the "PortCo List" sheet in Drive. Never AI-generated.

export interface PortcoListEntry {
  name: string;
  website: string;
  summary: string;
}

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, embedded newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** First sentence of the approved summary (no rewriting). */
export function firstSentence(text: string): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  const m = t.match(/^.*?[.!?](?=\s+[A-Z(]|$)/);
  return (m ? m[0] : t).trim();
}

/** Only name, website and summary columns are read; other columns are ignored. */
export function parsePortcoList(csv: string): PortcoListEntry[] {
  const [header = [], ...rows] = parseCsv(csv);
  const col = (re: RegExp) => header.findIndex((h) => re.test(h.trim()));
  const n = col(/^(company\s*name|name|company)$/i);
  const w = col(/^(website|url|site)$/i);
  const s = col(/^(summary|description|one[-\s]?liner)$/i);
  if (n < 0) return [];
  return rows
    .map((r) => ({ name: (r[n] || "").trim(), website: (r[w] || "").trim(), summary: firstSentence(r[s] || "") }))
    .filter((e) => e.name);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function findPortco(list: PortcoListEntry[], name: string): PortcoListEntry | undefined {
  const k = norm(name);
  if (!k) return undefined;
  return list.find((e) => norm(e.name) === k) || list.find((e) => k.length >= 4 && (norm(e.name).startsWith(k) || k.startsWith(norm(e.name))));
}

/** Plain-text bullets that Outlook auto-links: "• Name (https://…) – one sentence." */
export function formatPortcoList(list: PortcoListEntry[], names: string[]): { text: string; missing: string[] } {
  const lines: string[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const e = findPortco(list, name);
    if (!e) { missing.push(name); continue; }
    lines.push(`• ${e.name}${e.website ? ` (${e.website})` : ""}${e.summary ? ` – ${e.summary}` : ""}`);
  }
  return { text: lines.join("\n"), missing };
}

export function appendPortcoList(body: string, listText: string): string {
  if (!listText) return body;
  return `${body.replace(/\s+$/, "")}\n\n${listText}\n`;
}

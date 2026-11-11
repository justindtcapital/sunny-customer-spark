// Pure helpers for V.I.C.'s read-only Asana access. Browser-safe.

const MAX_PATH = 500;

/**
 * Normalize a path V.I.C. asks to read from the Asana API, or return null when it
 * isn't a plain relative API path (absolute URLs, traversal, whitespace). Only GET
 * requests are ever made with it, so V.I.C. can read but never change Asana.
 */
export function asanaReadPath(raw: string): string | null {
  let p = (raw || "").trim();
  if (!p || p.length > MAX_PATH) return null;
  if (/[\s\\]/.test(p) || /:\/\//.test(p) || p.includes("..") || p.startsWith("//")) return null;
  p = p.replace(/^\/?api\/1\.0(?=\/)/, "");
  if (!p.startsWith("/")) p = `/${p}`;
  if (!/^\/[A-Za-z0-9_\-./]*(\?[A-Za-z0-9_\-.,=&%:@+*]*)?$/.test(p)) return null;
  return p;
}

/** Cut a JSON payload to a size the model can read, saying when it was shortened. */
export function clipJson(value: unknown, max = 12000): { json: string; truncated: boolean } {
  const s = JSON.stringify(value);
  return s.length > max ? { json: s.slice(0, max), truncated: true } : { json: s, truncated: false };
}

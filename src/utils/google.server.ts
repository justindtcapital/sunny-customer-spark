// Central, backend-only accessor for every Google Cloud secret. Keeping all
// process.env.GOOGLE_* reads in one module gives one place to validate, one
// place to log safely (presence + length only — NEVER the value), and no
// scattered fallback drift between callers. Import ONLY from server modules.
//
// Do NOT statically import node:* builtins here. This file is pulled into the
// Vite client graph via createServerFn modules (sheets/gemini), and a top-level
// `node:fs` import crashes the browser with "externalized for browser compatibility".

function present(v: string | undefined): boolean {
  return Boolean(v && v.trim());
}

function cleanSecret(value: string | undefined, names: string[]): string | undefined {
  if (!value) return undefined;
  let cleaned = value.trim().replace(/^\uFEFF/, "");

  // Secret forms expect the raw value, but pasted .env lines like
  // GOOGLE_REFRESH_TOKEN=1//... are easy to submit by mistake. Normalize those
  // here so every Google consumer (Sheets, Drive, Gmail) keeps working.
  for (const name of names) {
    const prefix = `${name}=`;
    if (cleaned.startsWith(prefix)) {
      cleaned = cleaned.slice(prefix.length).trim();
      break;
    }
  }

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  return cleaned || undefined;
}

export interface GoogleOAuthCreds {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

// OAuth2 (installed-app) creds used to mint Sheets/Drive access tokens.
// Accepts either the GOOGLE_* or GOOGLE_OAUTH_* naming.
export function getGoogleOAuthCreds(): GoogleOAuthCreds {
  return {
    clientId: cleanSecret(process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID, [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_OAUTH_CLIENT_ID",
    ]),
    clientSecret: cleanSecret(process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET, [
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_OAUTH_CLIENT_SECRET",
    ]),
    refreshToken: cleanSecret(process.env.GOOGLE_REFRESH_TOKEN, ["GOOGLE_REFRESH_TOKEN"]),
  };
}

export function hasGoogleOAuth(): boolean {
  const c = getGoogleOAuthCreds();
  return present(c.clientId) && present(c.clientSecret) && present(c.refreshToken);
}

export function getSpreadsheetId(): string | undefined {
  return cleanSecret(process.env.GOOGLE_SPREADSHEET_ID, ["GOOGLE_SPREADSHEET_ID"]);
}

// Throwing accessor for the many Sheets calls that can't proceed without it.
export function requireSpreadsheetId(): string {
  const id = getSpreadsheetId();
  if (!present(id)) throw new Error("GOOGLE_SPREADSHEET_ID secret is not configured");
  return id as string;
}

// Vertex AI (Gemini) project + region.
export function getVertexProject(): string {
  return process.env.GOOGLE_CLOUD_PROJECT || "";
}

export function getVertexLocation(): string {
  return process.env.GEMINI_LOCATION || "us-central1";
}

// Service-account key for Vertex auth. Prefers the inline JSON env var
// (hosted / serverless), then the standard GOOGLE_APPLICATION_CREDENTIALS
// file path used for local ADC. File I/O is lazy + server-only so the client
// bundle can load this module without touching node:fs.
let cachedFileJson: string | undefined;
let fileJsonLoaded = false;

export async function getServiceAccountJson(): Promise<string | undefined> {
  const inline = cleanSecret(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON, [
    "GOOGLE_APPLICATION_CREDENTIALS_JSON",
  ]);
  if (inline) return inline;

  if (typeof window !== "undefined") return undefined;
  if (fileJsonLoaded) return cachedFileJson;

  const credPath = cleanSecret(process.env.GOOGLE_APPLICATION_CREDENTIALS, [
    "GOOGLE_APPLICATION_CREDENTIALS",
  ]);
  fileJsonLoaded = true;
  if (!credPath) return undefined;

  try {
    // Build the specifier at runtime so Vite does not rewrite this into a
    // browser-externalized `node:fs` stub (that crash is what `/crm` just hit).
    const spec = ["node", "fs"].join(":");
    const { readFileSync } = (await import(/* @vite-ignore */ spec)) as typeof import("node:fs");
    cachedFileJson = readFileSync(credPath, "utf8").trim() || undefined;
  } catch (e) {
    console.error(
      `[google] Could not read GOOGLE_APPLICATION_CREDENTIALS at ${credPath}:`,
      e instanceof Error ? e.message : e,
    );
    cachedFileJson = undefined;
  }
  return cachedFileJson;
}

// One-line, value-free config summary for diagnosing the "could not refresh
// access token" class of issues. Logs whether each secret is present (and the
// refresh-token length), never the secret itself.
export function debugGoogleConfig(tag = "google"): void {
  const oauth = getGoogleOAuthCreds();
  const summary = {
    spreadsheetId: present(getSpreadsheetId()),
    clientId: present(oauth.clientId),
    clientSecret: present(oauth.clientSecret),
    refreshToken: present(oauth.refreshToken),
    refreshTokenLen: (oauth.refreshToken || "").length,
    vertexProject: present(getVertexProject()) ? getVertexProject() : false,
    serviceAccountJson: present(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON),
    serviceAccountFile: present(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  };
  console.log(`[${tag}] Google config:`, JSON.stringify(summary));
}

// Per-mailbox Google OAuth (Gmail read-only) — lets the shared tracking mailbox
// owner (e.g. shane@) authorize Venture Pulse directly, so the harvester can
// read that mailbox as `users/me` instead of delegated impersonation (which
// the Gmail API refuses for regular user OAuth).
//
// Security: the app sign-in is an email allowlist, so we do NOT trust it here.
// Google proves identity: a token is stored only if Google says the consenting
// account IS the configured GMAIL_KB_MAILBOX. State is HMAC-signed + expiring.
// Refresh tokens are AES-GCM encrypted (MAILBOX_TOKEN_SECRET) before they are
// written to the private "Mailbox Tokens" sheet tab.

import { getGoogleOAuthCreds } from "./google.server";
import { ensureTab, fetchSheetTab, appendSheetRow, writeSheetRow } from "./sheets.server";

const TAB = "Mailbox Tokens";
const HEADERS = ["Mailbox", "Encrypted Refresh Token", "Connected At", "Scopes"];
export const MAILBOX_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
];
export const CALLBACK_PATH = "/api/public/google-mailbox/callback";

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64u(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function secret(): string {
  const s = process.env.MAILBOX_TOKEN_SECRET;
  if (!s) throw new Error("MAILBOX_TOKEN_SECRET is not configured");
  return s;
}

async function hmacKey() {
  return crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}
async function aesKey() {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`aes:${secret()}`));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function kbMailbox(): string {
  return (process.env.GMAIL_KB_MAILBOX || "").trim().toLowerCase();
}

export function redirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}${CALLBACK_PATH}`;
}

async function signState(payload: object): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body)));
  return `${body}.${b64u(sig)}`;
}
async function verifyState(state: string): Promise<{ origin: string; exp: number } | null> {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(), fromB64u(sig), enc.encode(body));
  if (!ok) return null;
  const p = JSON.parse(dec.decode(fromB64u(body))) as { origin: string; exp: number };
  return p.exp > Date.now() ? p : null;
}

export async function buildAuthUrl(origin: string): Promise<string> {
  const { clientId } = getGoogleOAuthCreds();
  if (!clientId) throw new Error("Google client ID is not configured");
  const mailbox = kbMailbox();
  const state = await signState({ origin, exp: Date.now() + 15 * 60_000 });
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: MAILBOX_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (mailbox) p.set("login_hint", mailbox);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), enc.encode(plain)));
  return `${b64u(iv)}.${b64u(ct)}`;
}
async function decrypt(stored: string): Promise<string> {
  const [iv, ct] = stored.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64u(iv) }, await aesKey(), fromB64u(ct));
  return dec.decode(pt);
}

/** Exchange the code, verify the Google account, store the encrypted token. */
export async function completeAuth(code: string, state: string, requestOrigin: string): Promise<string> {
  const st = await verifyState(state);
  if (!st || st.origin !== requestOrigin) throw new Error("This sign-in link expired. Please try again.");
  const { clientId, clientSecret } = getGoogleOAuthCreds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId || "",
      client_secret: clientSecret || "",
      redirect_uri: redirectUri(requestOrigin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google rejected the sign-in (${res.status}).`);
  const tok = (await res.json()) as { access_token: string; refresh_token?: string; scope?: string };
  const who = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  const email = ((await who.json()) as { email?: string }).email?.toLowerCase() || "";
  const expected = kbMailbox();
  if (!expected || email !== expected) {
    throw new Error(`Please connect ${expected || "the tracking mailbox"} — you signed in as ${email || "an unknown account"}.`);
  }
  if (!tok.refresh_token) throw new Error("Google did not return a long-lived token. Please try again.");
  if (!(tok.scope || "").includes("gmail.readonly")) throw new Error("Gmail read access was not granted.");

  await ensureTab(TAB, HEADERS);
  const rows = await fetchSheetTab(TAB);
  const row = [email, await encrypt(tok.refresh_token), new Date().toISOString(), tok.scope || ""];
  const idx = rows.findIndex((r, i) => i > 0 && (r[0] || "").toLowerCase() === email);
  if (idx > 0) await writeSheetRow(TAB, idx + 1, row);
  else await appendSheetRow(TAB, row);
  tokenCache.delete(email);
  return email;
}

const tokenCache = new Map<string, { token: string; exp: number }>();

/** Access token for a connected mailbox, or null if it was never connected. */
export async function getMailboxAccessToken(mailbox: string): Promise<string | null> {
  const m = mailbox.trim().toLowerCase();
  if (!m) return null;
  const hit = tokenCache.get(m);
  if (hit && Date.now() < hit.exp - 30_000) return hit.token;
  let rows: string[][];
  try {
    rows = await fetchSheetTab(TAB);
  } catch {
    return null;
  }
  const row = rows.find((r, i) => i > 0 && (r[0] || "").toLowerCase() === m);
  if (!row?.[1]) return null;
  const { clientId, clientSecret } = getGoogleOAuthCreds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId || "",
      client_secret: clientSecret || "",
      refresh_token: await decrypt(row[1]),
    }),
  });
  if (!res.ok) {
    console.error(`[mailbox-oauth] refresh failed for ${m}: ${res.status}`);
    return null;
  }
  const j = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(m, { token: j.access_token, exp: Date.now() + j.expires_in * 1000 });
  return j.access_token;
}

export async function mailboxStatus(): Promise<{ mailbox: string; connected: boolean; connectedAt?: string }> {
  const mailbox = kbMailbox();
  try {
    const rows = await fetchSheetTab(TAB);
    const row = rows.find((r, i) => i > 0 && (r[0] || "").toLowerCase() === mailbox);
    return { mailbox, connected: Boolean(row?.[1]), connectedAt: row?.[2] };
  } catch {
    return { mailbox, connected: false };
  }
}

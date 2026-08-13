// Gmail integration — read the connected Google mailbox.
//
// Three consumers share this module:
//   1. Signals — network emails (gated by GMAIL_SIGNALS_ENABLED).
//   2. BD/GTM activity sync — messages to/from dedicated aliases
//      (GMAIL_BD_ALIAS / GMAIL_GTM_ALIAS), mirrored into the BD & GTM sheets
//      the same way Asana activities are.
//   3. CRM deepen — sent mail + calendar invites matched to contact emails
//      (GMAIL_CRM_SYNC_ENABLED), logged as Notes on Sync activity.
//
// Reuses the SAME Google OAuth refresh token as Sheets/Drive (getAccessToken).
// The token must be minted with gmail.readonly — re-run mint-google-token.mjs
// and paste the new GOOGLE_REFRESH_TOKEN. Enable the Gmail API in GCP too.

import { getAccessToken } from "./sheets.server";
import { isEmailChromeText, sanitizeEmailText } from "@/lib/email-body-clean";
import { emailBodyExcerpt } from "@/lib/email-excerpt";
import { extractArticleLinks } from "@/lib/link-digest";
import { parseAddressList, parseEmailAddress, type EmailAddress } from "@/lib/email-address";
import {
  activitySubjectQuery,
  isActivityTrackingMessage,
} from "@/lib/email-activity";
import {
  ACTIVITY_NOTES_BUDGET,
  enrichActivityFromThreadText,
  formatActivityNotes,
} from "@/lib/activity-thread-intel";
import {
  buildInternalConfig,
  isBulkOrAutomatedMail,
  isInternalEmail,
  isNoiseEmail,
  type Counterparty,
  type InternalConfig,
} from "@/lib/email-noise";
import { TEAM_MEMBER_EMAILS } from "@/lib/user-ownership";
import type { AsanaActivity } from "@/lib/types";
import { msToIsoDay } from "@/lib/sheet-date";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** A PDF attached to a message — metadata only; bytes come via
 *  downloadGmailAttachment on demand (attachments can be large). */
export interface GmailAttachment {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  attachmentId: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  /** To/Cc recipients WITH their display names (RFC 5322 parsed). */
  toPeople: EmailAddress[];
  ccPeople: EmailAddress[];
  /** Delivered-To header values (lowercased) — how alias-forwarded mail is
   *  recognized even when the alias never appears in From/To/Cc. */
  deliveredTo: string[];
  /** Received time, epoch ms. */
  date: number;
  dateLabel: string;
  snippet: string;
  body: string;
  /** Cleaned candidate article links from the FULL body (pre-truncation) —
   *  used to detect + explode link-digest emails into per-article signals. */
  links: string[];
  /** PDF attachments (metadata only). */
  attachments: GmailAttachment[];
  permalink: string;
  /** True when List-Unsubscribe / Precedence / Auto-Submitted look like bulk mail. */
  isBulk?: boolean;
}
export interface GmailResult {
  ok: boolean;
  messages: GmailMessage[];
  error?: string;
}

export function isGmailConfigured(): boolean {
  return process.env.GMAIL_SIGNALS_ENABLED === "true";
}

/** True when at least one BD/GTM activity alias is configured. */
export function isGmailActivityConfigured(): boolean {
  return (
    parseAliasList(process.env.GMAIL_BD_ALIAS).length > 0 ||
    parseAliasList(process.env.GMAIL_GTM_ALIAS).length > 0
  );
}

function parseAliasList(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[;,]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
}

/** Combined BD + GTM activity alias addresses (lowercased). These belong to the
 *  activity-sync pipeline (BD/GTM sheets) and must be kept OUT of the Signals feed. */
export function getActivityAliases(): string[] {
  return [
    ...parseAliasList(process.env.GMAIL_BD_ALIAS),
    ...parseAliasList(process.env.GMAIL_GTM_ALIAS),
  ];
}

/** NEWS@ ingestion alias addresses (lowercased) — the diagram's "forward it for
 *  processing" inbox. One alias is enough: the scan's own classification routes
 *  each item by type, so per-type aliases buy nothing. */
export function getNewsAliases(): string[] {
  return parseAliasList(process.env.GMAIL_NEWS_ALIAS);
}

function decodeB64(data?: string): string {
  if (!data) return "";
  try {
    return Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

// Recursively find the first part of a given MIME type and decode it.
function findPart(part: any, mime: string): string {
  if (!part) return "";
  if (part.mimeType === mime && part.body?.data) return decodeB64(part.body.data);
  for (const p of part.parts || []) {
    const r = findPart(p, mime);
    if (r) return r;
  }
  return "";
}

function stripHtml(html: string): string {
  // Drop mailto hrefs before stripping tags so we don't glue
  // "user@x.com" + "mailto:user@x.com" into one token.
  const withoutMailtoHref = html.replace(
    /<a\b[^>]*\bhref\s*=\s*["']?\s*mailto:[^"'>\s]+["']?[^>]*>/gi,
    "<a>",
  );
  return withoutMailtoHref
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/([\w.+-]+@[\w.-]+\.\w{2,})mailto:\1/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// Full body text + raw HTML part. Links must be extracted from these BEFORE
// the body is truncated for the feed — a digest email's later links would
// otherwise be silently lost to the length cap.
function extractParts(payload: any): { text: string; html: string } {
  const plain = findPart(payload, "text/plain");
  const html = findPart(payload, "text/html");
  const text = sanitizeEmailText(
    plain.trim() || (html ? stripHtml(html) : "") || decodeB64(payload?.body?.data).trim(),
  );
  return { text, html: html.slice(0, 300_000) };
}

function header(headers: any[], name: string): string {
  const h = (headers || []).find((x) => (x.name || "").toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

// Some headers repeat (Delivered-To appears once per delivery hop) — collect all.
function headerAll(headers: any[], name: string): string[] {
  return (headers || [])
    .filter((x) => (x.name || "").toLowerCase() === name.toLowerCase())
    .map((x) => String(x.value || "").trim().toLowerCase())
    .filter(Boolean);
}

// Recursively collect PDF attachment metadata. Attachment bytes are NOT
// fetched here — they're downloaded on demand (downloadGmailAttachment) only
// for messages the Signals pipeline actually wants documents from.
function collectPdfAttachments(part: any, out: GmailAttachment[]): void {
  if (!part) return;
  const filename = String(part.filename || "");
  const mime = String(part.mimeType || "");
  if (
    part.body?.attachmentId &&
    (mime === "application/pdf" || /\.pdf$/i.test(filename))
  ) {
    out.push({
      filename: filename || "attachment.pdf",
      mimeType: "application/pdf",
      sizeBytes: Number(part.body.size) || 0,
      attachmentId: String(part.body.attachmentId),
    });
  }
  for (const p of part.parts || []) collectPdfAttachments(p, out);
}

function parseAddr(v: string): { name: string; email: string } {
  const m = v.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  return { name: "", email: v.trim().toLowerCase() };
}

function toLabel(ms: number): string {
  const ny = msToIsoDay(ms);
  const utc = msToIsoDay(ms, "UTC");
  // #region agent log
  gmailDateDbg.calls++;
  if (ny && utc && ny !== utc) {
    gmailDateDbg.shifted++;
    if (gmailDateDbg.samples.length < 5) gmailDateDbg.samples.push({ ny, utc });
  }
  // #endregion
  return ny;
}

const gmailDateDbg = { calls: 0, shifted: 0, samples: [] as { ny: string; utc: string }[] };

async function getMessage(token: string, id: string): Promise<GmailMessage | null> {
  let res: Response;
  try {
    res = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const m = (await res.json()) as any;
  const headers = m.payload?.headers || [];
  // RFC 5322 parsing: quoted display names such as "Jain, Vrashank" <v.j@dell.com>
  // survive intact, and tokens without a plausible local@domain shape are dropped.
  const from = parseEmailAddress(header(headers, "From")) || { name: "", email: "" };
  const toPeople = parseAddressList(header(headers, "To"));
  const ccPeople = parseAddressList(header(headers, "Cc"));
  const to = toPeople.map((p) => p.email);
  const cc = ccPeople.map((p) => p.email);
  const deliveredTo = headerAll(headers, "Delivered-To")
    .map((v) => parseEmailAddress(v)?.email || "")
    .filter(Boolean);
  const date = Number(m.internalDate) || 0;
  const parts = extractParts(m.payload);
  const attachments: GmailAttachment[] = [];
  collectPdfAttachments(m.payload, attachments);
  const isBulk = isBulkOrAutomatedMail({
    listUnsubscribe: header(headers, "List-Unsubscribe"),
    precedence: header(headers, "Precedence"),
    autoSubmitted: header(headers, "Auto-Submitted"),
    feedbackId: header(headers, "Feedback-ID") || header(headers, "X-Feedback-ID"),
    xMailer: header(headers, "X-Mailer"),
  });
  return {
    id: String(m.id || id),
    threadId: String(m.threadId || ""),
    subject: header(headers, "Subject") || "(no subject)",
    fromName: from.name,
    fromEmail: from.email,
    toEmails: to,
    ccEmails: cc,
    toPeople,
    ccPeople,
    deliveredTo,
    date,
    dateLabel: toLabel(date),
    snippet: String(m.snippet || ""),
    body: parts.text.slice(0, 3000),
    links: extractArticleLinks(parts),
    attachments,
    permalink: `https://mail.google.com/mail/u/0/#all/${m.id}`,
    isBulk,
  };
}

// Download one attachment's bytes as STANDARD base64 (Gmail returns base64url;
// Gemini inlineData wants classic base64). Null on any failure — callers treat
// attachments as best-effort grounding, never a scan blocker.
export async function downloadGmailAttachment(
  messageId: string,
  attachmentId: string,
): Promise<string | null> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    return null;
  }
  try {
    const res = await fetch(
      `${GMAIL_API}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: string };
    if (!data.data) return null;
    return Buffer.from(data.data, "base64url").toString("base64");
  } catch {
    return null;
  }
}
// Low-level search — needs a valid Google token with gmail.readonly, not Signals.
// Pages through Gmail's list endpoint (100/page) until `max` ids are collected, so
// callers can request far more than one page worth of history.
async function searchGmailRaw(query: string, max = 25): Promise<GmailResult> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch (e) {
    console.error("[gmail] auth failed:", e);
    return { ok: false, messages: [], error: "Google auth failed." };
  }

  const wanted = Math.max(1, max);
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < wanted) {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(100, wanted - ids.length)),
    });
    if (pageToken) params.set("pageToken", pageToken);

    let listRes: Response;
    try {
      listRes = await fetch(`${GMAIL_API}/messages?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      console.error("[gmail] network error:", e);
      if (ids.length > 0) break;
      return { ok: false, messages: [], error: "Could not reach Gmail." };
    }

    if (!listRes.ok) {
      const body = await listRes.text().catch(() => "");
      console.error(`[gmail] list ${listRes.status}: ${body.slice(0, 250)}`);
      if (ids.length > 0) break;
      let error = `Gmail API error ${listRes.status}.`;
      if (
        listRes.status === 403 ||
        /insufficient|scope|ACCESS_TOKEN_SCOPE|not been used|disabled/i.test(body)
      ) {
        error =
          "Gmail not accessible — re-run mint-google-token.mjs (now requests gmail.readonly), update GOOGLE_REFRESH_TOKEN, and enable the Gmail API in the Google Cloud project.";
      } else if (listRes.status === 401) {
        error = "Google token invalid or expired — re-mint it.";
      }
      return { ok: false, messages: [], error };
    }

    let listData: { messages?: Array<{ id: string }>; nextPageToken?: string };
    try {
      listData = (await listRes.json()) as {
        messages?: Array<{ id: string }>;
        nextPageToken?: string;
      };
    } catch {
      if (ids.length > 0) break;
      return { ok: false, messages: [], error: "Gmail returned an unreadable response." };
    }

    for (const m of listData.messages || []) if (m.id) ids.push(m.id);
    pageToken = listData.nextPageToken;
    if (!pageToken) break;
  }

  const messages: GmailMessage[] = [];
  // Hydrate in small batches so large windows don't serialize hundreds of round-trips.
  const BATCH = 10;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = await Promise.all(ids.slice(i, i + BATCH).map((id) => getMessage(token, id)));
    for (const m of batch) if (m) messages.push(m);
  }
  messages.sort((a, b) => b.date - a.date);
  return { ok: true, messages };
}


// Search the mailbox with a Gmail query and return parsed messages (newest first).
// Gated behind GMAIL_SIGNALS_ENABLED for the Signals consumer.
export async function searchGmail(query: string, max = 25): Promise<GmailResult> {
  if (!isGmailConfigured()) {
    return {
      ok: false,
      messages: [],
      error: "Gmail signals are disabled (set GMAIL_SIGNALS_ENABLED=true).",
    };
  }
  return searchGmailRaw(query, max);
}

const FREE_EMAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "msn.com",
]);

export function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL.has((domain || "").toLowerCase());
}

function titleCaseLocal(local: string): string {
  return local
    .replace(/^name:/, "")
    .replace(/[._+]+/g, " ")
    .replace(/\d+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .slice(0, 80);
}

/** Warn once per process when internal config resolves empty (silent misconfig). */
let warnedEmptyInternal = false;

/**
 * Our own people: GMAIL_INTERNAL_DOMAINS (dt-capital.net) plus
 * GMAIL_INTERNAL_ADDRESSES for individual teammates at partner domains,
 * the team roster in user-ownership.ts, and non-free domains of the tracking
 * aliases (auto-included). Never list a whole partner domain — its business
 * units are real counterparties.
 */
export function getInternalConfig(): InternalConfig {
  const cfg = buildInternalConfig(
    process.env.GMAIL_INTERNAL_DOMAINS,
    process.env.GMAIL_INTERNAL_ADDRESSES,
  );
  for (const alias of getActivityAliases()) {
    const domain = (alias.split("@")[1] || "").toLowerCase();
    if (domain && !isFreeEmailDomain(domain)) cfg.domains.add(domain);
  }
  for (const e of TEAM_MEMBER_EMAILS) cfg.addresses.add(e.toLowerCase());

  if (cfg.domains.size === 0 && cfg.addresses.size === 0 && !warnedEmptyInternal) {
    warnedEmptyInternal = true;
    console.error(
      "[gmail] GMAIL_INTERNAL_DOMAINS / GMAIL_INTERNAL_ADDRESSES resolved empty — every teammate will be treated as external",
    );
    void import("./sheets.server")
      .then(({ logOpsEvent }) =>
        logOpsEvent({
          action: "sync",
          source: "gmail_internal_config",
          status: "warning",
          summary:
            "GMAIL_INTERNAL_DOMAINS is unset/empty and no alias domains or team addresses were available — direction and owner attribution will be wrong until configured",
          records: 0,
        }),
      )
      .catch(() => {
        /* never fail attribution because audit logging failed */
      });
  }
  return cfg;
}

/**
 * True when a Gmail message is BD/GTM activity-tracking mail — not a news signal.
 * Catches alias delivery (To/Cc/Delivered-To), DTC tracking subjects, and
 * meeting invites that belong on the Activity pipeline.
 */
export function isActivityTrackingMail(
  m: {
    fromEmail?: string;
    toEmails?: string[];
    ccEmails?: string[];
    deliveredTo?: string[];
    subject?: string;
    body?: string;
    snippet?: string;
  },
  aliasSet?: Set<string>,
): boolean {
  return isActivityTrackingMessage(m, aliasSet ?? new Set(getActivityAliases()));
}

/** MIME-header counterparties only — body/appointment recovery lives in thread intel. */
function mimeSeedPeople(
  m: GmailMessage,
  aliases: Set<string>,
): Array<{ name: string; email: string; role: Counterparty["role"] }> {
  const out: Array<{ name: string; email: string; role: Counterparty["role"] }> = [];
  const seen = new Set<string>();
  const add = (name: string, email: string, role: Counterparty["role"]) => {
    const e = (email || "").trim().toLowerCase();
    if (!e || aliases.has(e) || seen.has(e) || isNoiseEmail(e)) return;
    seen.add(e);
    out.push({
      name: name.trim() || titleCaseLocal(e.split("@")[0] || ""),
      email: e,
      role,
    });
  };
  add(m.fromName, m.fromEmail, "from");
  for (const p of m.toPeople) add(p.name, p.email, "to");
  for (const p of m.ccPeople) add(p.name, p.email, "cc");
  return out;
}

/** @deprecated use ACTIVITY_NOTES_BUDGET — kept for existing imports. */
export const NOTES_BUDGET = ACTIVITY_NOTES_BUDGET;

/** Fetch one message by Gmail id (used by the Notes backfill repair). */
export async function fetchGmailMessageById(id: string): Promise<GmailMessage | null> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    return null;
  }
  return getMessage(token, id);
}

/** Convert a Gmail message into a BD/GTM activity, or null when it is noise. */
export function messageToActivity(
  m: GmailMessage,
  track: "BD" | "GTM",
  aliases: Set<string>,
  internal: InternalConfig = getInternalConfig(),
): AsanaActivity | null {
  return threadToActivity([m], track, aliases, internal);
}

/**
 * Collapse one Gmail THREAD into a single activity: reply chains used to emit one
 * row per message (four rows for one conversation). Newest message supplies the
 * date/subject/permalink; counterparties are unioned across the thread.
 */
export function threadToActivity(
  messages: GmailMessage[],
  track: "BD" | "GTM",
  aliases: Set<string>,
  internal: InternalConfig = getInternalConfig(),
): AsanaActivity | null {
  const usable = messages.filter((m) => !m.isBulk);
  if (usable.length === 0) return null;
  const ordered = [...usable].sort((a, b) => b.date - a.date);
  const newest = ordered[0];

  // Inbound blast from a noise mailbox (newsletter/noreply) — skip entirely.
  const newestFrom = (newest.fromEmail || "").toLowerCase();
  if (newestFrom && isNoiseEmail(newestFrom) && !aliases.has(newestFrom)) return null;

  const seedPeople: Array<{ name: string; email: string; role: Counterparty["role"] }> = [];
  const seenSeed = new Set<string>();
  for (const m of ordered) {
    for (const p of mimeSeedPeople(m, aliases)) {
      if (seenSeed.has(p.email)) continue;
      seenSeed.add(p.email);
      seedPeople.push(p);
    }
  }

  // Prefer newest body; fall back through the thread for appointment / forward blocks.
  const bodyForIntel =
    ordered.find((m) => (m.body || "").trim().length > 0)?.body || newest.body || "";
  const outboundHint = aliases.has(newestFrom) || isInternalEmail(newestFrom, internal);

  const intel = enrichActivityFromThreadText(
    {
      subject: newest.subject,
      body: bodyForIntel,
      snippet: newest.snippet,
      seedPeople,
      outboundHint,
    },
    aliases,
    internal,
  );

  // Meetings can still land on BD with PortCos from the subject even when the
  // only humans on the thread are internal (appointment replies).
  if (!intel.primary && !intel.isMeeting) return null;

  // Owner = who did the work (the internal sender / alias). Person = who the
  // relationship is with. Two different fields, two different meanings.
  const ownerSource =
    ordered.find((m) => isInternalEmail(m.fromEmail, internal))?.fromEmail ||
    (newestFrom && !isNoiseEmail(newestFrom) ? newest.fromEmail : "");
  const owner = ownerSource || undefined;

  const audit = `Gmail: ${newest.permalink}${newest.threadId ? ` · thread ${newest.threadId}` : ""}${
    ordered.length > 1 ? ` · ${ordered.length} messages` : ""
  }`;
  const excerpt =
    emailBodyExcerpt(newest.body, ACTIVITY_NOTES_BUDGET) ||
    (isEmailChromeText(newest.snippet) ? "" : sanitizeEmailText(newest.snippet).trim());
  const notes = formatActivityNotes({
    headLine: intel.headLine,
    peopleLine: intel.peopleLine,
    channelLine: intel.channelLine,
    auditLine: audit,
    bodyExcerpt: excerpt,
    budget: ACTIVITY_NOTES_BUDGET,
  });

  return {
    // Stable per thread so replies update the same Notes/BD row instead of
    // appending forever. threadId equals the first message id on single-message
    // threads, so those keep the gid the per-message sync already wrote.
    gid: `gmail-${newest.threadId || newest.id}`,
    track,
    name: newest.subject,
    date: newest.dateLabel || undefined,
    completed: true,
    status: intel.status || (intel.outbound ? "Sent" : "Received"),
    owner,
    type: intel.type || (intel.isMeeting ? "Meeting" : "Email"),
    // Last-resort company only; canonicalizeActivities replaces this with every
    // portfolio name found in the subject/notes (slash-separated when several).
    company: intel.company,
    person: intel.person,
    notes,
    url: newest.permalink,
  };
}
async function fetchTrackFromAliases(
  track: "BD" | "GTM",
  aliases: string[],
): Promise<AsanaActivity[]> {
  // Show everything for tagged PortCos: at least a year of history and up to 500
  // threads per track (env vars can widen this further, never narrow it).
  const windowDays = Math.max(Number(process.env.GMAIL_ACTIVITY_WINDOW_DAYS) || 0, 365);
  const max = Math.max(Number(process.env.GMAIL_ACTIVITY_MAX) || 0, 500);

  // Alias delivery (from/to/cc/deliveredto) OR DTC:/GTM Discussion subjects that
  // never touched the alias inbox. deliveredto: catches auto-forwards into the
  // alias where it never appears in visible To/Cc.
  const aliasTerms = aliases
    .flatMap((a) => [`from:${a}`, `to:${a}`, `cc:${a}`, `deliveredto:${a}`])
    .join(" OR ");
  const subjectTerms = activitySubjectQuery(track);
  const clauses = [aliasTerms, subjectTerms].filter(Boolean).map((c) => `(${c})`);
  if (clauses.length === 0) return [];
  const q = `newer_than:${windowDays}d (${clauses.join(" OR ")})`;
  const res = await searchGmailRaw(q, max);
  if (!res.ok) {
    console.error(`[gmail] ${track} alias sync failed:`, res.error);
    return [];
  }
  const aliasSet = new Set(aliases);
  const internal = getInternalConfig();
  // Drop subject-query false positives that aren't really activity mail.
  const kept = res.messages.filter((m) => isActivityTrackingMessage(m, aliasSet));
  // One activity per thread, not per message.
  const threads = new Map<string, GmailMessage[]>();
  for (const m of kept) {
    const key = m.threadId || m.id;
    const list = threads.get(key);
    if (list) list.push(m);
    else threads.set(key, [m]);
  }
  const out: AsanaActivity[] = [];
  for (const group of threads.values()) {
    const act = threadToActivity(group, track, aliasSet, internal);
    if (act) out.push(act);
  }
  return out;
}

// Pull BD/GTM emails from the configured Gmail aliases into AsanaActivity-shaped
// records so they flow through the same sheet + contact-match pipeline as Asana.
// Requires the aliases to deliver into the Google mailbox backing GOOGLE_REFRESH_TOKEN.
export async function fetchAliasActivities(): Promise<AsanaActivity[]> {
  gmailDateDbg.calls = 0;
  gmailDateDbg.shifted = 0;
  gmailDateDbg.samples = [];
  const bd = parseAliasList(process.env.GMAIL_BD_ALIAS);
  const gtm = parseAliasList(process.env.GMAIL_GTM_ALIAS);
  // Still run when aliases are empty: subject classifier (DTC:/GTM Discussion)
  // can surface tracking threads that never hit the alias inbox.

  const [bdActs, gtmActs] = await Promise.all([
    fetchTrackFromAliases("BD", bd),
    fetchTrackFromAliases("GTM", gtm),
  ]);
  // Prefer track-specific rows; if the same thread matched both subject queries,
  // keep the first (BD then GTM) by gid.
  const seen = new Set<string>();
  const out: AsanaActivity[] = [];
  for (const a of [...bdActs, ...gtmActs]) {
    if (seen.has(a.gid)) continue;
    seen.add(a.gid);
    out.push(a);
  }
  out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  // #region agent log
  fetch("http://127.0.0.1:7724/ingest/5184a65b-0c76-4274-b203-81774fe31d23", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "3375d3" },
    body: JSON.stringify({
      sessionId: "3375d3",
      hypothesisId: "C",
      location: "gmail.server.ts:fetchAliasActivities",
      message: "Gmail NY vs UTC calendar day",
      data: {
        activities: out.length,
        dated: out.filter((a) => a.date).length,
        toLabelCalls: gmailDateDbg.calls,
        utcShifted: gmailDateDbg.shifted,
        shiftSamples: gmailDateDbg.samples,
        dateSamples: out.slice(0, 8).map((a) => a.date || ""),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  gmailDateDbg.calls = 0;
  gmailDateDbg.shifted = 0;
  gmailDateDbg.samples = [];
  // #endregion
  return out;
}

/** Opt-in CRM deepen: sent mail + calendar invites → Notes on Sync activity. */
export function isGmailCrmSyncConfigured(): boolean {
  return process.env.GMAIL_CRM_SYNC_ENABLED === "true";
}

export interface CrmMailboxTouch {
  message: GmailMessage;
  /** "sent" = outbound mail; "calendar" = invite / update / RSVP. */
  kind: "sent" | "calendar";
}

/**
 * Recent sent mail + calendar invite traffic for CRM Notes sync.
 * Does not require GMAIL_SIGNALS_ENABLED — uses searchGmailRaw directly.
 */
export async function fetchCrmMailboxTouches(): Promise<{
  ok: boolean;
  error?: string;
  touches: CrmMailboxTouch[];
}> {
  if (!isGmailCrmSyncConfigured()) {
    return { ok: true, touches: [] };
  }
  const windowDays = Number(process.env.GMAIL_CRM_WINDOW_DAYS) || 30;
  const max = Number(process.env.GMAIL_CRM_MAX) || 40;

  const [sentRes, calRes] = await Promise.all([
    searchGmailRaw(`in:sent newer_than:${windowDays}d`, max),
    searchGmailRaw(
      `newer_than:${windowDays}d (filename:ics OR subject:(invitation OR invited OR "Invitation:" OR "Updated invitation" OR "Canceled event" OR accepted: OR declined:))`,
      max,
    ),
  ]);

  if (!sentRes.ok && !calRes.ok) {
    return {
      ok: false,
      error: sentRes.error || calRes.error || "Gmail CRM sync failed",
      touches: [],
    };
  }

  const seen = new Set<string>();
  const touches: CrmMailboxTouch[] = [];
  for (const m of sentRes.ok ? sentRes.messages : []) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    touches.push({ message: m, kind: "sent" });
  }
  for (const m of calRes.ok ? calRes.messages : []) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    touches.push({ message: m, kind: "calendar" });
  }
  touches.sort((a, b) => b.message.date - a.message.date);
  return { ok: true, touches };
}

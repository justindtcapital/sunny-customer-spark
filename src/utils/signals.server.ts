// Signals page server work: the feed (stored Signals tab rows, gated and mapped
// to FeedCards), manually added signals, and "Send to Venture Pulse via news@".
// Server-only — loaded with dynamic import from signals.functions handlers.
import { buildFeed, newsSourceType, type FeedCard } from "@/lib/signal-feed";
import { signalNewsEmail, type SignalNewsKind } from "@/lib/signals-page";
import { teamMemberFor } from "@/lib/user-ownership";
import { lastGoodReader } from "@/lib/last-good";
import { acceptableHeadline, shortenHeadline } from "@/lib/signal-headline";

/** Newest cards sent to the page; older ones stay on the sheet (and in V.I.C.). */
const FEED_MAX = 600;

export interface SignalsFeed {
  cards: FeedCard[];
  portcos: string[];
  /** Employers of Council/Hot/Warm people (enterprise watch) — the Network ring. */
  watch: string[];
  total: number;
  truncated: boolean;
}

// A busy spreadsheet (rate limit) serves this instance's last real feed, else a
// plain "temporarily unavailable" message — never raw Google errors or demo rows.
export const loadSignalsFeed = lastGoodReader(loadSignalsFeedLive, "Signals");

async function loadSignalsFeedLive(): Promise<SignalsFeed> {
  const { fetchStoredSignals } = await import("./signal-store.server");
  const { buildContacts, buildPortfolioCompanies } = await import("./sheets.server");
  const { gatedStoredSignals } = await import("./gemini.functions");
  const { markPortCoContacts } = await import("@/lib/contact-kind");
  // Strict: a failed Signals read surfaces as "unavailable", never as an empty feed.
  const [stored, portfolio, rawContacts] = await Promise.all([
    fetchStoredSignals({ strict: true }),
    buildPortfolioCompanies(),
    buildContacts(),
  ]);
  const contacts = markPortCoContacts(rawContacts, portfolio.map((p) => p.name));
  const portcoNames = new Set(portfolio.map((p) => p.name.trim().toLowerCase()));
  const result = gatedStoredSignals(stored, contacts, portcoNames);
  const cards = buildFeed({
    recommendations: result.recommendations,
    otherSignals: result.otherSignals,
    linkedinPosts: [],
    driveDocs: [],
    portfolio,
    contacts,
  });
  return {
    cards: cards.slice(0, FEED_MAX),
    portcos: portfolio.map((p) => p.name).sort((a, b) => a.localeCompare(b)),
    watch: (await import("@/lib/enterprise-watch")).enterpriseWatchList(contacts, { portcoNames: portfolio.map((p) => p.name) }).map((w) => w.name),
    total: cards.length,
    truncated: cards.length > FEED_MAX,
  };
}

const displayName = (email: string) => teamMemberFor(email)?.displayName || email;

// ── Send to news@ ────────────────────────────────────────────────

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** Plain-text email from the linked Workspace Gmail (same path as the Morning Brief). */
async function sendWorkspaceEmail(m: { to: string; subject: string; text: string; replyTo?: string }) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const gmailKey = process.env["GOOGLE_MAIL_API_KEY"];
  if (!lovableKey || !gmailKey) throw new Error("The Workspace Gmail connection isn't linked to Venture Pulse.");
  const mime = [
    `To: ${m.to}`,
    m.replyTo ? `Reply-To: ${m.replyTo}` : "",
    `Subject: =?UTF-8?B?${b64(m.subject)}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64(m.text),
  ].filter((l, i) => l || i > 0).join("\r\n");
  const raw = Buffer.from(mime, "utf8").toString("base64url");
  const res = await fetch("https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": gmailKey, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[signals] news@ send failed [${res.status}]: ${body}`);
    throw new Error(`Gmail send failed [${res.status}]`);
  }
}

export interface SignalToNews {
  id?: string;
  kind: SignalNewsKind;
  company?: string;
  headline: string;
  summary?: string;
  sourceUrl?: string;
}

export async function sendSignalToNews(s: SignalToNews, teamEmail: string): Promise<{ ok: true; to: string }> {
  const { getNewsAliases } = await import("./gmail.server");
  const to = getNewsAliases()[0];
  if (!to) throw new Error("The news@ address isn't set up in Venture Pulse.");
  const mail = signalNewsEmail({ ...s, sharedBy: `${displayName(teamEmail)} <${teamEmail}>` });
  await sendWorkspaceEmail({ to, subject: mail.subject, text: mail.body, replyTo: teamEmail });
  return { ok: true, to };
}

// ── Add a signal ─────────────────────────────────────────────────

export interface NewSignal {
  kind: SignalNewsKind;
  company?: string;
  url?: string;
  headline?: string;
  text?: string;
  sendToNews?: boolean;
}

export type AddSignalResult =
  | { ok: true; id: string; headline: string; sent?: boolean; sendError?: string }
  | { ok: false; duplicateOf?: string; error: string };

export async function addManualSignal(input: NewSignal, teamEmail: string): Promise<AddSignalResult> {
  const { fetchStoredSignals, rowFromStored, signalId } = await import("./signal-store.server");
  const { appendSheetRows, buildPortfolioCompanies, ensureTab, ensureHeaderRow, SIGNAL_HEADERS, TAB_NAMES } = await import("./sheets.server");
  const { articleUrlKey } = await import("./news.server");
  const url = (input.url || "").trim();
  const text = (input.text || "").trim();
  if (url && !/^https?:\/\/\S+$/i.test(url)) return { ok: false, error: "The link must start with http:// or https://" };
  if (!url && !text && !(input.headline || "").trim()) return { ok: false, error: "Paste a link or some text." };

  // PortCo signals use the canonical PortCo name; anything else is Industry.
  let company = (input.company || "").trim();
  if (input.kind === "PortCo") {
    const portcos = await buildPortfolioCompanies();
    const hit = portcos.find((p) => p.name.trim().toLowerCase() === company.toLowerCase());
    if (!hit) return { ok: false, error: "Pick a PortCo from the list." };
    company = hit.name;
  }

  // First signal on a new spreadsheet creates the tab with the standard headers.
  await ensureTab(TAB_NAMES.signals, SIGNAL_HEADERS);
  await ensureHeaderRow(TAB_NAMES.signals, SIGNAL_HEADERS);
  // Fresh read so another server instance's recent add is seen before appending.
  const existing = await fetchStoredSignals({ fresh: true, strict: true });
  const key = url ? articleUrlKey(url) : "";
  if (key) {
    const dup = existing.find((s) => s.sourceUrl && articleUrlKey(s.sourceUrl) === key);
    if (dup) return { ok: false, duplicateOf: dup.id, error: "That link is already in Signals." };
  }

  let headline = (input.headline || "").trim();
  let summary = text;
  if (url && (!headline || !summary)) {
    const { fetchLinkPreviews } = await import("./link-preview.server");
    const p = (await fetchLinkPreviews([url], { budgetMs: 6_000 })).get(url);
    if (!headline && p?.title) headline = p.title.trim();
    if (!summary && p?.description) summary = p.description.trim();
  }
  if (!headline) headline = (summary.split(/(?<=[.!?])\s+/)[0] || url).slice(0, 220);
  if (!summary) summary = headline;

  const who = company || "Industry";
  const id = signalId("awareness", who, url || `${headline}|${summary.slice(0, 120)}`);
  if (existing.some((s) => s.id === id)) return { ok: false, duplicateOf: id, error: "That signal is already in Signals." };
  const category = input.kind === "PortCo" ? "Product/Milestone" : "Industry Trend";
  const sourceType = newsSourceType(input.kind === "PortCo" ? category : "", input.kind === "PortCo", url);
  const row = rowFromStored({
    id,
    dateFound: new Date().toISOString().slice(0, 10),
    type: "awareness",
    status: "New",
    person: "",
    company,
    email: "",
    category,
    signal: summary.replace(/\s+/g, " ").slice(0, 600),
    sourceUrl: url,
    subject: headline.slice(0, 200),
    headline: acceptableHeadline(shortenHeadline(headline), company),
    body: "",
    relevance: 6,
    justification: `Added by ${displayName(teamEmail)}`,
    urgency: "",
    timing: "",
    sourceType,
    docUrl: "",
    hasBody: false,
  });
  await appendSheetRows(TAB_NAMES.signals, [row], true);

  if (!input.sendToNews) return { ok: true, id, headline };
  try {
    await sendSignalToNews({ id, kind: input.kind, company, headline, summary, sourceUrl: url }, teamEmail);
    return { ok: true, id, headline, sent: true };
  } catch (e) {
    return { ok: true, id, headline, sent: false, sendError: e instanceof Error ? e.message : "Send failed" };
  }
}

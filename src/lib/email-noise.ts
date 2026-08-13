// Shared mailbox-noise heuristics for BD/GTM activity sync and CRM deepen.
// Pure — safe to unit-test without Gmail.

/** Local-parts that are almost never a real relationship contact. */
const SYSTEM_LOCAL =
  /^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|mailer-daemon|postmaster|calendar(-notification)?|info|support|admin|team|hello|contact|help|news(letter)?|marketing|updates?|noreply|bounce|bounces|email\.customerservice|customerservice|service|feedback|survey|digest|alerts?|automated?|robot|system|mailman|listserv|unsubscribe|subscriptions?|billing|receipts?|invoices?|orders?|shipping|noreply[\w.-]*)$/i;

/** Domains that are almost always marketing / platform noise. */
/** ESP / marketing platforms — almost never a human relationship contact. */
const NOISE_DOMAINS = new Set([
  "mailchimp.com",
  "mailchimpapp.com",
  "sendgrid.net",
  "sendgrid.com",
  "amazonses.com",
  "bounce.google.com",
  "facebookmail.com",
  "lnkd.in",
  "hubspotemail.net",
  "intercom-mail.com",
  "substack.com",
  "convertkit.com",
  "ck.page",
  "beehiiv.com",
  "mktomail.com",
  "exacttarget.com",
  "pardot.com",
  "constantcontact.com",
]);

export function emailLocalPart(email: string): string {
  return (email || "").trim().toLowerCase().split("@")[0] || "";
}

export function emailDomain(email: string): string {
  return (email || "").trim().toLowerCase().split("@")[1] || "";
}

/** True when this address should never become BD/GTM Person or a Notes match target. */
export function isNoiseEmail(email: string): boolean {
  const e = (email || "").trim().toLowerCase();
  if (!e.includes("@")) return true;
  const local = emailLocalPart(e);
  const domain = emailDomain(e);
  if (!local || !domain) return true;
  if (SYSTEM_LOCAL.test(local)) return true;
  // Nested system locals: alerts+xyz@, newsletter=foo@
  if (/^(no-?reply|newsletter|mailer|bounce|notifications?)/i.test(local)) return true;
  if (NOISE_DOMAINS.has(domain)) return true;
  // Common ESP subdomains: bounce.example.com, email.example.com (weak — only mailer patterns)
  if (/^(bounce|email|mail|news|newsletter|marketing|m)\./i.test(domain)) return true;
  return false;
}

export interface BulkMailSignals {
  listUnsubscribe?: string;
  precedence?: string;
  autoSubmitted?: string;
  xMailer?: string;
  feedbackId?: string;
}

/** True when headers look like a newsletter / bulk / automated blast. */
export function isBulkOrAutomatedMail(signals: BulkMailSignals): boolean {
  // List-Unsubscribe is the strongest newsletter signal. Do NOT treat Feedback-ID
  // alone as bulk — Amazon SES puts it on many 1:1 transactional/outreach mails.
  if ((signals.listUnsubscribe || "").trim()) return true;
  const prec = (signals.precedence || "").trim().toLowerCase();
  if (prec === "bulk" || prec === "list" || prec === "junk") return true;
  const auto = (signals.autoSubmitted || "").trim().toLowerCase();
  if (auto && auto !== "no") return true;
  return false;
}
export interface Counterparty {
  name: string;
  email: string;
  role: "from" | "to" | "cc" | "forwarded";
  /** True when this address is one of our own people (see InternalConfig). */
  internal?: boolean;
}

/**
 * Who counts as "us": whole domains (dt-capital.net) plus individual addresses
 * for teammates at partner domains. Never blanket-exclude a partner domain —
 * e.g. Dell business units are legitimate GTM counterparties for portcos, so
 * only the specific Dell teammates who forward threads are listed.
 */
export interface InternalConfig {
  domains: Set<string>;
  addresses: Set<string>;
}

export const EMPTY_INTERNAL: InternalConfig = { domains: new Set(), addresses: new Set() };

/** Build an InternalConfig from comma/semicolon-separated env strings. */
export function buildInternalConfig(domainsRaw?: string, addressesRaw?: string): InternalConfig {
  const split = (raw?: string) =>
    (raw || "")
      .split(/[;,\s]+/)
      .map((s) => s.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
  return {
    domains: new Set(split(domainsRaw).filter((d) => !d.includes("@"))),
    addresses: new Set(split(addressesRaw).filter((a) => a.includes("@"))),
  };
}

/** True when the address belongs to our own team (or is a tracking alias). */
export function isInternalEmail(email: string, cfg: InternalConfig): boolean {
  const e = (email || "").trim().toLowerCase();
  if (!e.includes("@")) return false;
  if (cfg.addresses.has(e)) return true;
  const domain = emailDomain(e);
  if (!domain) return false;
  if (cfg.domains.has(domain)) return true;
  // Subdomains of an internal domain count too (mail.dt-capital.net).
  for (const d of cfg.domains) if (domain.endsWith(`.${d}`)) return true;
  return false;
}

/**
 * Pick the real relationship person for a BD/GTM row.
 *
 * External people always win over internal teammates — a thread forwarded by a
 * teammate must be attributed to the outside contact, not the forwarder. Within
 * each group the role preference follows direction:
 *   inbound  → From, then To, then Cc
 *   outbound → To, then Cc, then From
 * Internal people are used only when the thread has no external human at all.
 */
export function pickPrimaryCounterparty(
  people: Counterparty[],
  outbound: boolean,
): Counterparty | undefined {
  const clean = people.filter((p) => p.email && !isNoiseEmail(p.email));
  if (clean.length === 0) return undefined;
  const roleOrder: Counterparty["role"][] = outbound
    ? ["to", "cc", "forwarded", "from"]
    : ["from", "forwarded", "to", "cc"];
  const byRank = (group: Counterparty[]) => {
    for (const role of roleOrder) {
      const hit = group.find((p) => p.role === role);
      if (hit) return hit;
    }
    return group[0];
  };
  const external = clean.filter((p) => !p.internal);
  if (external.length > 0) return byRank(external);
  return byRank(clean);
}

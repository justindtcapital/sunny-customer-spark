/** Pure helpers for the Twilio WhatsApp ↔ V.I.C. bridge (browser-safe). */

export const WHATSAPP_WEBHOOK_PATH = "/api/public/twilio-whatsapp";
export const WHATSAPP_APP_ORIGIN = "https://crm.dt-capital.net";
export const WHATSAPP_WEBHOOK_URL = `${WHATSAPP_APP_ORIGIN}${WHATSAPP_WEBHOOK_PATH}`;
export const VIC_SMS_NUMBER = "+1 (855) 578-5177";

export type TwilioChannel = "whatsapp" | "sms";

/** Detect whether a Twilio To/From address belongs to WhatsApp ("whatsapp:+1..."). */
export function isTwilioWhatsAppAddress(address: string | null | undefined): boolean {
  return /^whatsapp:/i.test((address || "").trim());
}

/** Detect whether an inbound Twilio message pair arrived over WhatsApp or plain SMS. */
export function detectTwilioChannel(fromRaw: string, toRaw: string): TwilioChannel {
  return isTwilioWhatsAppAddress(fromRaw) || isTwilioWhatsAppAddress(toRaw) ? "whatsapp" : "sms";
}

/**
 * Normalize a phone number or Twilio WhatsApp address ("whatsapp:+15551234567")
 * into strict E.164 format ("+15551234567"). Accepts 10-digit US/CA numbers
 * without a leading "+1" for convenience. Returns null when invalid.
 */
export function normalizeWhatsAppPhone(input: string | null | undefined): string | null {
  const stripped = (input || "").trim().replace(/^whatsapp:/i, "").trim();
  if (!stripped) return null;
  const hasPlus = stripped.startsWith("+");
  const digits = stripped.replace(/\D/g, "");
  if (!digits) return null;
  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
    return `+${digits}`;
  }
  if (digits.length === 10 && !digits.startsWith("0")) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** Format an E.164 number for Twilio's WhatsApp To/From parameter. */
export function toTwilioWhatsAppAddress(phoneE164: string): string {
  return phoneE164.startsWith("whatsapp:") ? phoneE164 : `whatsapp:${phoneE164}`;
}

/** Format a phone address for the matching Twilio channel (WhatsApp keeps prefix; SMS uses plain E.164). */
export function formatTwilioAddress(address: string, channel: TwilioChannel): string {
  const stripped = address.trim().replace(/^whatsapp:/i, "").trim();
  return channel === "whatsapp" ? toTwilioWhatsAppAddress(stripped) : stripped;
}

/** Commands that start a fresh WhatsApp conversation thread with V.I.C. */
export function isWhatsAppResetCommand(body: string): boolean {
  const t = body.trim().toLowerCase();
  return t === "/new" || t === "new chat" || t === "/reset" || t === "reset";
}

/**
 * Convert V.I.C.'s markdown answer into clean WhatsApp formatting:
 * - [label](url) -> label (https://...) with relative paths resolved to origin
 * - **bold** -> *bold*
 * - ### Heading -> *Heading*
 */
export function formatWhatsAppReply(markdown: string, origin = WHATSAPP_APP_ORIGIN): string {
  const base = origin.replace(/\/+$/, "");
  return markdown
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, rawUrl: string) => {
      const url = rawUrl.startsWith("/") ? `${base}${rawUrl}` : rawUrl;
      return label.trim() === url ? url : `${label.trim()} (${url})`;
    })
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Convert V.I.C.'s markdown answer into clean plain text for SMS:
 * - [label](url) -> label (https://...) with relative paths resolved to origin
 * - Strip markdown headings and bold/italic markers so raw asterisks don't clutter texts
 */
export function formatSmsReply(markdown: string, origin = WHATSAPP_APP_ORIGIN): string {
  const base = origin.replace(/\/+$/, "");
  return markdown
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, rawUrl: string) => {
      const url = rawUrl.startsWith("/") ? `${base}${rawUrl}` : rawUrl;
      return label.trim() === url ? url : `${label.trim()} (${url})`;
    })
    .replace(/^#{1,6}\s+(.+)$/gm, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Split a long reply into chunks that fit comfortably inside Twilio's 1,600-char limit. */
export function splitWhatsAppMessage(text: string, maxLen = 1500): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];
  const chunks: string[] = [];
  let rest = clean;
  while (rest.length > maxLen) {
    const slice = rest.slice(0, maxLen);
    const para = slice.lastIndexOf("\n\n");
    const line = slice.lastIndexOf("\n");
    const space = slice.lastIndexOf(" ");
    const minCut = Math.floor(maxLen * 0.4);
    const cut = para >= minCut ? para : line >= minCut ? line : space >= minCut ? space : maxLen;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Build a minimal TwiML XML response (empty <Response/> when text is omitted). */
export function twimlMessage(text?: string): string {
  const body = (text || "").trim();
  if (!body) return '<?xml version="1.0" encoding="UTF-8"?><Response/>';
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(body)}</Message></Response>`;
}
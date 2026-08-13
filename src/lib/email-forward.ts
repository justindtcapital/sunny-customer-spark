// Recover the real counterparties from a forwarded message body.
//
// The team's workflow is often "forward the thread to the tracking alias after
// the fact". The headers of such a message contain only internal people, so the
// only trace of the actual contact is the quoted original header block every
// mail client writes at the top of a forward:
//
//   ---------- Forwarded message ---------
//   From: Vrashank Jain <vrashank.j@dell.com>
//   Date: Tue, Aug 12, 2026 at 9:04 AM
//   Subject: MaxIQ > Dell DFS
//   To: Chris Falloon <chris@dt-capital.net>
//
// Conservative by design: only the FIRST forwarded block is trusted, and callers
// should only use it when header-level extraction found nobody external.

import { parseAddressList, type EmailAddress } from "./email-address";

export interface ForwardedHeaders {
  from?: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject?: string;
}

const BLOCK_START =
  /(-{2,}\s*forwarded message\s*-{2,}|^-{5,}\s*original message\s*-{5,}|\bbegin forwarded message:)/im;

/** True when the subject looks like a forward (FW:, Fwd:, TR:). */
export function isForwardedSubject(subject: string): boolean {
  return /^\s*(fw|fwd|tr)\s*:/i.test(subject || "");
}

/**
 * Extract addresses from the first quoted forwarded-header block in a body.
 * Returns null when no block with a parseable From: line is found.
 */
export function extractForwardedHeaders(body: string): ForwardedHeaders | null {
  const text = (body || "").replace(/\r\n/g, "\n");
  if (!text.trim()) return null;

  const marker = text.match(BLOCK_START);
  // Some clients omit the banner and start straight into "From: ..." lines.
  const startIdx = marker
    ? (marker.index ?? 0) + marker[0].length
    : text.search(/^\s*>?\s*from\s*:/im);
  if (startIdx < 0) return null;

  // The header block is short: scan only the next ~40 lines / 4000 chars.
  const window = text.slice(startIdx, startIdx + 4000).split("\n").slice(0, 40);

  const out: ForwardedHeaders = { to: [], cc: [] };
  let sawFrom = false;
  for (const rawLine of window) {
    const line = rawLine.replace(/^\s*>+\s?/, "").trim();
    if (!line) {
      // A blank line after the From: line ends the header block.
      if (sawFrom) break;
      continue;
    }
    const m = line.match(/^(from|to|cc|subject|sent|date)\s*:\s*(.*)$/i);
    if (!m) {
      if (sawFrom) break; // body text started
      continue;
    }
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "from") {
      const addrs = parseAddressList(value);
      if (addrs.length > 0) {
        out.from = addrs[0];
        sawFrom = true;
      }
    } else if (field === "to") {
      out.to.push(...parseAddressList(value));
    } else if (field === "cc") {
      out.cc.push(...parseAddressList(value));
    } else if (field === "subject" && !out.subject) {
      out.subject = value.slice(0, 300);
    }
  }
  if (!out.from && out.to.length === 0 && out.cc.length === 0) return null;
  return out;
}

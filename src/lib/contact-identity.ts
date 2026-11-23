// One identity rule for every "add a person" path: before a new Contacts row is
// appended, look for the same person anywhere in the unified Contacts list
// (Network and Prospecting, archived "Merged" rows excluded). Same email,
// same LinkedIn, or same full name at the same company means "already here".

import { emailIdentities, linkedinIdentity, normalizeIdentity } from "./import-dedupe";
import { companyKey, isMergedStatus } from "./contact-merge";
import { isProspectStatus } from "./unified-contacts";

export type ExistingReason = "email" | "linkedin" | "name-company";
export interface ExistingContact {
  urid: string; name: string; email: string; company: string; status: string;
  /** 1-based sheet row number. */
  row: number;
  reason: ExistingReason;
}
export interface IdentityInput { name?: string; email?: string; company?: string; linkedin?: string }

/** Lowercased, accent-free, punctuation-free full name. */
export function personNameKey(name?: string): string {
  return normalizeIdentity(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[.,'’]/g, "").replace(/\s+/g, " ").trim();
}

const REASON_ORDER: ExistingReason[] = ["email", "linkedin", "name-company"];

/** Every live Contacts row that is the same person, strongest evidence first (Network before Prospecting). */
export function findExistingContacts(rows: string[][], input: IdentityInput): ExistingContact[] {
  const h = (rows[0] || []).map((x) => (x || "").trim().toLowerCase());
  const col = (...names: string[]) => { for (const n of names) { const i = h.indexOf(n); if (i >= 0) return i; } return -1; };
  const iU = col("urid"), iN = col("name", "full name", "contact name"), iF = col("first name"), iL = col("last name");
  const iE = col("email", "email address"), iC = col("company", "organization"), iLi = col("linkedin", "linkedin url"), iS = col("relationship status");
  const emails = emailIdentities(input.email);
  const li = linkedinIdentity(input.linkedin);
  const nk = personNameKey(input.name);
  const ck = companyKey(input.company || "");
  const hits: ExistingContact[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const get = (i: number) => (i >= 0 ? (row[i] || "").trim() : "");
    const status = get(iS);
    if (isMergedStatus(status)) continue;
    const name = get(iN) || `${get(iF)} ${get(iL)}`.trim();
    const rowEmails = emailIdentities(get(iE));
    let reason: ExistingReason | null = null;
    if (emails.length && rowEmails.some((e) => emails.includes(e))) reason = "email";
    else if (li && li === linkedinIdentity(get(iLi))) reason = "linkedin";
    else if (nk.includes(" ") && ck && personNameKey(name) === nk && companyKey(get(iC)) === ck) reason = "name-company";
    if (reason) hits.push({ urid: get(iU), name, email: rowEmails[0] || "", company: get(iC), status, row: r + 1, reason });
  }
  return hits.sort((a, b) =>
    REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason)
    || Number(isProspectStatus(a.status)) - Number(isProspectStatus(b.status))
    || a.row - b.row);
}

/** The record a new add should reuse instead of appending, or null when the person is new. */
export function findExistingContact(rows: string[][], input: IdentityInput): ExistingContact | null {
  return findExistingContacts(rows, input)[0] || null;
}

import { TEAM_MEMBER_EMAILS, teamMemberFor } from "./user-ownership";

/** Authentication accepts exact roster emails only, never name aliases. */
export function allowedTeamEmail(email: string | null | undefined): string | null {
  const value = (email || "").trim().toLowerCase();
  if (!TEAM_MEMBER_EMAILS.includes(value)) return null;
  return teamMemberFor(value)?.email || null;
}

export function granolaCursorKey(userId?: string): string {
  return userId ? `granola:notes:user:${userId}` : "granola:notes";
}

export function granolaAuthor(owner?: { name?: string | null; email?: string | null }): string {
  return [owner?.name?.trim(), owner?.email ? `<${owner.email.trim().toLowerCase()}>` : ""].filter(Boolean).join(" ");
}
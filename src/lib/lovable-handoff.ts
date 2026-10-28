export const LOVABLE_PROJECT_URL = "https://lovable.dev/projects/7c33d3e2-e7bb-4735-a8af-186d76e4a521";
export const MAX_URL_LENGTH = 7500;

export interface HandoffRequest {
  title: string; description: string; lovable_prompt: string;
  priority: string; effort: string; status: string; requested_by: string; created_at: string;
}

const RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function buildHandoffPrompt(kind: "fix" | "feature", reqs: HandoffRequest[]): string {
  const sorted = [...reqs].sort((a, b) => (RANK[a.priority] ?? 1) - (RANK[b.priority] ?? 1));
  const label = kind === "fix" ? "fix requests" : "feature requests";
  const items = sorted.map((r, i) =>
    `${i + 1}. ${r.title} (priority ${r.priority}, effort ${r.effort}, from ${r.requested_by || "unknown"}, logged ${r.created_at.slice(0, 10)})\n   Problem/need: ${r.description}\n   Build notes: ${r.lovable_prompt}`).join("\n\n");
  return `Venture Pulse Admin queue — ${sorted.length} ${label}.\n\nBefore changing any code, write a build plan covering each item below (approach, affected areas, risks) and wait for my approval.\n\n${items}`;
}

/** Returns a Lovable URL that pre-fills the prompt, or the bare project URL when too long (caller copies to clipboard). */
export function buildHandoffUrl(prompt: string): { url: string; prefilled: boolean } {
  const url = `${LOVABLE_PROJECT_URL}?prompt=${encodeURIComponent(prompt)}`;
  return url.length <= MAX_URL_LENGTH ? { url, prefilled: true } : { url: LOVABLE_PROJECT_URL, prefilled: false };
}

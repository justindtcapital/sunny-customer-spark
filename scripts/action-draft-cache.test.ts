import { describe, it, expect } from "vitest";
import { actionDraftKey, readActionDraft, writeActionDraft, outlookComposeLinks, isAppleMobile, type CachedActionDraft } from "../src/lib/action-draft-cache";

const draft: CachedActionDraft = {
  request: "Refine this", to: [{ name: "CEO", email: "ceo@example.com" }], addr: "", portcos: ["Akka"], tracks: ["BD"],
  subject: "Introduction", body: "Refined note", messages: [{ id: "turn1", role: "user", parts: [{ type: "text", text: "My original request" }] }],
  tone: "formal", length: "long", includePortcos: true, mode: "email", logNote: "", fuDate: "2026-11-02", fuNote: "Check in",
  found: [], picked: {}, outlookOpened: true,
};
function storage() {
  const rows = new Map<string, string>();
  return { getItem: (k: string) => rows.get(k) ?? null, setItem: (k: string, v: string) => { rows.set(k, v); }, removeItem: (k: string) => { rows.delete(k); } };
}
describe("unfinished action drafts", () => {
  it("restores refined text, conversation, tagging and follow-up after closing", () => {
    const store = storage(); const key = actionDraftKey("chris@example.com", { sourceKind: "followup", sourceId: "1" });
    expect(writeActionDraft(store, key, draft)).toBe(true);
    expect(readActionDraft(store, key)).toEqual(draft);
  });
  it("isolates drafts by signed-in account and action", () => {
    const store = storage(); const source = { sourceKind: "followup", sourceId: "1" };
    writeActionDraft(store, actionDraftKey("chris@example.com", source), draft);
    expect(readActionDraft(store, actionDraftKey("julia@example.com", source))).toBeNull();
    expect(readActionDraft(store, actionDraftKey("chris@example.com", { ...source, sourceId: "2" }))).toBeNull();
    expect(readActionDraft(store, actionDraftKey("chris@example.com", { ...source, followUpActivityId: "other" }))).toBeNull();
  });
  it("removes drafts only on explicit discard/completion", () => {
    const store = storage(); writeActionDraft(store, "key", draft); store.removeItem("key");
    expect(readActionDraft(store, "key")).toBeNull();
  });
  it("rejects corrupt storage and reports unavailable storage", () => {
    const store = storage(); store.setItem("key", "{}"); expect(readActionDraft(store, "key")).toBeNull();
    expect(writeActionDraft({ ...store, setItem: () => { throw new Error("Quota"); } }, "key", draft)).toBe(false);
  });
});
describe("Outlook handoff", () => {
  it("tries Outlook for iPhone, iPad and desktop-mode iPad only", () => {
    expect(isAppleMobile("iPhone", "iPhone", 5)).toBe(true);
    expect(isAppleMobile("iPad", "iPad", 5)).toBe(true);
    expect(isAppleMobile("Macintosh", "MacIntel", 5)).toBe(true);
    expect(isAppleMobile("Macintosh", "MacIntel", 0)).toBe(false);
  });
  it("preserves recipients and full text in app and web URLs", () => {
    const links = outlookComposeLinks(["a+b@example.com", "c@example.com"], "A & B", "Hello\nRésumé?");
    expect(links.app.startsWith("ms-outlook://compose?")).toBe(true);
    expect(new URL(links.web).searchParams.get("to")).toBe("a+b@example.com,c@example.com");
    expect(new URL(links.app).searchParams.get("body")).toBe("Hello\nRésumé?");
    expect(new URL(links.app).searchParams.get("subject")).toBe("A & B");
  });
});
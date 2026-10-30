import { beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ tabs: {} as Record<string, string[][]>, batchWrites: 0, writes: 0, failBatch: false }));
vi.mock("../src/utils/sheets.server", () => ({
  TAB_NAMES: { contacts: "Contacts", targets: "Targets" },
  fetchSheetTab: async (tab: string) => store.tabs[tab],
  ensureColumn: async (tab: string, header: string) => { if (!store.tabs[tab][0].some((h) => h.toLowerCase() === header.toLowerCase())) store.tabs[tab][0].push(header); },
  colLetters: (i: number) => String.fromCharCode(65 + i),
  updateSheetCells: async (tab: string, updates: { range: string; value: string }[]) => {
    if (store.failBatch) throw new Error("interrupted");
    store.batchWrites++;
    for (const u of updates) { const m = /^([A-Z])(\d+)$/.exec(u.range)!; const r = store.tabs[tab][Number(m[2]) - 1]; r[m[1].charCodeAt(0) - 65] = u.value; }
  },
  logNetworkMovements: vi.fn(async () => {}),
  setContactRating: async (email: string, tier: string, urid?: string, expected?: string) => { const h = store.tabs.Contacts[0]; const r = store.tabs.Contacts.slice(1).find((r) => urid ? r[h.indexOf("urid")] === urid : r[h.indexOf("email")] === email); if (!r || r[h.indexOf("relationship status")] !== expected) return { success: false }; r[h.indexOf("relationship status")] = tier; store.writes++; return { success: true }; },
}));
import { changeRelationshipLevels } from "../src/utils/relationship-levels.server";

beforeEach(() => {
  store.tabs = { Contacts: [["urid", "name", "email", "relationship status", "role", "Custom field"], ["stable-id", "Sample Person", "person@example.com", "Cold", "Director", "keep this"]] };
  store.batchWrites = 0; store.writes = 0; store.failBatch = false;
});

describe("move to Prospecting is an in-place flag", () => {
  it("flags the same row Prospecting, keeping its ID and every field, with no copy or delete", async () => {
    const r = await changeRelationshipLevels({ contacts: [{ urid: "stable-id", email: "person@example.com", temperature: "Cold" }], change: "demote" });
    expect(r.moved).toBe(1);
    expect(store.tabs.Contacts.length).toBe(2);
    expect(store.tabs.Contacts[1].slice(0, 6)).toEqual(["stable-id", "Sample Person", "person@example.com", "Prospecting", "Director", "keep this"]);
  });
  it("moves 142 people with a single write", async () => {
    const contacts = Array.from({ length: 142 }, (_, i) => ({ urid: `id-${i}`, email: `p${i}@example.com`, temperature: "Warm" as const, destination: "Prospecting" as const }));
    store.tabs.Contacts = [store.tabs.Contacts[0], ...contacts.map((c) => [c.urid, "Person", c.email, "Warm"])];
    const r = await changeRelationshipLevels({ contacts, change: "prospecting" as never });
    expect(r.moved).toBe(142);
    expect(store.batchWrites).toBe(1);
  });
  it("does not move a contact whose saved level changed, and still moves the rest", async () => {
    store.tabs.Contacts.push(["blocked", "Blocked", "b@example.com", "Hot"]);
    const r = await changeRelationshipLevels({ contacts: [{ urid: "stable-id", email: "person@example.com", temperature: "Cold" }, { urid: "blocked", email: "b@example.com", temperature: "Warm" }], change: "demote" });
    expect(r.moved).toBe(1); expect(r.skipped).toBe(1);
    expect(r.outcomes[1].reason).toContain("Saved rating is Hot");
    expect(store.tabs.Contacts[2][3]).toBe("Hot");
  });
  it("a repeated request reports already done without writing again", async () => {
    const input = { contacts: [{ urid: "stable-id", email: "person@example.com", temperature: "Cold" as const }], change: "demote" as const };
    await changeRelationshipLevels(input);
    const retry = await changeRelationshipLevels(input);
    expect(retry.alreadyComplete).toBe(1); expect(store.batchWrites).toBe(1);
  });
  it("a failed save leaves the contact unchanged and safe to retry", async () => {
    store.failBatch = true;
    const r = await changeRelationshipLevels({ contacts: [{ urid: "stable-id", email: "person@example.com", temperature: "Cold" }], change: "demote" });
    expect(r.outcomes[0]).toMatchObject({ status: "failed", retryable: true });
    expect(store.tabs.Contacts[1][3]).toBe("Cold");
  });
  it("never repeats a successful promotion on retry", async () => {
    store.tabs.Contacts[1][3] = "Warm";
    const input = { contacts: [{ urid: "stable-id", email: "person@example.com", temperature: "Warm" as const, destination: "Hot" as const }], change: "promote" as const };
    const first = await changeRelationshipLevels(input);
    const retry = await changeRelationshipLevels(input, first.outcomes);
    expect(retry.updated).toBe(1); expect(store.tabs.Contacts[1][3]).toBe("Hot"); expect(store.writes).toBe(1);
  });
});

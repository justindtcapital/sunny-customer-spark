import { beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ tabs: {} as Record<string, string[][]>, deleted: [] as number[] }));
vi.mock("../src/utils/sheets.server", () => ({
  TAB_NAMES: { contacts: "Contacts", targets: "Targets" },
  TARGET_HEADERS: ["URID", "First Name", "Last Name", "Email", "Role", "Company", "Stage", "Prime", "Phone", "Sector"],
  fetchSheetTab: async (tab: string) => store.tabs[tab],
  ensureTab: async (tab: string, headers: string[]) => { store.tabs[tab] ||= [headers]; },
  ensureColumn: async (tab: string, header: string) => { if (!store.tabs[tab][0].includes(header)) store.tabs[tab][0].push(header); },
  appendSheetRows: async (tab: string, rows: string[][]) => store.tabs[tab].push(...rows),
  deleteSheetRows: async (_tab: string, rows: number[]) => { store.deleted.push(...rows); return rows.length; },
  bulkUpdateContacts: vi.fn(async (emails: string[]) => ({ updated: emails.length })),
}));
import { changeRelationshipLevels } from "../src/utils/relationship-levels.server";

beforeEach(() => {
  store.tabs = { Contacts: [["urid", "name", "email", "relationship status", "role", "relationship prime", "industry category", "phone number", "Custom field"], ["stable-id", "Sample Person", "person@example.com", "Cold", "Director", "Falloon", "Technology", "12345", "keep this"]] };
  store.deleted = [];
});
describe("verified Network to Prospecting transfer", () => {
  it("preserves identity and every source field before removing the Network row", async () => {
    expect(await changeRelationshipLevels({ contacts: [{ urid: "stable-id", email: "person@example.com", temperature: "Cold" }], change: "demote" })).toEqual({ updated: 0, moved: 1, skipped: 0 });
    const [headers, target] = store.tabs.Targets;
    const value = (header: string) => target[headers.indexOf(header)];
    expect(value("URID")).toBe("stable-id");
    expect(value("Role")).toBe("Director");
    expect(value("Prime")).toBe("Falloon");
    expect(value("Stage")).toBe("Prospecting");
    expect(JSON.parse(value("Network Profile"))["custom field"]).toBe("keep this");
    expect(store.deleted).toEqual([2]);
  });
  it("does not move or delete a contact whose saved level changed", async () => {
    const result = await changeRelationshipLevels({ contacts: [{ urid: "stable-id", email: "person@example.com", temperature: "Warm" }], change: "demote" });
    expect(result.skipped).toBe(1);
    expect(store.deleted).toEqual([]);
    expect(store.tabs.Targets).toBeUndefined();
  });
  it("does not overwrite an existing unrelated prospect or delete the Network contact", async () => {
    store.tabs.Targets = [["URID", "Email", "Network Profile"], ["different-id", "person@example.com", ""]];
    const result = await changeRelationshipLevels({ contacts: [{ urid: "stable-id", email: "person@example.com", temperature: "Cold" }], change: "demote" });
    expect(result.skipped).toBe(1);
    expect(store.deleted).toEqual([]);
    expect(store.tabs.Targets.length).toBe(2);
  });
});
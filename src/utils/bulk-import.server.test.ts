import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ rows: [] as string[][], appended: [] as string[][], literal: false }));
vi.mock("./sheets.server", () => ({
  TAB_NAMES: { contacts: "Contacts", targets: "Targets" }, TARGET_HEADERS: [],
  fetchSheetTab: vi.fn(async (tab: string) => {
    if (tab !== "Contacts") throw new Error("Unified prospects must not be read twice");
    return [...store.rows, ...store.appended];
  }),
  ensureTab: vi.fn(), ensureColumn: vi.fn(),
  appendSheetRows: vi.fn(async (_tab: string, rows: string[][], literal: boolean) => {
    store.literal = literal;
    // Reproduce Sheets' USER_ENTERED coercion of a + prefixed phone.
    store.appended = rows.map(row => row.map(cell => !literal && /^\+\d+$/.test(cell) ? cell.slice(1) : cell));
  }),
  appendTargetRows: vi.fn(), appendInteractionRows: vi.fn(), appendPortcoIntroRows: vi.fn(), ensureEventAttendanceBatch: vi.fn(),
}));
import { importContactRows } from "./bulk-import.server";

const headers = ["Name", "Email", "Company", "Role", "Phone Number", "Relationship Status", "URID", "Source", "Date Added", "Follow Up Flag", "LinkedIn", "Headline", "Employment History", "Prospecting Stage"];
const person = { name: "Test person", email: "bulk-recovery@example.com", company: "Test company", role: "Director", phone: "+14752302596", location: "", prime: "", sector: "" };
const journal = () => ({ id: "test-import", prior: [], step: vi.fn(), checkpoint: vi.fn(async () => {}) });

describe("contact import persistence", () => {
  beforeEach(() => { store.rows = [headers]; store.appended = []; store.literal = false; vi.clearAllMocks(); });
  it("preserves +14752302596 literally and verifies the contact as saved", async () => {
    const result = await importContactRows({ contacts: [person] }, journal());
    expect(store.literal).toBe(true);
    expect(store.appended[0]?.[4]).toBe("+14752302596");
    expect(result.added).toBe(1);
    expect(result.outcomes[0]?.status).toBe("changed");
  });
  it("recognizes one existing prospect instead of inventing multiple matches", async () => {
    store.rows.push(headers.map(h => ({ Name: "Jide Adeoye", Email: "jadeoye@goeasy.com", Company: "goeasy Ltd.", URID: "stable-jide", "Relationship Status": "Prospecting" }[h] || "")));
    const result = await importContactRows({ contacts: [{ ...person, name: "Jide", email: "jadeoye@goeasy.com" }] }, journal());
    expect(result.added).toBe(0);
    expect(result.outcomes[0]?.reason).toBe("Already in Prospecting; review the existing person rather than create a second record.");
    expect(store.appended).toHaveLength(0);
  });
  it("a second identical import writes no second contact", async () => {
    await importContactRows({ contacts: [person] }, journal());
    store.rows.push(...store.appended); store.appended = [];
    const result = await importContactRows({ contacts: [person] }, journal());
    expect(result.duplicates).toBe(1);
    expect(result.added).toBe(0);
    expect(store.appended).toHaveLength(0);
  });
});
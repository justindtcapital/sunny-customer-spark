import { beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ tabs: {} as Record<string, string[][]>, deleted: [] as number[], writes: 0, failDelete: false }));
vi.mock("../src/utils/sheets.server", () => ({
  TAB_NAMES: { contacts: "Contacts", targets: "Targets" },
  TARGET_HEADERS: ["URID", "First Name", "Last Name", "Email", "Role", "Company", "Stage", "Prime", "Phone", "Sector"],
  fetchSheetTab: async (tab: string) => store.tabs[tab],
  ensureTab: async (tab: string, headers: string[]) => { store.tabs[tab] ||= [headers]; },
  ensureColumn: async (tab: string, header: string) => { if (!store.tabs[tab][0].includes(header)) store.tabs[tab][0].push(header); },
  appendSheetRows: async (tab: string, rows: string[][]) => store.tabs[tab].push(...rows),
  deleteSheetRows: async (tab: string, rows: number[]) => { if(store.failDelete) throw new Error("interrupted"); store.deleted.push(...rows);for(const n of [...rows].sort((a,b)=>b-a)) store.tabs[tab].splice(n-1,1);return rows.length; },
  logNetworkMovements: vi.fn(async () => {}),
  setContactRating: async (email:string,tier:string,urid?:string,expected?:string) => { const h=store.tabs.Contacts[0];const r=store.tabs.Contacts.slice(1).find(r=>urid?r[h.indexOf("urid")]===urid:r[h.indexOf("email")]===email);if(!r||r[h.indexOf("relationship status")]!==expected)return {success:false};r[h.indexOf("relationship status")]=tier;store.writes++;return {success:true}; },
  bulkUpdateContacts: vi.fn(async (emails: string[]) => ({ updated: emails.length })),
}));
import { changeRelationshipLevels } from "../src/utils/relationship-levels.server";

beforeEach(() => {
  store.tabs = { Contacts: [["urid", "name", "email", "relationship status", "role", "relationship prime", "industry category", "phone number", "Custom field"], ["stable-id", "Sample Person", "person@example.com", "Cold", "Director", "Falloon", "Technology", "12345", "keep this"]] };
  store.deleted = [];store.writes=0;store.failDelete=false;
});
describe("verified Network to Prospecting transfer", () => {
  it("preserves identity and every source field before removing the Network row", async () => {
    expect(await changeRelationshipLevels({ contacts: [{ urid: "stable-id", email: "person@example.com", temperature: "Cold" }], change: "demote" })).toMatchObject({ updated: 0, moved: 1, skipped: 0 });
    const [headers, target] = store.tabs.Targets;
    const value = (header: string) => target[headers.findIndex(h=>h.toLowerCase()===header.toLowerCase())];
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
describe("replay and mixed batches",()=>{
 it("treats completed move as success after a fresh request",async()=>{
  const input={contacts:[{urid:"stable-id",email:"person@example.com",temperature:"Cold" as const}],change:"demote" as const};
  const first=await changeRelationshipLevels(input);const retry=await changeRelationshipLevels(input);
  expect(first.moved).toBe(1);expect(retry.alreadyComplete).toBe(1);expect(store.tabs.Targets.length).toBe(2);expect(store.deleted).toEqual([2]);
 });
 it("never repeats a successful relative promotion on retry",async()=>{
  store.tabs.Contacts[1][3]="Warm";
  const input={contacts:[{urid:"stable-id",email:"person@example.com",temperature:"Warm" as const,destination:"Hot" as const}],change:"promote" as const};
  const first=await changeRelationshipLevels(input);const retry=await changeRelationshipLevels(input,first.outcomes);
  expect(retry.updated).toBe(1);expect(store.tabs.Contacts[1][3]).toBe("Hot");expect(store.writes).toBe(1);
 });
 it("processes eligible rows despite a stale neighbor and reports exact reasons",async()=>{
  store.tabs.Contacts.push(["blocked","Blocked","b@example.com","Hot"]);
  const r=await changeRelationshipLevels({contacts:[{urid:"stable-id",email:"person@example.com",temperature:"Cold"},{urid:"blocked",email:"b@example.com",temperature:"Warm"}],change:"demote"});
  expect(r.moved).toBe(1);expect(r.skipped).toBe(1);expect(r.outcomes[1].reason).toContain("Saved rating is Hot");expect(store.tabs.Contacts.some(r=>r[0]==="blocked")).toBe(true);
 });
 it("retains source and reports uncertainty after an interrupted delete",async()=>{
  store.failDelete=true;
  const r=await changeRelationshipLevels({contacts:[{urid:"stable-id",email:"person@example.com",temperature:"Cold"}],change:"demote"});
  expect(r.outcomes[0].status).toBe("uncertain");expect(store.tabs.Contacts.length).toBe(2);expect(store.tabs.Targets.length).toBe(2);
 });
 it("dedupes URID and email selectors resolving to the same contact",async()=>{
  store.tabs.Contacts[1][3]="Warm";
  const r=await changeRelationshipLevels({contacts:[{urid:"stable-id",email:"person@example.com",temperature:"Warm"},{email:"person@example.com",temperature:"Warm"}],change:"promote"});
  expect(store.writes).toBe(1);expect(r.duplicates).toBe(1);
 });
});

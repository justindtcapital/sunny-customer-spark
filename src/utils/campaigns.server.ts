// Campaign Builder storage: two Google Sheets tabs.
//  - "Campaigns": one row per campaign (unique name).
//  - "Campaign Members": one row per (campaign, person). Append-only membership,
//    so a person can belong to any number of campaigns without overwriting.
import {
  appendSheetRows,
  deleteSheetRows,
  TAB_NAMES,
  colLetters,
  ensureColumn,
  ensureTab,
  fetchSheetTab,
  updateSheetCells,
} from "./sheets.server";
import { memberRowsFor, type CampaignMember, type CampaignRecord, type CampaignStatus, type MemberKind } from "@/lib/campaigns";

export const CAMPAIGNS_TAB = "Campaigns";
export const MEMBERS_TAB = "Campaign Members";

const CAMPAIGN_HEADERS = [
  "Campaign ID",
  "Name",
  "Purpose",
  "Events",
  "PortCos",
  "Owner",
  "Channel",
  "Template Subject",
  "Template Body",
  "Status",
  "Created",
  "Updated",
  "Created By",
];

const MEMBER_HEADERS = [
  "Campaign ID",
  "Person Key",
  "Kind",
  "Name",
  "Email",
  "Title",
  "Company",
  "LinkedIn",
  "Added",
  "Subject",
  "Body",
  "Sent Channel",
  "Sent Date",
  "Follow Up Owner",
  "Follow Up Due",
];

// Field ↔ header for each tab (headers matched case-insensitively).
const CAMPAIGN_FIELDS: Record<string, keyof CampaignRecord> = {
  "campaign id": "id",
  name: "name",
  purpose: "purpose",
  events: "events",
  portcos: "portcos",
  owner: "owner",
  channel: "channel",
  "template subject": "templateSubject",
  "template body": "templateBody",
  status: "status",
  created: "created",
  updated: "updated",
  "created by": "createdBy",
};
const MEMBER_FIELDS: Record<string, keyof CampaignMember> = {
  "campaign id": "campaignId",
  "person key": "personKey",
  kind: "kind",
  name: "name",
  email: "email",
  title: "title",
  company: "company",
  linkedin: "linkedin",
  added: "added",
  subject: "subject",
  body: "body",
  "sent channel": "sentChannel",
  "sent date": "sentDate",
  "follow up owner": "followUpOwner",
  "follow up due": "followUpDue",
};

const splitList = (s: string) =>
  (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

async function ensureTabs(): Promise<void> {
  await ensureTab(CAMPAIGNS_TAB, CAMPAIGN_HEADERS);
  await ensureTab(MEMBERS_TAB, MEMBER_HEADERS);
}

async function readTab(tab: string): Promise<{ headers: string[]; rows: string[][] }> {
  const rows = await fetchSheetTab(tab).catch(() => [] as string[][]);
  return { headers: (rows[0] || []).map((h) => h.trim().toLowerCase()), rows: rows.slice(1) };
}

function rowToCampaign(headers: string[], r: string[]): CampaignRecord {
  const o: Record<string, string> = {};
  headers.forEach((h, i) => {
    const f = CAMPAIGN_FIELDS[h];
    if (f) o[f] = (r[i] || "").trim();
  });
  return {
    id: o.id || "",
    name: o.name || "",
    purpose: o.purpose || "",
    events: splitList(o.events || ""),
    portcos: splitList(o.portcos || ""),
    owner: o.owner || "",
    channel: (o.channel as CampaignRecord["channel"]) || "email",
    templateSubject: o.templateSubject || "",
    templateBody: o.templateBody || "",
    status: (o.status as CampaignStatus) || "draft",
    created: o.created || "",
    updated: o.updated || "",
    createdBy: o.createdBy || "",
  };
}

function rowToMember(headers: string[], r: string[]): CampaignMember {
  const o: Record<string, string> = {};
  headers.forEach((h, i) => {
    const f = MEMBER_FIELDS[h];
    if (f) o[f] = (r[i] || "").trim();
  });
  return {
    campaignId: o.campaignId || "",
    personKey: (o.personKey || "").toLowerCase(),
    kind: (o.kind as MemberKind) || "prospect",
    name: o.name || "",
    email: o.email || "",
    title: o.title || "",
    company: o.company || "",
    linkedin: o.linkedin || "",
    added: o.added || "",
    subject: o.subject || "",
    body: o.body || "",
    sentChannel: o.sentChannel || "",
    sentDate: o.sentDate || "",
    followUpOwner: o.followUpOwner || "",
    followUpDue: o.followUpDue || "",
  };
}

export async function listCampaigns(): Promise<CampaignRecord[]> {
  await ensureTabs();
  const c = await readTab(CAMPAIGNS_TAB);
  const m = await readTab(MEMBERS_TAB);
  const counts = new Map<string, number>();
  const idIdx = m.headers.indexOf("campaign id");
  for (const r of m.rows) {
    const id = (r[idIdx] || "").trim();
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return c.rows
    .map((r) => rowToCampaign(c.headers, r))
    .filter((x) => x.id && x.name)
    .map((x) => ({ ...x, memberCount: counts.get(x.id) || 0 }))
    .sort((a, b) => (b.created || "").localeCompare(a.created || ""));
}

export async function listMembers(campaignId?: string): Promise<CampaignMember[]> {
  await ensureTabs();
  const m = await readTab(MEMBERS_TAB);
  return m.rows
    .map((r) => rowToMember(m.headers, r))
    .filter((x) => x.campaignId && (!campaignId || x.campaignId === campaignId));
}

function toRow(headers: string[], values: Record<string, string>): string[] {
  return headers.map((h) => values[h] ?? "");
}

function campaignValues(c: CampaignRecord): Record<string, string> {
  return {
    "campaign id": c.id,
    name: c.name,
    purpose: c.purpose,
    events: c.events.join(", "),
    portcos: c.portcos.join(", "),
    owner: c.owner,
    channel: c.channel,
    "template subject": c.templateSubject,
    "template body": c.templateBody,
    status: c.status,
    created: c.created,
    updated: c.updated,
    "created by": c.createdBy,
  };
}

/** Create (unique name) or update a campaign. Only provided fields change. */
export async function saveCampaign(
  input: Partial<CampaignRecord> & { name?: string },
  by: string,
): Promise<{ ok: true; campaign: CampaignRecord } | { ok: false; error: string }> {
  await ensureTabs();
  const now = new Date().toISOString();
  const { headers, rows } = await readTab(CAMPAIGNS_TAB);
  const all = rows.map((r) => rowToCampaign(headers, r));
  const name = (input.name || "").trim();

  if (!input.id) {
    if (!name) return { ok: false, error: "Campaign name is required." };
    if (all.some((c) => c.name.trim().toLowerCase() === name.toLowerCase()))
      return { ok: false, error: `A campaign named "${name}" already exists. Pick it from the list instead.` };
    const c: CampaignRecord = {
      id: crypto.randomUUID(),
      name,
      purpose: input.purpose || "",
      events: input.events || [],
      portcos: input.portcos || [],
      owner: input.owner || "",
      channel: input.channel || "email",
      templateSubject: input.templateSubject || "",
      templateBody: input.templateBody || "",
      status: input.status || "draft",
      created: now,
      updated: now,
      createdBy: by,
    };
    await appendSheetRows(CAMPAIGNS_TAB, [toRow(headers, campaignValues(c))]);
    return { ok: true, campaign: c };
  }

  const idx = all.findIndex((c) => c.id === input.id);
  if (idx === -1) return { ok: false, error: "Campaign not found." };
  if (name && all.some((c, i) => i !== idx && c.name.trim().toLowerCase() === name.toLowerCase()))
    return { ok: false, error: `A campaign named "${name}" already exists.` };
  const merged: CampaignRecord = {
    ...all[idx],
    ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
    name: name || all[idx].name,
    updated: now,
  } as CampaignRecord;
  const vals = campaignValues(merged);
  const prev = campaignValues(all[idx]);
  const updates = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h in vals && vals[h] !== prev[h])
    .map(({ h, i }) => ({ range: `${colLetters(i)}${idx + 2}`, value: vals[h] }));
  if (updates.length) await updateSheetCells(CAMPAIGNS_TAB, updates);
  return { ok: true, campaign: merged };
}

export async function appendMembers(members: CampaignMember[]): Promise<void> {
  if (!members.length) return;
  await ensureTabs();
  const { headers } = await readTab(MEMBERS_TAB);
  const built = members.map((m) => {
    const v: Record<string, string> = {};
    for (const [h, f] of Object.entries(MEMBER_FIELDS)) v[h] = String(m[f] ?? "");
    return toRow(headers, v);
  });
  await appendSheetRows(MEMBERS_TAB, built);
}

/** Update specific member fields for (campaignId, personKey) rows. */
export async function updateMembers(
  campaignId: string,
  patches: Array<{ personKey: string; fields: Partial<CampaignMember> }>,
): Promise<number> {
  if (!patches.length) return 0;
  await ensureTabs();
  for (const h of ["Subject", "Body", "Sent Channel", "Sent Date", "Follow Up Owner", "Follow Up Due"])
    await ensureColumn(MEMBERS_TAB, h);
  const { headers, rows } = await readTab(MEMBERS_TAB);
  const idIdx = headers.indexOf("campaign id");
  const keyIdx = headers.indexOf("person key");
  const byKey = new Map(patches.map((p) => [p.personKey.toLowerCase(), p.fields]));
  const updates: { range: string; value: string }[] = [];
  rows.forEach((r, i) => {
    if ((r[idIdx] || "").trim() !== campaignId) return;
    const f = byKey.get((r[keyIdx] || "").trim().toLowerCase());
    if (!f) return;
    for (const [h, field] of Object.entries(MEMBER_FIELDS)) {
      if (!(field in f)) continue;
      const col = headers.indexOf(h);
      if (col === -1) continue;
      updates.push({ range: `${colLetters(col)}${i + 2}`, value: String(f[field] ?? "") });
    }
  });
  if (updates.length) await updateSheetCells(MEMBERS_TAB, updates);
  return updates.length;
}

/** Every campaign a person belongs to (by person key or email). */
export async function campaignsForPerson(
  keys: string[],
): Promise<Array<{ campaign: CampaignRecord; member: CampaignMember }>> {
  const want = new Set(keys.map((k) => k.trim().toLowerCase()).filter(Boolean));
  if (!want.size) return [];
  const [camps, members] = await Promise.all([listCampaigns(), listMembers()]);
  const byId = new Map(camps.map((c) => [c.id, c]));
  return members
    .filter((m) => want.has(m.personKey) || (m.email && want.has(m.email.toLowerCase())))
    .map((m) => ({ campaign: byId.get(m.campaignId)!, member: m }))
    .filter((x) => x.campaign);
}

/** Delete a campaign, all its membership rows, and matching legacy Targets
 *  campaign labels. People records are kept unless `removeNewProspects`, which
 *  only removes prospects this campaign created that have no other campaigns
 *  and were never contacted. */
export async function deleteCampaign(
  id: string,
  removeNewProspects: boolean,
): Promise<{ name: string; members: number; labelsCleared: number; prospectsRemoved: number; followUps: number }> {
  await ensureTabs();
  const c = await readTab(CAMPAIGNS_TAB);
  const cIdIdx = c.headers.indexOf("campaign id");
  const cRowIdx = c.rows.findIndex((r) => (r[cIdIdx] || "").trim() === id);
  if (cRowIdx === -1) throw new Error("Campaign not found.");
  const camp = rowToCampaign(c.headers, c.rows[cRowIdx]);
  const nameLc = camp.name.trim().toLowerCase();

  const m = await readTab(MEMBERS_TAB);
  const mIdIdx = m.headers.indexOf("campaign id");
  const all = m.rows.map((r) => rowToMember(m.headers, r));
  const mine = all.filter((x) => x.campaignId === id);
  const otherKeys = new Set(all.filter((x) => x.campaignId !== id).map((x) => x.personKey));
  const followUps = mine.filter((x) => x.followUpDue).length;

  // Legacy Targets "Campaign" column.
  const t = await fetchSheetTab(TAB_NAMES.targets).catch(() => [] as string[][]);
  const th = (t[0] || []).map((h) => (h || "").trim().toLowerCase());
  const tCamp = th.indexOf("campaign");
  const tEmail = th.indexOf("email");
  const tName = th.indexOf("name");
  const tCo = th.indexOf("company");
  const tSource = th.indexOf("source");
  const removable = new Set(
    removeNewProspects
      ? mine.filter((x) => x.kind === "prospect" && !otherKeys.has(x.personKey) && !x.sentDate).map((x) => x.personKey)
      : [],
  );
  const toDelete: number[] = [];
  const clears: { range: string; value: string }[] = [];
  if (tCamp !== -1) {
    for (let i = 1; i < t.length; i++) {
      const r = t[i];
      if ((r[tCamp] || "").trim().toLowerCase() !== nameLc) continue;
      const key = (
        (tEmail >= 0 && (r[tEmail] || "").trim()) ||
        `${tName >= 0 ? (r[tName] || "").trim() : ""}|${tCo >= 0 ? (r[tCo] || "").trim() : ""}`
      ).toLowerCase();
      const src = tSource >= 0 ? (r[tSource] || "").toLowerCase() : "";
      const isNew = /sumble|apollo|csv/.test(src);
      if (removable.size && isNew && [...removable].some((k) => k === key || k.includes(key))) toDelete.push(i + 1);
      else clears.push({ range: `${colLetters(tCamp)}${i + 1}`, value: "" });
    }
  }
  if (clears.length) await updateSheetCells(TAB_NAMES.targets, clears);
  if (toDelete.length) await deleteSheetRows(TAB_NAMES.targets, toDelete);

  const memberRows = memberRowsFor(m.rows.map((r) => r[mIdIdx] || ""), id);
  if (memberRows.length) await deleteSheetRows(MEMBERS_TAB, memberRows);
  await deleteSheetRows(CAMPAIGNS_TAB, [cRowIdx + 2]);
  return {
    name: camp.name,
    members: memberRows.length,
    labelsCleared: clears.length,
    prospectsRemoved: toDelete.length,
    followUps,
  };
}

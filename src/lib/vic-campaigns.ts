// Pure shaping of campaigns and campaign member lists for V.I.C. (read-only).
import type { CampaignMember, CampaignRecord } from "@/lib/campaigns";
import {
  CAMPAIGN_TYPE_LABEL,
  RESULT_LABEL,
  campaignTypeOf,
  latestResults,
  normalizeResult,
  type ResultRow,
} from "@/lib/campaign-results";

export type VicCampaignResultFilter = "All" | "Interested" | "Confirmed" | "Declined" | "No reply" | "Follow up" | "Unmarked";
export type VicCampaignSentFilter = "All" | "Sent" | "Not sent";

export interface VicCampaignMemberRow {
  name: string;
  title: string;
  company: string;
  email: string;
  kind: string;
  linkedin: string;
  sentDate: string;
  sentChannel: string;
  result: string;
  followUpOwner: string;
  followUpDue: string;
  added: string;
}

export function vicCampaignSummary(c: CampaignRecord) {
  return {
    id: c.id,
    name: c.name,
    type: CAMPAIGN_TYPE_LABEL[campaignTypeOf(c.purpose)],
    purpose: c.purpose,
    status: c.status,
    owner: c.owner,
    channel: c.channel,
    events: c.events,
    portcos: c.portcos,
    memberCount: c.memberCount ?? 0,
    created: c.created,
    updated: c.updated,
  };
}

export function vicCampaignDetails(
  campaign: CampaignRecord,
  members: CampaignMember[],
  results: ResultRow[],
  opts: { result?: VicCampaignResultFilter; sent?: VicCampaignSentFilter; offset?: number; limit?: number } = {},
) {
  const latest = latestResults(results);
  const resultCounts: Record<string, number> = {
    Interested: 0,
    Confirmed: 0,
    Declined: 0,
    "No reply": 0,
    Unmarked: 0,
  };
  let sentCount = 0;
  let unsentCount = 0;

  const shaped: VicCampaignMemberRow[] = members.map((m) => {
    const r = latest.get(`${campaign.id}|${m.personKey.toLowerCase()}`);
    const norm = normalizeResult(r?.result || "");
    const label = norm ? RESULT_LABEL[norm] : "Unmarked";
    resultCounts[label] = (resultCounts[label] || 0) + 1;
    if (m.sentDate) sentCount++;
    else unsentCount++;
    return {
      name: m.name,
      title: m.title,
      company: m.company,
      email: m.email,
      kind: m.kind === "network" ? "Network" : "Prospect",
      linkedin: m.linkedin,
      sentDate: m.sentDate,
      sentChannel: m.sentChannel,
      result: label,
      followUpOwner: r?.followUpOwner || m.followUpOwner || "",
      followUpDue: r?.followUpDue || m.followUpDue || "",
      added: m.added,
    };
  });

  const wantResult = opts.result || "All";
  const wantSent = opts.sent || "All";
  const filtered = shaped.filter((m) => {
    if (wantResult !== "All" && m.result !== wantResult) return false;
    if (wantSent === "Sent" && !m.sentDate) return false;
    if (wantSent === "Not sent" && m.sentDate) return false;
    return true;
  });

  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.min(500, Math.max(1, opts.limit ?? 300));
  const page = filtered.slice(offset, offset + limit);

  return {
    campaign: {
      ...vicCampaignSummary({ ...campaign, memberCount: members.length }),
      templateSubject: campaign.templateSubject,
      templateBody: (campaign.templateBody || "").slice(0, 3000),
      createdBy: campaign.createdBy,
    },
    counts: { total: members.length, sent: sentCount, unsent: unsentCount, results: resultCounts },
    matchedPeople: filtered.length,
    offset,
    people: page,
    truncated: offset + page.length < filtered.length,
  };
}
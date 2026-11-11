import { createServerFn } from "@tanstack/react-start";
import { requireTeamAuth } from "./team-auth";
import type { CampaignRecord } from "@/lib/campaigns";
import type { Movement } from "@/lib/network-pyramid";

export interface NetworkDashboardData {
  movements: Movement[];
  emails: { email: string; ts: string }[];
  campaigns: CampaignRecord[];
  sends: { email: string; date: string; campaignId: string }[];
  error: string | null;
}

/** Read-only inputs for the Network dashboard (rating log, sent emails, campaigns and sends). */
export const fetchNetworkDashboard = createServerFn({ method: "GET" })
  .middleware([requireTeamAuth])
  .handler(async (): Promise<NetworkDashboardData> => {
    const { buildNetworkPyramidData, buildEmailActivity } = await import("./sheets.server");
    const { listCampaigns, listMembers } = await import("./campaigns.server");
    const problems: string[] = [];
    const [pyramid, emails, campaigns, members] = await Promise.all([
      buildNetworkPyramidData().catch((e) => { console.error("network dashboard: rating history", e); problems.push("level changes"); return { movements: [] as Movement[] }; }),
      buildEmailActivity().catch((e) => { console.error("network dashboard: emails", e); problems.push("sent emails"); return []; }),
      listCampaigns().catch((e) => { console.error("network dashboard: campaigns", e); problems.push("campaigns"); return [] as CampaignRecord[]; }),
      listMembers().catch((e) => { console.error("network dashboard: campaign members", e); problems.push("campaign sends"); return []; }),
    ]);
    return {
      movements: pyramid.movements,
      emails: emails.map((e) => ({ email: e.contactEmail, ts: e.timestamp })).filter((e) => e.email && e.ts),
      campaigns,
      sends: members.filter((m) => m.sentDate && m.email).map((m) => ({ email: m.email, date: m.sentDate, campaignId: m.campaignId })),
      error: problems.length ? `Couldn't load ${problems.join(", ")} right now.` : null,
    };
  });

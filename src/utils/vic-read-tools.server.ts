// Extended read-only Venture Pulse ecosystem tools for V.I.C. Server-only.
import { tool } from "ai";
import { z } from "zod";
import type { Touch } from "@/lib/network-dashboard";

const q = (s: string | undefined) => (s || "").trim().toLowerCase();
const hit = (needle: string, ...hay: (string | undefined)[]) => {
  const words = q(needle).split(/\s+/).filter(Boolean);
  const text = q(hay.filter(Boolean).join(" "));
  return words.every((w) => text.includes(w));
};

const BRIEF_OWNER = "chris.falloon@dell.com";

export function vicReadTools(opts: { teamEmail: string }) {
  return {
    filterNetwork: tool({
      description: "Read-only: filter Network and Prospecting people by tier (Council/Hot/Warm/Cold/Prospect), contact type (Network/PortCo/Dell/Partner), primary domain (Security/AI & Data/Logistics/Other), market (Boston/New York/San Francisco/Austin/Europe/etc.), owner ('me' or teammate name), company, or text query. Supports offset paging.",
      inputSchema: z.object({
        query: z.string().default(""),
        tier: z.string().default(""),
        kind: z.string().default(""),
        domain: z.string().default(""),
        market: z.string().default(""),
        owner: z.string().default(""),
        company: z.string().default(""),
        includeProspects: z.boolean().optional(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(200).default(100),
      }),
      execute: async (input) => {
        const { buildContacts, buildTargets, buildPortfolioCompanies } = await import("./sheets.server");
        const { listPartners } = await import("./partners.server");
        const { classifyContacts } = await import("@/lib/contact-kind");
        const { filterNetworkContacts, unifyForVic } = await import("@/lib/vic-contacts");
        const [rawContacts, prospects, portcos, partners] = await Promise.all([
          buildContacts(),
          buildTargets().catch(() => []),
          buildPortfolioCompanies().catch(() => []),
          listPartners().catch(() => []),
        ]);
        const classified = classifyContacts(rawContacts, { portcoNames: portcos.map((p) => p.name), partners });
        return filterNetworkContacts(unifyForVic(classified, prospects), { ...input, teamEmail: opts.teamEmail });
      },
    }),
    getContactDetails: tool({
      description: "Read-only: full CRM dossier for one person (by urid, email, or exact full name) — title, company, contact type, rating, Relationship Prime, LinkedIn, location/market, interests, interaction notes trail, sent emails, prior PortCo introductions, events attended/invited, and every campaign they belong to with responses.",
      inputSchema: z.object({ urid: z.string().default(""), email: z.string().default(""), name: z.string().default("") }),
      execute: async ({ urid, email, name }) => {
        const { buildContacts, buildTargets, buildPortfolioCompanies, buildEmailActivity } = await import("./sheets.server");
        const { listPartners } = await import("./partners.server");
        const { campaignsForPerson } = await import("./campaigns.server");
        const { classifyContacts } = await import("@/lib/contact-kind");
        const { normalizeResult, RESULT_LABEL } = await import("@/lib/campaign-results");
        const { vicContactDossier } = await import("@/lib/vic-contacts");
        const [rawContacts, prospects, portcos, partners, emailLog] = await Promise.all([
          buildContacts(),
          buildTargets().catch(() => []),
          buildPortfolioCompanies().catch(() => []),
          listPartners().catch(() => []),
          buildEmailActivity().catch(() => []),
        ]);
        const contacts = classifyContacts(rawContacts, { portcoNames: portcos.map((p) => p.name), partners });
        const u = q(urid), em = q(email), nm = q(name);
        const matchContact = contacts.find((c) => (u && q(c.urid || c.id) === u) || (em && c.email.toLowerCase().split(/[;,]/).some((x) => x.trim() === em)) || (nm && q(c.name) === nm));
        const matchProspect = matchContact ? undefined : prospects.find((p) => (u && q(p.urid || p.id) === u) || (em && p.email.toLowerCase().split(/[;,]/).some((x) => x.trim() === em)) || (nm && q(p.name) === nm));
        if (!matchContact && !matchProspect) return { error: "Person not found — look them up with searchNetwork or filterNetwork first." };
        const person = matchContact || matchProspect!;
        const emails = (person.email || "").split(/[;,]/).map((e) => e.trim().toLowerCase()).filter(Boolean);
        const keys = [...emails, `${q(person.name)}|${q(person.company)}`].filter(Boolean);
        const camps = await campaignsForPerson(keys).catch(() => []);
        const emailSet = new Set(emails);
        const recentEmails = emailLog
          .filter((e) => emailSet.has(q(e.contactEmail)))
          .map((e) => ({ date: e.timestamp, subject: e.subject, owner: e.type || "" }));
        return vicContactDossier({
          contact: matchContact,
          prospect: matchProspect,
          campaigns: camps.map((x) => {
            const norm = normalizeResult(x.result?.result || "");
            return { id: x.campaign.id, name: x.campaign.name, status: x.campaign.status, sentDate: x.member.sentDate, result: norm ? RESULT_LABEL[norm] : "Unmarked" };
          }),
          emails: recentEmails,
        });
      },
    }),
    getNetworkPyramid: tool({
      description: "Read-only: Network Pyramid summary — counts by tier (Council/Hot/Warm/Cold/Prospect), contact type (Network/PortCo/Dell/Partner), primary domain, geographic market, per-tier targets, and tier movement KPIs over 30d/6m/12m.",
      inputSchema: z.object({}),
      execute: async () => {
        const { buildContacts, buildTargets, buildPortfolioCompanies, buildNetworkPyramidData } = await import("./sheets.server");
        const { listPartners } = await import("./partners.server");
        const { classifyContacts } = await import("@/lib/contact-kind");
        const { unifyForVic, vicNetworkSummary } = await import("@/lib/vic-contacts");
        const [rawContacts, prospects, portcos, partners, pyr] = await Promise.all([
          buildContacts(),
          buildTargets().catch(() => []),
          buildPortfolioCompanies().catch(() => []),
          listPartners().catch(() => []),
          buildNetworkPyramidData().catch(() => ({ movements: [], targets: {}, prospects: [] })),
        ]);
        const classified = classifyContacts(rawContacts, { portcoNames: portcos.map((p) => p.name), partners });
        return vicNetworkSummary({ rows: unifyForVic(classified, prospects), targets: pyr.targets, movements: pyr.movements });
      },
    }),
    findDuplicateContacts: tool({
      description: "Read-only: list suggested duplicate contact groups across Network and Prospecting (with URIDs, names, emails, companies, statuses) so the user can review or merge them with proposeMergeContacts.",
      inputSchema: z.object({ query: z.string().default(""), limit: z.number().int().min(1).max(100).default(30) }),
      execute: async ({ query, limit }) => {
        const { suggestDuplicates } = await import("./contact-merge.server");
        const res = await suggestDuplicates();
        const groups = query.trim()
          ? res.groups.filter((g) => g.people.some((p) => hit(query, p.name, p.email, p.company)))
          : res.groups;
        return { total: groups.length, truncated: groups.length > limit, groups: groups.slice(0, limit) };
      },
    }),
    getPortcoProfile: tool({
      description: "Read-only: full dossier for one portfolio company — summary, all PortCo Profile fields (Lead Investor, stage, DTC Investment/Ownership, Sell With Dell / Sell-In status, SageTap, etc.), active & completed workstreams, Dell stakeholders/notes, archived fields, PortCo contacts, linked events, and linked campaigns.",
      inputSchema: z.object({ company: z.string().min(1) }),
      execute: async ({ company }) => {
        const { buildPortfolioCompanies, buildContacts } = await import("./sheets.server");
        const { readProfiles, readWorkstreams, readWorkstreamArchives } = await import("./portco-store.server");
        const { readPlannerEvents } = await import("./event-planner.server");
        const { listCampaigns } = await import("./campaigns.server");
        const { portCoKey } = await import("@/lib/portco-canonical");
        const { vicPortcoProfile } = await import("@/lib/vic-portfolio");
        const [companies, profiles, workstreams, archives, contacts, events, campaigns] = await Promise.all([
          buildPortfolioCompanies(),
          readProfiles().catch(() => []),
          readWorkstreams().catch(() => []),
          readWorkstreamArchives().catch(() => ({})),
          buildContacts().catch(() => []),
          readPlannerEvents().catch(() => []),
          listCampaigns().catch(() => []),
        ]);
        const want = portCoKey(company);
        const found = companies.find((c) => portCoKey(c.name) === want) || companies.find((c) => q(c.name).includes(q(company)));
        if (!found) return { error: `No portfolio company matching "${company}" — check searchPortcos.` };
        const profile = profiles.find((p) => (found.urid && p.urid === found.urid) || portCoKey(p.company) === portCoKey(found.name));
        return vicPortcoProfile({ company: found, profile, workstreams, contacts, events, campaigns, workstreamArchives: archives });
      },
    }),
    getDellLeverage: tool({
      description: "Read-only: Dell Leverage board — company stage board (Interested → Working to Engage → Engaged / Stalled → Engaged / Progressing → Existing), Sell-In & Sell-With counts, Dell Business Unit breakdown, linked Dell stakeholders, recent Dell status movements, and filtered Dell workstreams.",
      inputSchema: z.object({
        motion: z.enum(["Both", "Sell-In", "Sell-With"]).default("Both"),
        bu: z.string().default(""),
        stage: z.string().default(""),
        domain: z.string().default(""),
        company: z.string().default(""),
        missingStakeholders: z.boolean().default(false),
        includeCompleted: z.boolean().default(true),
        movementDays: z.number().int().min(1).max(365).default(30),
      }),
      execute: async ({ motion, bu, stage, domain, company, missingStakeholders, includeCompleted, movementDays }) => {
        const { readWorkstreams, CHANGE_LOG_TAB } = await import("./portco-store.server");
        const { buildContacts, buildPortfolioCompanies, fetchSheetTabIfExists } = await import("./sheets.server");
        const { statusChangesFromLog } = await import("@/lib/dell-leverage");
        const { vicDellLeverageView } = await import("@/lib/vic-portfolio");
        const [workstreams, contacts, companies, log] = await Promise.all([
          readWorkstreams(),
          buildContacts().catch(() => null),
          buildPortfolioCompanies().catch(() => []),
          fetchSheetTabIfExists(CHANGE_LOG_TAB).catch(() => null),
        ]);
        return vicDellLeverageView({
          workstreams,
          contacts,
          companies,
          changes: log ? statusChangesFromLog(log) : [],
          filter: {
            motion,
            bu: bu.trim() || null,
            stage: (stage.trim() || null) as never,
            domain: domain.trim() || null,
            company: company.trim() || null,
            missingStakeholders,
            includeCompleted,
          },
          days: movementDays,
        });
      },
    }),
    getPartnerDetails: tool({
      description: "Read-only: full detail for one Partner (pass name from searchPartners) — profile, domain aliases, all contacts linked to that partner, and recent partner activity.",
      inputSchema: z.object({ name: z.string().min(1) }),
      execute: async ({ name }) => {
        const { partnerDetail } = await import("./partners.server");
        const r = await partnerDetail(name.trim());
        if (!r.partner) return { error: `Partner "${name}" not found — look it up with searchPartners first.` };
        return {
          partner: r.partner,
          contactCount: r.contacts.length,
          contacts: r.contacts.slice(0, 150),
          activityCount: r.activity.length,
          activity: r.activity.slice(0, 60),
        };
      },
    }),
    getActivityHistory: tool({
      description: "Read-only: view logged BD/GTM activities, sent email activity, and/or completed actions (follow-ups, workstreams, reviewed notes). Filter by company, person, owner ('me' or teammate), track (BD/GTM), or recent days.",
      inputSchema: z.object({
        query: z.string().default(""),
        owner: z.string().default(""),
        track: z.enum(["All", "BD", "GTM"]).default("All"),
        days: z.number().int().min(0).max(3650).default(90),
        includeCompleted: z.boolean().default(true),
        includeEmails: z.boolean().default(true),
      }),
      execute: async ({ query, owner, track, days, includeCompleted, includeEmails }) => {
        const { buildActivities, buildEmailActivity } = await import("./sheets.server");
        const { listHarvestedActivities } = await import("./knowledge.server");
        const { teamMemberFor } = await import("@/lib/user-ownership");
        const who = owner.trim() ? teamMemberFor(/^me$/i.test(owner.trim()) ? opts.teamEmail : owner) : null;
        const since = days ? new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) : "";
        const [acts, emails, harvested] = await Promise.all([
          buildActivities().catch(() => []),
          includeEmails ? buildEmailActivity().catch(() => []) : Promise.resolve([]),
          includeCompleted ? listHarvestedActivities().catch(() => []) : Promise.resolve([]),
        ]);
        const filteredActs = acts.filter((a) => (!since || (a.date || "").slice(0, 10) >= since)
          && (track === "All" || a.track === track)
          && (!who || teamMemberFor(a.owner || "")?.displayName === who.displayName)
          && (!query.trim() || hit(query, a.name, a.company, a.person, a.notes, a.owner)));
        const filteredEmails = emails.filter((e) => (!since || (e.timestamp || "").slice(0, 10) >= since)
          && (!query.trim() || hit(query, e.contactEmail, e.subject, e.linkedPortco, e.linkedEvent, e.type)));
        const completedFollowUps = harvested.filter((a) => (a.resolved || a.activityId.startsWith("action:"))
          && (!since || (a.resolvedAt || a.date || "").slice(0, 10) >= since)
          && (!who || teamMemberFor(a.owner || "")?.displayName === who.displayName)
          && (!query.trim() || hit(query, a.title, a.portco, a.person, a.summary)));
        return {
          activitiesTotal: filteredActs.length,
          activities: filteredActs.slice(0, 80).map((a) => ({ date: a.date, track: a.track, name: a.name, company: a.company || "", person: a.person || "", owner: a.owner || "", notes: (a.notes || "").slice(0, 300) })),
          emailsTotal: filteredEmails.length,
          emails: filteredEmails.slice(0, 60),
          completedTotal: completedFollowUps.length,
          completed: completedFollowUps.slice(0, 60).map((a) => ({ date: a.resolvedAt || a.date, title: a.title, portco: a.portco, person: a.person, owner: a.owner, summary: a.summary.slice(0, 250) })),
        };
      },
    }),
    getReviewInbox: tool({
      description: "Read-only: list pending unreviewed meeting notes and harvested email/alias activities waiting in My Actions for review. Defaults to the current user; set everyone=true for the full team.",
      inputSchema: z.object({ everyone: z.boolean().default(false), kind: z.enum(["all", "notes", "activity"]).default("all") }),
      execute: async ({ everyone, kind }) => {
        const { listNotesInbox } = await import("./notes-inbox.server");
        const owner = everyone ? undefined : opts.teamEmail;
        const [notes, activity] = await Promise.all([
          kind === "activity" ? Promise.resolve([]) : listNotesInbox(false, owner, "notes").catch(() => []),
          kind === "notes" ? Promise.resolve([]) : listNotesInbox(false, owner, "activity").catch(() => []),
        ]);
        const shape = (x: Awaited<ReturnType<typeof listNotesInbox>>[number]) => ({
          recordId: x.recordId, date: x.date, title: x.title, source: x.source, author: x.author,
          portco: x.portco, summary: (x.summary || "").slice(0, 300),
        });
        return { notesTotal: notes.length, notes: notes.slice(0, 50).map(shape), activityTotal: activity.length, activity: activity.slice(0, 50).map(shape) };
      },
    }),
    getMorningBrief: tool({
      description: "Read-only: read the latest Morning Brief (today's meetings, people profiles, follow-up reminders, signals, and network movements). Only available to the Morning Brief owner.",
      inputSchema: z.object({ days: z.number().int().min(1).max(7).default(1) }),
      execute: async ({ days }) => {
        const { teamMemberFor } = await import("@/lib/user-ownership");
        if (teamMemberFor(opts.teamEmail)?.email.toLowerCase() !== BRIEF_OWNER) {
          return { error: "Morning Brief is only available to Chris Falloon." };
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("morning_briefs")
          .select("brief_date, status, brief, updated_at")
          .eq("owner_email", BRIEF_OWNER)
          .order("brief_date", { ascending: false })
          .limit(days);
        if (error) return { error: error.message };
        return { briefs: (data || []).map((r) => ({ date: r.brief_date, status: r.status, updatedAt: r.updated_at, brief: r.brief })) };
      },
    }),
    getEventHistoryLinks: tool({
      description: "Read-only: read linked historical notes/emails/documents and saved event synopses for an Event Planner event (pass eventUrid and/or eventName from searchEvents).",
      inputSchema: z.object({ eventUrid: z.string().default(""), eventName: z.string().default("") }),
      execute: async ({ eventUrid, eventName }) => {
        const { activeHistoryLinks } = await import("./event-planner.server");
        const { buildEventSynopses } = await import("./sheets.server");
        const [links, synopses] = await Promise.all([
          activeHistoryLinks().catch(() => []),
          buildEventSynopses().catch(() => ({} as Record<string, string>)),
        ]);
        const u = eventUrid.trim();
        const nm = q(eventName);
        const matchedLinks = links.filter((l) => (u && l.targetUrid === u) || (nm && q(l.sourceName).includes(nm)));
        const synopsis = Object.entries(synopses).find(([k]) => nm && q(k) === nm)?.[1] || "";
        return { synopsis, linkCount: matchedLinks.length, links: matchedLinks.slice(0, 60) };
      },
    }),
    getDashboardMetrics: tool({
      description: "Read-only: aggregate Venture Pulse dashboard metrics across Network outreach & campaigns, Events by year/status/category, and PortCo investment/ownership totals.",
      inputSchema: z.object({ days: z.number().int().min(7).max(365).default(90), eventYear: z.number().int().min(2020).max(2035).optional() }),
      execute: async ({ days, eventYear }) => {
        const { buildContacts, buildTargets, buildNetworkPyramidData, buildEmailActivity } = await import("./sheets.server");
        const { listCampaigns, listMembers } = await import("./campaigns.server");
        const { readPlannerEvents, readAttendees } = await import("./event-planner.server");
        const { readProfiles } = await import("./portco-store.server");
        const { campaignStats, networkDashboardStats, personKey } = await import("@/lib/network-dashboard");
        const { eventBreakdowns, eventsInScope } = await import("@/lib/events-dashboard");
        const { ratedLevel } = await import("@/lib/contact-kind");
        const [contacts, prospects, pyr, emails, campaigns, members, events, attendees, profiles] = await Promise.all([
          buildContacts().catch(() => []),
          buildTargets().catch(() => []),
          buildNetworkPyramidData().catch(() => ({ movements: [], targets: {}, prospects: [] })),
          buildEmailActivity().catch(() => []),
          listCampaigns().catch(() => []),
          listMembers().catch(() => []),
          readPlannerEvents().catch(() => []),
          readAttendees().catch(() => []),
          readProfiles().catch(() => []),
        ]);
        const people = new Map<string, { prime: string; tier: "Council" | "Hot" | "Warm" | "Cold" | "Prospect" | null; prospect: boolean }>();
        for (const p of prospects) {
          const k = personKey(p.email);
          if (k) people.set(k, { prime: p.prime || "", tier: "Prospect", prospect: true });
        }
        for (const c of contacts) {
          const k = personKey(c.email);
          if (k) people.set(k, { prime: c.prime || "", tier: ratedLevel(c), prospect: false });
        }
        const ownerByCamp = new Map(campaigns.map((c) => [c.id, c.owner || c.createdBy || ""]));
        const touches: Touch[] = [
          ...emails.filter((e) => e.contactEmail && e.timestamp).map((e): Touch => ({ person: personKey(e.contactEmail), date: e.timestamp, source: "Email", actor: "" })),
          ...members.filter((m) => m.sentDate && m.email).map((m): Touch => ({ person: personKey(m.email), date: m.sentDate, source: "Campaign", actor: ownerByCamp.get(m.campaignId) || "" })),
        ].filter((t) => t.person);
        const year = eventYear ?? new Date().getFullYear();
        const net = networkDashboardStats({
          people,
          touches,
          movements: pyr.movements,
          days,
        });
        const scopedEvents = eventsInScope(events, year, null);
        const ev = eventBreakdowns(scopedEvents, attendees);
        let totalInvestmentM = 0, pricedPortcos = 0;
        const byStage: Record<string, number> = {};
        const byPriority: Record<string, number> = {};
        for (const p of profiles) {
          const inv = Number((p.fields["DTC Investment ($M)"] || "").replace(/[^0-9.]/g, ""));
          if (Number.isFinite(inv) && inv > 0) { totalInvestmentM += inv; pricedPortcos++; }
          const st = p.fields["Company Stage"] || "Unset";
          byStage[st] = (byStage[st] || 0) + 1;
          const pr = p.fields["DTC Priority"] || "Unset";
          byPriority[pr] = (byPriority[pr] || 0) + 1;
        }
        return {
          network: { periodDays: days, total: net.total, byOwner: net.rows, campaigns: campaignStats(campaigns) },
          events: { year, eventCount: scopedEvents.length, breakdowns: ev },
          portfolio: { profileCount: profiles.length, pricedPortcos, totalInvestmentM: Math.round(totalInvestmentM * 100) / 100, byStage, byPriority },
        };
      },
    }),
  };
}
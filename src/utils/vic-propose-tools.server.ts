// Extended write-proposal tools for V.I.C. Nothing saves until the user approves in the UI.
import { tool } from "ai";
import { z } from "zod";

const q = (s: string | undefined) => (s || "").trim().toLowerCase();

export function vicProposeTools(opts: { teamEmail: string }) {
  return {
    proposeAddContact: tool({
      description: "PROPOSE adding a new person to Network or Prospecting. Check searchNetwork first so you don't propose someone already in Venture Pulse. Never saves without user approval.",
      inputSchema: z.object({
        list: z.enum(["Network", "Prospecting"]).default("Prospecting"),
        name: z.string().min(1),
        title: z.string().default(""),
        company: z.string().default(""),
        email: z.string().default(""),
        phone: z.string().default(""),
        location: z.string().default(""),
        linkedinUrl: z.string().default(""),
        sector: z.string().default(""),
        prime: z.string().default(""),
        temperature: z.enum(["Council", "Hot", "Warm", "Cold"]).default("Cold"),
        source: z.string().default("V.I.C."),
        reason: z.string().default(""),
      }),
      execute: async (input) => {
        const { teamMemberFor } = await import("@/lib/user-ownership");
        const prime = input.prime.trim() ? (teamMemberFor(input.prime)?.displayName || input.prime.trim()) : (teamMemberFor(opts.teamEmail)?.displayName || "");
        return { status: "awaiting_review" as const, ...input, prime };
      },
    }),
    proposeEditContact: tool({
      description: "PROPOSE editing an existing contact's fields (title/role, company, email, phone, location, LinkedIn, Relationship Prime, Contact Type). Look them up first with searchNetwork or getContactDetails and pass their exact urid or email.",
      inputSchema: z.object({
        urid: z.string().default(""),
        email: z.string().default(""),
        fields: z.object({
          role: z.string().optional(),
          company: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          location: z.string().optional(),
          linkedin: z.string().optional(),
          prime: z.string().optional(),
          contactType: z.enum(["PortCo", "Dell", "Partner", "Network"]).optional(),
        }),
        reason: z.string().default(""),
      }),
      execute: async ({ urid, email, fields, reason }) => {
        const { buildContacts, buildTargets } = await import("./sheets.server");
        const [contacts, prospects] = await Promise.all([buildContacts(), buildTargets().catch(() => [])]);
        const u = q(urid), em = q(email);
        const found = contacts.find((c) => (u && q(c.urid || c.id) === u) || (em && q(c.email) === em))
          || prospects.find((p) => (u && q(p.urid || p.id) === u) || (em && q(p.email) === em));
        if (!found) return { error: "Contact not found — look them up with searchNetwork or getContactDetails first." };
        const current = {
          role: found.title || "",
          company: found.company || "",
          email: found.email || "",
          phone: found.phone || "",
          location: found.location || "",
          linkedin: found.linkedinUrl || "",
          prime: found.prime || "",
          contactType: found.contactType || "",
        };
        return {
          status: "awaiting_review" as const,
          urid: found.urid || found.id,
          name: found.name,
          currentEmail: found.email,
          current,
          proposed: fields,
          reason,
        };
      },
    }),
    proposeMergeContacts: tool({
      description: "PROPOSE merging 2 to 5 duplicate contact records into one keeper record (archives the others with undo support). Look up their exact URIDs first with findDuplicateContacts or searchNetwork.",
      inputSchema: z.object({
        urids: z.array(z.string().min(1)).min(2).max(5),
        keeperUrid: z.string().optional(),
        status: z.enum(["Council", "Hot", "Warm", "Cold", "Prospecting"]).optional(),
        reason: z.string().default(""),
      }),
      execute: async ({ urids, keeperUrid, status, reason }) => {
        const { previewMerge } = await import("./contact-merge.server");
        const { statusOptions } = await import("@/lib/contact-merge");
        try {
          const preview = await previewMerge(urids);
          const keeper = preview.records.find((r) => r.urid === keeperUrid)?.urid || preview.records[0]?.urid || "";
          const optsList = statusOptions(preview.records);
          const chosenStatus = status || (optsList[0] as "Council" | "Hot" | "Warm" | "Cold" | "Prospecting") || "Cold";
          return {
            status: "awaiting_review" as const,
            urids: preview.records.map((r) => r.urid),
            keeperUrid: keeper,
            targetStatus: chosenStatus,
            reason,
            records: preview.records.map((r) => ({
              urid: r.urid,
              name: r.name,
              email: r.values["email"] || "",
              company: r.values["company"] || "",
              title: r.values["role"] || r.values["title"] || "",
              where: r.where,
              status: r.status,
            })),
          };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "Couldn't preview merge." };
        }
      },
    }),
    proposeCreateCampaign: tool({
      description: "PROPOSE creating a new Campaign (draft). Check searchCampaigns first so the name is unique.",
      inputSchema: z.object({
        name: z.string().min(1),
        purpose: z.enum(["Event outreach", "Event follow-up", "Network outreach", "Business development"]).default("Network outreach"),
        owner: z.string().default(""),
        channel: z.enum(["email", "linkedin", "both"]).default("email"),
        events: z.array(z.string()).default([]),
        portcos: z.array(z.string()).default([]),
        templateSubject: z.string().default(""),
        templateBody: z.string().default(""),
      }),
      execute: async (input) => {
        const { teamMemberFor } = await import("@/lib/user-ownership");
        const owner = input.owner.trim() ? (teamMemberFor(input.owner)?.displayName || input.owner.trim()) : (teamMemberFor(opts.teamEmail)?.displayName || "");
        return { status: "awaiting_review" as const, ...input, owner };
      },
    }),
    proposeAddCampaignMembers: tool({
      description: "PROPOSE adding people to an existing Campaign. Look up the campaign with searchCampaigns (pass campaignId) and people with searchNetwork/filterNetwork first.",
      inputSchema: z.object({
        campaignId: z.string().min(1),
        people: z.array(z.object({
          urid: z.string().optional(),
          name: z.string().min(1),
          email: z.string().default(""),
          title: z.string().default(""),
          company: z.string().default(""),
          linkedin: z.string().default(""),
          origin: z.enum(["network", "prospect", "apollo"]).default("network"),
        })).min(1).max(200),
      }),
      execute: async ({ campaignId, people }) => {
        const { listCampaigns } = await import("./campaigns.server");
        const camp = (await listCampaigns()).find((c) => c.id === campaignId.trim());
        if (!camp) return { error: "Campaign not found — look it up with searchCampaigns first." };
        return { status: "awaiting_review" as const, campaignId: camp.id, campaignName: camp.name, portcos: camp.portcos, event: camp.events[0] || "", people };
      },
    }),
    proposeCampaignResults: tool({
      description: "PROPOSE recording outreach responses (interested, confirmed, declined, no-reply) for people in a Campaign. Look up the campaign and its members with getCampaignDetails first.",
      inputSchema: z.object({
        campaignId: z.string().min(1),
        marks: z.array(z.object({
          email: z.string().default(""),
          name: z.string().min(1),
          result: z.enum(["interested", "confirmed", "declined", "no-reply"]),
          followUpDue: z.string().default(""),
          followUpOwner: z.string().default(""),
        })).min(1).max(100),
      }),
      execute: async ({ campaignId, marks }) => {
        const { listCampaigns, listMembers } = await import("./campaigns.server");
        const [camps, members] = await Promise.all([listCampaigns(), listMembers(campaignId.trim())]);
        const camp = camps.find((c) => c.id === campaignId.trim());
        if (!camp) return { error: "Campaign not found — look it up with searchCampaigns first." };
        const resolved = marks.map((m) => {
          const match = members.find((x) => (m.email && q(x.email) === q(m.email)) || q(x.name) === q(m.name));
          return match ? { personKey: match.personKey, name: match.name, email: match.email, result: m.result, followUpDue: m.followUpDue, followUpOwner: m.followUpOwner } : null;
        }).filter((x): x is NonNullable<typeof x> => !!x);
        if (!resolved.length) return { error: "None of those people were found in that campaign — check getCampaignDetails first." };
        return { status: "awaiting_review" as const, campaignId: camp.id, campaignName: camp.name, marks: resolved };
      },
    }),
    proposeCreateWorkstream: tool({
      description: "PROPOSE creating a new PortCo GTM or BD workstream in Venture Pulse. Check searchPortcos for the exact canonical company name first.",
      inputSchema: z.object({
        company: z.string().min(1),
        segment: z.enum(["GTM", "BD"]),
        name: z.string().min(1),
        owner: z.string().default(""),
      }),
      execute: async (input) => {
        const { teamMemberFor } = await import("@/lib/user-ownership");
        const owner = input.owner.trim() ? (teamMemberFor(input.owner)?.displayName || input.owner.trim()) : (teamMemberFor(opts.teamEmail)?.displayName || "");
        return { status: "awaiting_review" as const, ...input, owner };
      },
    }),
    proposeCreateEvent: tool({
      description: "PROPOSE adding a new event to the Event Planner. Check searchEvents first so you don't duplicate an existing event. Dates YYYY-MM-DD.",
      inputSchema: z.object({
        name: z.string().min(1),
        start: z.string().default(""),
        end: z.string().default(""),
        location: z.string().default(""),
        category: z.enum(["DTC-led", "Partner-led", "Briefings", "Potential"]).default("Potential"),
        subcategory: z.string().default(""),
        dtcStatus: z.enum(["Completed", "Confirmed", "Considering", "Potential", "Declined"]).default("Potential"),
        owner: z.string().default(""),
        portcos: z.array(z.string()).default([]),
        partners: z.array(z.string()).default([]),
        website: z.string().default(""),
        notes: z.string().default(""),
      }),
      execute: async (input) => {
        const { teamMemberFor } = await import("@/lib/user-ownership");
        const owner = input.owner.trim() ? (teamMemberFor(input.owner)?.displayName || input.owner.trim()) : (teamMemberFor(opts.teamEmail)?.displayName || "");
        return { status: "awaiting_review" as const, ...input, end: input.end || input.start, owner };
      },
    }),
    proposeUpdateEvent: tool({
      description: "PROPOSE updating an existing Event Planner event (dates, location, DTC status, owner, PortCos, partners, notes, actionsNeeded). Look up the event with searchEvents first and pass its exact eventUrid.",
      inputSchema: z.object({
        eventUrid: z.string().min(1),
        start: z.string().optional(),
        end: z.string().optional(),
        location: z.string().optional(),
        dtcStatus: z.enum(["Completed", "Confirmed", "Considering", "Potential", "Declined"]).optional(),
        owner: z.string().optional(),
        portcos: z.array(z.string()).optional(),
        partners: z.array(z.string()).optional(),
        notes: z.string().optional(),
        actionsNeeded: z.string().optional(),
      }),
      execute: async ({ eventUrid, ...patch }) => {
        const { readPlannerEvents } = await import("./event-planner.server");
        const ev = (await readPlannerEvents()).find((e) => e.urid === eventUrid.trim());
        if (!ev) return { error: "Event not found — look it up with searchEvents first." };
        return {
          status: "awaiting_review" as const,
          eventUrid: ev.urid,
          eventName: ev.name,
          expectedUpdated: ev.updated,
          current: {
            start: ev.start,
            end: ev.end,
            location: ev.location,
            dtcStatus: ev.dtcStatus || ev.status,
            owner: ev.owner,
            portcos: ev.portcos,
            partners: ev.partners,
            notes: ev.notes,
            actionsNeeded: ev.actionsNeeded,
          },
          proposed: patch,
        };
      },
    }),
  };
}
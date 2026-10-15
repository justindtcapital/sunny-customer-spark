import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { scopeMomentum, dedupeReminders, type HomeReminder } from "@/lib/home-momentum";
import { targetKeyOf } from "@/lib/types";
import { ownerMatches, teamProfile } from "@/lib/user-ownership";

const input = z.object({ email: z.string().email(), scope: z.enum(["mine", "team"]) });

/** Real provider reads only: never substitute sample rows for unavailable KPIs. */
export const fetchHomeMomentum = createServerFn({ method: "POST" })
  .inputValidator((data: z.infer<typeof input>) => input.parse(data))
  .handler(async ({ data }) => {
    const sheets = await import("./sheets.server");
    const asana = await import("./asana.server");
    const campaignsStore = await import("./campaigns.server");
    const inbox = await import("./notes-inbox.server");
    const knowledge = await import("./knowledge.server");
    const errors: string[] = [];
    async function read<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
      try { return await fn(); } catch (error) { console.error(`[home] ${label}`, error); errors.push(label); return fallback; }
    }
    // Bounded batches avoid competing with the Worker outbound-connection limit.
    const [contacts, targets, companies] = await Promise.all([
      read("Network", sheets.buildContacts, []), read("Prospecting", sheets.buildTargets, []), read("PortCo", sheets.buildPortfolioCompanies, []),
    ]);
    const [events, workstreams, campaigns] = await Promise.all([
      read("Events", asana.fetchAllAsanaEvents, []), read("Workstreams", asana.fetchPortcoWorkstreams, []), read("Campaigns", campaignsStore.listCampaigns, []),
    ]);
    const index = await read("Ownership", () => sheets.buildOwnershipIndex(data.email), { ownedGids: [] as string[] });
    const members = await read("Campaign reminders", () => campaignsStore.listMembers(), []);
    const owner = data.scope === "mine" ? teamProfile(data.email)?.displayName : undefined;
    const notes = await read("Notes", () => inbox.listNotesInbox(false, owner, "notes"), []);
    const emails = await read("Email review", () => inbox.listNotesInbox(false, owner, "activity"), []);
    const noteHistory = await read("Note history", () => inbox.listNotesInbox(true, owner, "notes"), []);
    const emailHistory = await read("Email history", () => inbox.listNotesInbox(true, owner, "activity"), []);
    const records = await read("Knowledge dates", knowledge.listKnowledgeRecords, []);
    const activities = await read("Note follow-ups", knowledge.listHarvestedActivities, []);
    const reviews = await read("Follow-up state", inbox.reviewMap, new Map());
    const scoped = scopeMomentum({ contacts, targets, companies, events, workstreams, campaigns, members, ownedGids: index.ownedGids }, data.scope, data.email);
    const profile = teamProfile(data.email);
    const matches = (who?: string) => data.scope === "team" || (!!profile && ownerMatches(who, profile));
    const reminders: HomeReminder[] = [];
    // Build reminders before filtering by relationship scope: task owner wins.
    for (const c of contacts) {
      const outstanding = c.interactions.filter((i) => i.isFollowUp && !i.followUpComplete);
      for (const i of outstanding) {
        const who = i.owner || c.prime;
        if (!matches(who)) continue;
        reminders.push({ id: `${c.id}:${i.id}`, person: c.name, company: c.company, email: c.email, owner: who, due: i.followUpDue || "", source: "Network", summary: i.summary, originalNote: i.summary, date: i.date });
      }
      if (c.followUpPending && !outstanding.length && matches(c.prime)) reminders.push({ id: `flag:${c.id}`, person: c.name, company: c.company, email: c.email, owner: c.prime, due: "", source: "Network", summary: "Follow-up flagged" });
    }
    for (const t of targets) if (t.followUp && matches(t.prime)) reminders.push({ id: `target:${t.id}`, person: t.name, company: t.company, email: t.email, targetKey: targetKeyOf(t), owner: t.prime || "", due: t.followUpDue || "", source: "Prospecting", summary: t.campaign || "Prospecting follow-up" });
    for (const m of members) {
      if (!m.followUpDue || !matches(m.followUpOwner)) continue;
      const campaign = campaigns.find((c) => c.id === m.campaignId);
      if (!campaign || campaign.status === "done") continue;
      const target = targets.find((t) => targetKeyOf(t) === m.personKey || (!!m.email && t.email?.toLowerCase() === m.email.toLowerCase()));
      const contact = contacts.find((c) => c.urid === m.personKey || (!!m.email && c.email.toLowerCase() === m.email.toLowerCase()));
      if (m.kind === "prospect" && target && !target.followUp) continue;
      if (m.kind === "network" && contact && !contact.followUpPending && !contact.interactions.some((i) => i.isFollowUp && !i.followUpComplete)) continue;
      // An undated legacy campaign interaction is replaced by its dated member reminder.
      if (contact) {
        const legacy = reminders.findIndex((r) => r.email === contact.email && !r.due && r.summary.includes(`"${campaign.name}"`));
        if (legacy >= 0) reminders.splice(legacy, 1);
      }
      reminders.push({ id: `campaign:${m.campaignId}:${m.personKey}`, person: m.name, company: m.company, email: m.email, targetKey: target ? targetKeyOf(target) : undefined, campaignId: m.campaignId, owner: m.followUpOwner, due: m.followUpDue, source: "Campaign", summary: campaign.name });
    }
    const sources = new Map(records.map((r) => [r.recordId, r.sourceType]));
    for (const a of activities) {
      if (a.track !== "Follow-up" || a.resolved || !matches(a.owner)) continue;
      if (!inbox.isRegisteredActivity(sources.get(a.recordId) || "", reviews.get(a.recordId))) continue;
      reminders.push({ id: a.activityId, activityId: a.activityId, person: a.person || a.title, company: a.portco, owner: a.owner, due: a.date || "", source: "Notes", summary: a.title, sourceUrl: a.sourceUrl });
    }
    const recordDates = new Map(records.map((r) => [r.recordId, r.createdAt]));
    return { ...scoped, notes: notes.map((n) => ({ ...n, importedAt: recordDates.get(n.recordId) || "" })), emails: emails.map((n) => ({ ...n, importedAt: recordDates.get(n.recordId) || "" })), history: [...noteHistory, ...emailHistory].filter((n) => n.review?.status !== "skipped"), reminders: dedupeReminders(reminders), errors, asOf: new Date().toISOString() };
  });

export const completeHomeNoteFollowUp = createServerFn({ method: "POST" })
  .inputValidator((data: { activityId: string }) => z.object({ activityId: z.string().min(1).max(100) }).parse(data))
  .handler(async ({ data }) => {
    const { resolveHarvestedActivity } = await import("./knowledge.server");
    return { success: await resolveHarvestedActivity(data.activityId, true) };
  });
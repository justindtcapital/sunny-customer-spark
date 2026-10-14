import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  appendInteractionRows,
  appendTargetOutreachRows,
  appendTargetRows,
  buildContacts,
  buildPortfolioCompanies,
  buildTargets,
  flagContactsForFollowUp,
  logOpsEvent,
  updateTargetFields,
  type TargetRowInput,
} from "./sheets.server";
import {
  appendMembers,
  campaignsForPerson,
  listCampaigns,
  listMembers,
  saveCampaign,
  updateMembers,
} from "./campaigns.server";
import { callGeminiJSON } from "./gemini.server";
import { enrichPerson } from "./apollo.server";
import { uploadDriveFile } from "./drive.server";
import { personKeyOf, type CampaignMember, type CandidatePerson } from "@/lib/campaigns";
import { targetKeyOf } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);

export const fetchCampaigns = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return { campaigns: await listCampaigns(), error: "" };
  } catch (e) {
    console.error("fetchCampaigns failed", e);
    return { campaigns: [], error: e instanceof Error ? e.message : "Could not load campaigns" };
  }
});

export const fetchCampaignMembers = createServerFn({ method: "POST" })
  .inputValidator((d: { campaignId: string }) => z.object({ campaignId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => listMembers(data.campaignId));

export const fetchPersonCampaigns = createServerFn({ method: "POST" })
  .inputValidator((d: { keys: string[] }) => z.object({ keys: z.array(z.string()).max(10) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const rows = await campaignsForPerson(data.keys);
      return rows.map((r) => ({
        id: r.campaign.id,
        name: r.campaign.name,
        purpose: r.campaign.purpose,
        status: r.campaign.status,
        added: r.member.added,
        sentDate: r.member.sentDate,
      }));
    } catch (e) {
      console.error("fetchPersonCampaigns failed", e);
      return [];
    }
  });

const campaignInput = z.object({
  id: z.string().optional(),
  name: z.string().max(200).optional(),
  purpose: z.string().max(100).optional(),
  events: z.array(z.string().max(300)).max(50).optional(),
  portcos: z.array(z.string().max(200)).max(100).optional(),
  owner: z.string().max(100).optional(),
  channel: z.enum(["email", "linkedin", "both"]).optional(),
  templateSubject: z.string().max(1000).optional(),
  templateBody: z.string().max(20000).optional(),
  status: z.enum(["draft", "saved", "actioning", "done"]).optional(),
  by: z.string().max(200).optional(),
});

export const saveCampaignFn = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof campaignInput>) => campaignInput.parse(d))
  .handler(async ({ data }) => {
    const { by, ...rest } = data;
    const res = await saveCampaign(rest, by || "");
    if (res.ok && !data.id) {
      await logOpsEvent({
        action: "edit",
        source: "campaign_builder",
        status: "ok",
        summary: `Created campaign "${res.campaign.name}" (${res.campaign.purpose || "no purpose"})`,
        details: { by },
      });
    }
    return res;
  });

const candidate = z.object({
  name: z.string().max(200),
  email: z.string().max(300),
  title: z.string().max(300),
  company: z.string().max(300),
  linkedin: z.string().max(500),
  location: z.string().max(200).optional(),
  sector: z.string().max(200).optional(),
  origin: z.enum(["network", "prospect", "sumble", "apollo", "upload"]),
  urid: z.string().optional(),
});

const SOURCE_BY_ORIGIN: Record<string, string> = {
  sumble: "Sumble",
  apollo: "Apollo",
  upload: "CSV Import",
};

// Add people to a campaign. Existing Network/Prospecting records are NOT edited —
// only a membership row is written. People new to Venture Pulse are added to
// Prospecting, tagged with this campaign.
export const addCampaignMembers = createServerFn({ method: "POST" })
  .inputValidator((d: {
    campaignId: string;
    campaignName: string;
    people: CandidatePerson[];
    event?: string;
    portcos?: string[];
    prime?: string;
    by?: string;
  }) =>
    z
      .object({
        campaignId: z.string().min(1),
        campaignName: z.string().min(1).max(200),
        people: z.array(candidate).max(1000),
        event: z.string().max(300).optional(),
        portcos: z.array(z.string()).max(100).optional(),
        prime: z.string().max(50).optional(),
        by: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const [existingMembers, contacts, targets] = await Promise.all([
      listMembers(data.campaignId),
      buildContacts().catch(() => []),
      buildTargets().catch(() => []),
    ]);
    const memberKeys = new Set(existingMembers.map((m) => m.personKey));
    const contactKeys = new Map<string, string>();
    for (const c of contacts) {
      for (const e of (c.email || "").split(/[,;]/)) {
        const k = e.trim().toLowerCase();
        if (k) contactKeys.set(k, targetKeyOf({ email: k }));
      }
      contactKeys.set(targetKeyOf({ name: c.name, company: c.company }), targetKeyOf(c));
    }
    const targetKeys = new Set(targets.map((t) => targetKeyOf(t)));

    const newMembers: CampaignMember[] = [];
    const newProspects: TargetRowInput[] = [];
    let skipped = 0;
    for (const p of data.people) {
      const key = personKeyOf(p);
      const nameKey = targetKeyOf({ name: p.name, company: p.company });
      if (memberKeys.has(key)) {
        skipped++;
        continue;
      }
      memberKeys.add(key);
      let kind: CampaignMember["kind"] = p.origin === "network" ? "network" : "prospect";
      const inNetwork = contactKeys.has(key) || contactKeys.has(nameKey);
      const inProspecting = targetKeys.has(key) || targetKeys.has(nameKey);
      if (p.origin !== "network" && p.origin !== "prospect") {
        if (inNetwork) kind = "network";
        else if (!inProspecting) {
          const [first, ...rest] = p.name.trim().split(/\s+/);
          newProspects.push({
            firstName: first || "",
            lastName: rest.join(" "),
            company: p.company,
            role: p.title,
            linkedin: p.linkedin,
            email: p.email,
            location: p.location || "",
            sector: p.sector || "",
            stage: "Prospecting",
            source: SOURCE_BY_ORIGIN[p.origin] || "Manual Entry",
            researchPurpose: `Campaign: ${data.campaignName}`,
            campaign: data.campaignName,
            event: data.event || "",
            portcoTags: data.portcos || [],
            prime: data.prime || "",
          });
        }
      }
      newMembers.push({
        campaignId: data.campaignId,
        personKey: key,
        kind,
        name: p.name,
        email: p.email,
        title: p.title,
        company: p.company,
        linkedin: p.linkedin,
        added: today(),
        subject: "",
        body: "",
        sentChannel: "",
        sentDate: "",
        followUpOwner: "",
        followUpDue: "",
      });
    }

    if (newProspects.length) await appendTargetRows(newProspects);
    await appendMembers(newMembers);
    await saveCampaign({ id: data.campaignId, status: "saved" }, data.by || "");
    await logOpsEvent({
      action: "import",
      source: "campaign_builder",
      status: "ok",
      summary: `Campaign "${data.campaignName}": ${newMembers.length} people added (${newProspects.length} new to Prospecting)`,
      records: newMembers.length,
      details: { skipped, newProspects: newProspects.length, by: data.by },
      items: newMembers.map((m) => `${m.name} — ${m.company}`),
    });
    return { added: newMembers.length, newProspects: newProspects.length, skipped };
  });

// ── AI drafting ────────────────────────────────────────────────

async function portcoBlurbs(names: string[]): Promise<string> {
  if (!names.length) return "";
  const all = await buildPortfolioCompanies().catch(() => []);
  return names
    .map((n) => {
      const c = all.find((x) => x.name.trim().toLowerCase() === n.trim().toLowerCase());
      const site = c?.website ? (/^https?:/i.test(c.website) ? c.website : `https://${c.website}`) : "";
      return `- ${n}${site ? ` (${site})` : ""}: ${(c?.description || c?.sector || "").slice(0, 300)}`;
    })
    .join("\n");
}

const draftInput = z.object({
  purpose: z.string().max(100),
  channel: z.enum(["email", "linkedin", "both"]),
  objective: z.string().max(2000),
  keyMessage: z.string().max(4000),
  tone: z.string().max(100),
  length: z.string().max(50),
  events: z.array(z.string()).max(20),
  eventDetails: z.string().max(2000).optional(),
  portcos: z.array(z.string()).max(30),
  ctas: z.array(z.object({ label: z.string().max(200), url: z.string().max(1000) })).max(10),
  senderName: z.string().max(200).optional(),
});

const DRAFT_SYSTEM = `You write concise, warm, professional outreach for Dell Technologies Capital (DTC), a corporate VC.
Write a reusable template using placeholders {{first_name}}, {{title}}, {{company}} where natural.
Include every call-to-action link exactly as given (full URL). When PortCos are listed, include a one-line blurb for each with its website URL.
Never invent facts, numbers, dates or links not provided.
Return JSON: {"subject": string, "body": string, "linkedin": string}. "linkedin" is a short (<= 600 chars) LinkedIn message version. Plain text, no markdown.`;

export const draftCampaignTemplate = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof draftInput>) => draftInput.parse(d))
  .handler(async ({ data }) => {
    const blurbs = await portcoBlurbs(data.portcos);
    const user = [
      `Campaign purpose: ${data.purpose}`,
      `Channel: ${data.channel}`,
      `Objective: ${data.objective}`,
      `What to say: ${data.keyMessage}`,
      `Tone: ${data.tone}. Length: ${data.length}.`,
      data.events.length ? `Events: ${data.events.join("; ")}` : "",
      data.eventDetails ? `Event details: ${data.eventDetails}` : "",
      blurbs ? `PortCos (name, website, description):\n${blurbs}` : "",
      data.ctas.length
        ? `Calls to action:\n${data.ctas.map((c) => `- ${c.label}: ${c.url}`).join("\n")}`
        : "",
      data.senderName ? `Sign off as: ${data.senderName}, Dell Technologies Capital` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const res = await callGeminiJSON<{ subject?: string; body?: string; linkedin?: string }>(
      DRAFT_SYSTEM,
      user,
      1800,
    );
    if (!res.ok || !res.data) return { ok: false as const, error: res.error || "Draft failed" };
    return {
      ok: true as const,
      subject: res.data.subject || "",
      body: res.data.body || "",
      linkedin: res.data.linkedin || "",
    };
  });

const PERSONALIZE_SYSTEM = `You lightly personalize an outreach template for each recipient.
Keep the template's structure, links, calls to action and sign-off. Add at most one or two sentences of personalization using ONLY the profile facts provided (role, responsibilities, company, employment history). Never invent facts.
Return JSON: {"messages":[{"key": string, "subject": string, "body": string, "linkedin": string}]}, one per recipient, same keys as given.`;

export const personalizeCampaignMessages = createServerFn({ method: "POST" })
  .inputValidator((d: {
    subject: string;
    body: string;
    linkedin: string;
    useApollo: boolean;
    people: Array<{ key: string; name: string; email: string; title: string; company: string; linkedin: string }>;
  }) =>
    z
      .object({
        subject: z.string().max(1000),
        body: z.string().max(20000),
        linkedin: z.string().max(3000),
        useApollo: z.boolean(),
        people: z
          .array(
            z.object({
              key: z.string(),
              name: z.string(),
              email: z.string(),
              title: z.string(),
              company: z.string(),
              linkedin: z.string(),
            }),
          )
          .max(10),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const profiles = await Promise.all(
      data.people.map(async (p) => {
        let history = "";
        let headline = "";
        if (data.useApollo) {
          const [firstName, ...rest] = p.name.split(/\s+/);
          const r = await enrichPerson({
            email: p.email || undefined,
            firstName,
            lastName: rest.join(" "),
            organizationName: p.company,
            linkedinUrl: p.linkedin || undefined,
          }).catch(() => null);
          if (r?.found) {
            history = (r.employmentHistory || [])
              .map((e) => `${e.title} at ${e.company}${e.current ? " (current)" : ""}`)
              .join("; ");
            headline = (r as { headline?: string }).headline || "";
          }
        }
        return `key=${p.key}\nname=${p.name}\ntitle=${p.title}\ncompany=${p.company}${headline ? `\nheadline=${headline}` : ""}${history ? `\nhistory=${history}` : ""}`;
      }),
    );
    const user = `TEMPLATE SUBJECT:\n${data.subject}\n\nTEMPLATE EMAIL BODY:\n${data.body}\n\nTEMPLATE LINKEDIN:\n${data.linkedin}\n\nRECIPIENTS:\n${profiles.join("\n---\n")}`;
    const res = await callGeminiJSON<{
      messages?: Array<{ key: string; subject?: string; body?: string; linkedin?: string }>;
    }>(PERSONALIZE_SYSTEM, user, 900 * data.people.length + 500);
    if (!res.ok || !res.data?.messages) return { ok: false as const, error: res.error || "Personalization failed", messages: [] };
    return { ok: true as const, messages: res.data.messages };
  });

export const saveMemberDrafts = createServerFn({ method: "POST" })
  .inputValidator((d: { campaignId: string; drafts: Array<{ personKey: string; subject: string; body: string }> }) =>
    z
      .object({
        campaignId: z.string().min(1),
        drafts: z
          .array(z.object({ personKey: z.string(), subject: z.string().max(1000), body: z.string().max(20000) }))
          .max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const n = await updateMembers(
      data.campaignId,
      data.drafts.map((d) => ({ personKey: d.personKey, fields: { subject: d.subject, body: d.body } })),
    );
    return { updated: n };
  });

export const uploadCampaignAttachment = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; mimeType: string; base64: string }) =>
    z
      .object({
        name: z.string().min(1).max(300),
        mimeType: z.string().max(200),
        base64: z.string().max(14_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const doc = await uploadDriveFile({ name: data.name, mimeType: data.mimeType, base64: data.base64 });
    if (!doc) return { ok: false as const, error: "Upload to Google Drive failed." };
    const url = (doc as { webViewLink?: string; url?: string }).webViewLink || (doc as { url?: string }).url || "";
    return { ok: true as const, url, name: doc.name };
  });

// Log one send (email opened / LinkedIn opened) on the person's record.
export const logCampaignSend = createServerFn({ method: "POST" })
  .inputValidator((d: {
    campaignId: string;
    campaignName: string;
    personKey: string;
    kind: "network" | "prospect";
    email: string;
    channel: "email" | "linkedin";
    portcos?: string[];
    by?: string;
  }) =>
    z
      .object({
        campaignId: z.string().min(1),
        campaignName: z.string().min(1),
        personKey: z.string().min(1),
        kind: z.enum(["network", "prospect"]),
        email: z.string(),
        channel: z.enum(["email", "linkedin"]),
        portcos: z.array(z.string()).max(30).optional(),
        by: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const label = data.channel === "email" ? "email opened" : "LinkedIn message opened";
    const summary = `Campaign: ${data.campaignName} — ${label}${data.by ? ` by ${data.by}` : ""}`;
    if (data.kind === "prospect") {
      await appendTargetOutreachRows([
        {
          targetKey: data.personKey,
          date: today(),
          method: data.channel === "email" ? "Email" : "LinkedIn",
          summary,
          id: crypto.randomUUID(),
          portcos: data.portcos,
        },
      ]);
      await updateTargetFields(data.personKey, { lastContacted: today() }).catch(() => undefined);
    } else if (data.email) {
      await appendInteractionRows([
        { email: data.email, date: today(), summary, type: "email", requiresFollowUp: false, owner: data.by },
      ]);
    }
    await updateMembers(data.campaignId, [
      { personKey: data.personKey, fields: { sentChannel: data.channel, sentDate: today() } },
    ]);
    return { ok: true };
  });

export const setCampaignFollowUps = createServerFn({ method: "POST" })
  .inputValidator((d: {
    campaignId: string;
    campaignName: string;
    owner: string;
    due: string;
    people: Array<{ personKey: string; kind: "network" | "prospect"; email: string }>;
  }) =>
    z
      .object({
        campaignId: z.string().min(1),
        campaignName: z.string().min(1),
        owner: z.string().min(1).max(100),
        due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        people: z
          .array(z.object({ personKey: z.string(), kind: z.enum(["network", "prospect"]), email: z.string() }))
          .max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    let failed = 0;
    for (const p of data.people.filter((x) => x.kind === "prospect")) {
      try {
        await updateTargetFields(p.personKey, { followUpFlag: "TRUE", followUpDue: data.due });
      } catch {
        failed++;
      }
    }
    const network = data.people.filter((x) => x.kind === "network" && x.email);
    if (network.length) {
      await flagContactsForFollowUp(network.map((n) => n.email));
      await appendInteractionRows(
        network.map((n) => ({
          email: n.email,
          date: today(),
          summary: `Follow up on campaign "${data.campaignName}" by ${data.due} (owner: ${data.owner})`,
          type: "follow-up" as const,
          requiresFollowUp: true,
          owner: data.owner,
        })),
      );
    }
    await updateMembers(
      data.campaignId,
      data.people.map((p) => ({ personKey: p.personKey, fields: { followUpOwner: data.owner, followUpDue: data.due } })),
    );
    await logOpsEvent({
      action: "edit",
      source: "campaign_builder",
      status: failed ? "warning" : "ok",
      summary: `Campaign "${data.campaignName}": follow-ups set for ${data.people.length} people (${data.owner}, due ${data.due})`,
      records: data.people.length,
      details: { failed },
    });
    return { set: data.people.length - failed, failed };
  });

export const finishCampaign = createServerFn({ method: "POST" })
  .inputValidator((d: { campaignId: string; by?: string }) =>
    z.object({ campaignId: z.string().min(1), by: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const res = await saveCampaign({ id: data.campaignId, status: "done" }, data.by || "");
    if (res.ok) {
      const members = await listMembers(data.campaignId);
      const sent = members.filter((m) => m.sentDate).length;
      const fu = members.filter((m) => m.followUpDue).length;
      await logOpsEvent({
        action: "edit",
        source: "campaign_builder",
        status: "ok",
        summary: `Campaign "${res.campaign.name}" actioned: ${members.length} people, ${sent} messages opened, ${fu} follow-ups`,
        records: members.length,
        details: { by: data.by },
      });
    }
    return res;
  });

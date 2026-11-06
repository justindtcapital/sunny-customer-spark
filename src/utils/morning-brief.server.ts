// Morning Brief builder: reads Claude Cowork's daily email from the Workspace
// inbox, enriches it with Venture Pulse records and V.I.C., stores one brief
// per owner per day and emails it once. Read-only over CRM data. Server-only.
import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";
import {
  BRIEF_SUBJECT, anticipatedFollowUps, candidateNames, dueThisWeek, investmentStrip, matchPeople,
  mentionedCompanies, nextEvents, parseCoworkBrief, personHints, priorityBadge, daysBetween,
  isInternalOrg, splitPortcos, stripScheduling, titleCompany,
} from "@/lib/morning-brief";
import { isSharedEmailDomain, normalizeDomain } from "@/lib/company-domains";
import { teamMemberFor } from "@/lib/user-ownership";
import { reportingDay, activeWorkstream } from "@/lib/home-momentum";
import { workstreamBarStatus } from "@/lib/workstream-parse";
import { createLovableAiGatewayRunIdFetch } from "./morning-brief-run-id.server";

export const BRIEF_OWNER = "chris.falloon@dell.com";
export const BRIEF_RECIPIENT = "chris.falloon@dell.com";

export interface BriefPerson { name: string; contactId?: string; company: string; title: string; temperature?: string; lastContact?: string; campaigns: string[]; events: string[]; status: "matched" | "possible" | "new" | "teammate" }
export interface BriefPortco { name: string; badge: string; priority: string; stage: string; ownership: string; investment: string; round: string; investors: string; workstreams: { name: string; status: string; priority: string; lastActivity: string; update: string; url?: string }[] }
/** Outside (non-PortCo, non-Dell) company the meeting is with. */
export interface BriefCompany {
  name: string; domain: string; about: string; aboutSource: "web" | "general" | ""; sources: string[];
  contacts: { name: string; title: string; temperature?: string; contactId?: string }[]; totalContacts: number;
}
export interface BriefMeeting {
  time: string; title: string; tags: string[]; platform: string; duration: string; cowork: string;
  summary: string; portcos: BriefPortco[]; people: BriefPerson[];
  /** PortCos only mentioned in passing — names and badges, no details. Absent on older briefs. */
  mentionedPortcos?: { name: string; badge: string }[];
  company?: BriefCompany | null;
  actions: { summary: string; due: string; person: string; overdue: boolean }[];
  notes: { title: string; date: string; summary: string; url: string }[];
  events: { name: string; start: string }[];
  worthChecking: string[]; prep: string[];
}
export interface MorningBrief {
  date: string; subject: string; builtAt: string; glance: string; priorities: string[];
  meetings: BriefMeeting[];
  dueThisWeek: { summary: string; person: string; company: string; due: string; overdue: boolean }[];
  quiet: { label: string; detail: string; nextStep: string; link?: string }[];
  campaigns: { id: string; name: string; members: number; contacted: number; inToday: string[] }[];
  events: { urid: string; name: string; start: string; location: string; portcos: string[]; todaysPeople: string[] }[];
  gaps: string; newPeople: { name: string; title: string; company: string }[]; warnings: string[];
}

async function admin() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }

/** Newest Cowork brief email received today (Pacific). */
async function findCoworkEmail(today: string) {
  const { searchGmailRaw } = await import("./gmail.server");
  const { kbMailbox } = await import("./mailbox-oauth.server");
  const res = await searchGmailRaw(`subject:"Daily meeting brief" newer_than:2d`, 5, kbMailbox());
  if (!res.ok) throw new Error(res.error || "Could not read the Workspace inbox.");
  const hits = res.messages
    .filter((m) => m.subject.toLowerCase().includes("daily meeting brief") && reportingDay(new Date(m.date)) === today)
    .sort((a, b) => b.date - a.date);
  return hits[0] || null;
}

async function gather(today: string) {
  const sheets = await import("./sheets.server");
  const asana = await import("./asana.server");
  const camp = await import("./campaigns.server");
  const planner = await import("./event-planner.server");
  const knowledge = await import("./knowledge.server");
  const { fetchHomeMomentum } = await import("./home.functions");
  const warnings: string[] = [];
  const read = async <T,>(label: string, fn: () => Promise<T>, fb: T) => { try { return await fn(); } catch (e) { console.error(`[brief] ${label}`, e); warnings.push(`${label} unavailable`); return fb; } };
  const [contacts, targets, companies] = await Promise.all([read("Network", sheets.buildContacts, []), read("Prospecting", sheets.buildTargets, []), read("PortCos", () => sheets.buildPortfolioCompanies(), [])]);
  const [workstreams, campaigns, members] = await Promise.all([read("Workstreams", asana.fetchPortcoWorkstreams, []), read("Campaigns", camp.listCampaigns, []), read("Campaign members", () => camp.listMembers(), [])]);
  const [events, attendees, records, activities] = await Promise.all([read("Events", () => planner.readPlannerEvents(), []), read("Attendees", planner.readAttendees, []), read("Notes", () => knowledge.listKnowledgeRecords(), []), read("Note steps", knowledge.listHarvestedActivities, [])]);
  const portcoFields = await read("PortCo investment details", asana.fetchPortcoFields, new Map<string, { name: string; fields: Record<string, string> }>());
  const home = await read("Actions", () => fetchHomeMomentum({ data: { email: BRIEF_OWNER, scope: "mine" } }), null);
  void today;
  return { contacts, targets, companies, workstreams, campaigns, members, events, attendees, records, activities, reminders: home?.reminders || [], portcoFields, warnings };
}

type Facts = Awaited<ReturnType<typeof gather>>;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function assemble(text: string, today: string, f: Facts) {
  const cowork = parseCoworkBrief(text);
  const people = [
    ...f.contacts.map((c) => ({ id: c.id, urid: c.urid, name: c.name, company: c.company, email: c.email, title: c.title, temperature: c.portco ? "PortCo" : c.temperature, lastContact: c.lastContact })),
    ...f.targets.map((t) => ({ id: t.id, urid: t.urid, name: t.name, company: t.company, email: t.email, title: t.title, temperature: "Prospecting", lastContact: "" })),
  ];
  const companyNames = f.companies.map((c) => c.name);
  const activeCampaigns = f.campaigns.filter((c) => c.status === "saved" || c.status === "actioning");
  const upcoming = nextEvents(f.events, today, 30, 30);
  const knownOrgs = new Set([...companyNames, ...people.map((p) => p.company), "dt capital", "dtc", "dell technologies capital", "columbia capital"].map(norm).filter(Boolean));
  const portcoKeys = new Set(companyNames.map(norm));
  const invFor = (name: string) => { const co = f.companies.find((c) => c.name === name)!; return investmentStrip({ ...(f.portcoFields.get(name.trim().toLowerCase())?.fields || {}), ...(co.asanaFields || {}) }, co.profileOverrides); };
  const meetings: BriefMeeting[] = cowork.meetings.map((m) => {
    const blob = `${m.title} ${m.text}`;
    const orgs = [...knownOrgs].filter((o) => o.length >= 4);
    const isOrg = (n: string) => { const k = norm(n); return knownOrgs.has(k) || orgs.some((o) => k.startsWith(`${o} `) || k.endsWith(` ${o}`)); };
    const matches = matchPeople(candidateNames(blob).filter((n) => !isOrg(n) || people.some((p) => norm(p.name) === norm(n))), people, (n) => !!teamMemberFor(n));
    const ppl: BriefPerson[] = matches.filter((x) => !x.teammate).map((x) => {
      const c = x.contact;
      const key = c ? norm(c.name) : norm(x.name);
      const inCampaigns = activeCampaigns.filter((cp) => f.members.some((mb) => mb.campaignId === cp.id && norm(mb.name) === key)).map((cp) => cp.name);
      const evs = f.attendees.filter((a) => norm(a.name) === key).map((a) => f.events.find((e) => e.urid === a.eventUrid)).filter((e): e is NonNullable<typeof e> => !!e && daysBetween(e.start, today) <= 365).map((e) => e.name);
      if (c) return { name: c.name, contactId: c.urid || c.id, company: c.company, title: c.title || "", temperature: c.temperature, lastContact: c.lastContact, campaigns: inCampaigns, events: [...new Set(evs)], status: "matched" as const };
      const hint = personHints(x.name, m.text, m.title);
      return { name: x.name, company: x.possible?.[0]?.company || hint.company, title: hint.title, campaigns: inCampaigns, events: [], status: x.possible ? "possible" as const : "new" as const };
    });
    // The meeting's company: a PortCo named in the title, else the outside company
    // from the title ("Matt Darcy, Digital Realty") or the attendees' employer.
    const fromTitle = titleCompany(m.title);
    const outside = (c: string) => !!c && !isInternalOrg(c) && !portcoKeys.has(norm(c)) && !mentionedCompanies(c, companyNames).length;
    const titlePortco = mentionedCompanies(m.title, companyNames).length > 0;
    const extName = titlePortco ? "" : outside(fromTitle) ? fromTitle : (ppl.find((p) => p.status === "matched" && outside(p.company))?.company || "");
    const split = splitPortcos(m.title, m.text, companyNames, { portcoTag: m.tags.some((t) => /portco/i.test(t)), hasExternal: !!extName });
    const portcos: BriefPortco[] = split.primary.map((name) => {
      const inv = invFor(name);
      const ws = f.workstreams.filter((w) => norm(w.company) === norm(name) && !w.completed && activeWorkstream(w));
      return { name, badge: priorityBadge(inv.priority), priority: inv.priority, stage: inv.stage, ownership: inv.ownership, investment: inv.investment, round: inv.round, investors: inv.investors,
        workstreams: ws.map((w) => ({ name: w.name, status: workstreamBarStatus(w), priority: w.workstreamPriority, lastActivity: (w.lastActivity || "").slice(0, 10), update: (w.nextSteps || w.notes || "").slice(0, 220), url: w.url })) };
    });
    const mentionedPortcos = split.mentioned.map((name) => ({ name, badge: priorityBadge(invFor(name).priority) }));
    let company: BriefCompany | null = null;
    if (extName) {
      const k = norm(extName);
      const domain = people.filter((p) => norm(p.company) === k).map((p) => normalizeDomain(p.email)).find((d): d is string => !!d && !isSharedEmailDomain(d)) || "";
      const at = people.filter((p) => norm(p.company) === k || (!!domain && normalizeDomain(p.email) === domain));
      company = { name: extName, domain, about: "", aboutSource: "", sources: [], totalContacts: at.length,
        contacts: at.slice(0, 6).map((p) => ({ name: p.name, title: p.title || "", temperature: p.temperature, contactId: p.urid || p.id })) };
    }
    const keys = new Set([...ppl.map((p) => norm(p.name)), ...portcos.map((p) => norm(p.name)), ...(company ? [norm(company.name)] : [])]);
    const touches = (person: string, company: string) => keys.has(norm(person)) || keys.has(norm(company));
    const actions = f.reminders.filter((r) => touches(r.person, r.company)).slice(0, 6).map((r) => ({ summary: r.summary, due: (r.due || "").slice(0, 10), person: r.person, overdue: !!r.due && r.due.slice(0, 10) < today }));
    const notes = f.records.filter((r) => (keys.has(norm(r.portco)) || [...keys].some((k) => k.includes(" ") && norm(r.participants).includes(k))) && daysBetween(r.date || r.createdAt, today) <= 60)
      .sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 3).map((r) => ({ title: r.title, date: (r.date || "").slice(0, 10), summary: r.summary.slice(0, 400), url: r.sourceUrl }));
    const events = upcoming.filter((e) => e.portcos.some((p) => keys.has(norm(p))) || f.attendees.some((a) => a.eventUrid === e.urid && keys.has(norm(a.name)))).map((e) => ({ name: e.name, start: e.start }));
    return { time: m.time, title: m.title, tags: m.tags, platform: m.platform, duration: m.duration, cowork: stripScheduling(m.text), summary: "", portcos, mentionedPortcos, company, people: ppl, actions, notes, events, worthChecking: [], prep: [] };
  });
  const todayNames = new Set(meetings.flatMap((m) => m.people.map((p) => norm(p.name))));
  const nm = new Set(f.companies.filter((c) => priorityBadge(investmentStrip(f.portcoFields.get(c.name.trim().toLowerCase())?.fields || c.asanaFields, c.profileOverrides).priority) === "NM").map((c) => norm(c.name)));
  const quiet = anticipatedFollowUps({
    today, nmCompanies: nm,
    workstreams: f.workstreams.filter((w) => !w.completed).map((w) => ({ gid: w.gid, company: w.company, name: w.name, lastActivity: w.lastActivity, status: workstreamBarStatus(w), priority: w.workstreamPriority, active: activeWorkstream(w), url: w.url })),
    contacts: f.contacts.filter((c) => !!teamMemberFor(c.prime)?.emails.concat(teamMemberFor(c.prime)?.email || "").some((e) => e.toLowerCase() === BRIEF_OWNER)).map((c) => ({ id: c.id, name: c.name, company: c.company, temperature: c.temperature, lastContact: c.lastContact, portco: c.portco })),
    noteSteps: f.activities.filter((a) => a.type === "follow-up" && teamMemberFor(a.owner)?.email === BRIEF_OWNER).map((a) => ({ id: a.activityId, title: a.title, person: a.person, company: a.portco, date: a.date, resolved: !!a.resolved })),
  });
  const campaigns = activeCampaigns.map((c) => {
    const ms = f.members.filter((m) => m.campaignId === c.id);
    return { id: c.id, name: c.name, members: ms.length, contacted: ms.filter((m) => m.sentDate).length, inToday: ms.filter((m) => todayNames.has(norm(m.name))).map((m) => m.name) };
  });
  const events = upcoming.slice(0, 5).map((e) => ({ urid: e.urid, name: e.name, start: e.start, location: e.location, portcos: e.portcos, todaysPeople: f.attendees.filter((a) => a.eventUrid === e.urid && todayNames.has(norm(a.name))).map((a) => a.name) }));
  const newPeople = meetings.flatMap((m) => m.people.filter((p) => p.status === "new").map((p) => ({ name: p.name, title: p.title, company: p.company })));
  const uniqueNew = [...new Map(newPeople.map((p) => [norm(p.name), p])).values()];
  return { cowork, meetings, quiet, campaigns, events, newPeople: uniqueNew, due: dueThisWeek(f.reminders, today) };
}

const AiSchema = z.object({
  glance: z.string(),
  priorities: z.array(z.string()),
  meetings: z.array(z.object({ index: z.number().int(), summary: z.string(), companyAbout: z.string(), worthChecking: z.array(z.string()), prep: z.array(z.string()) })),
  quiet: z.array(z.object({ index: z.number().int(), nextStep: z.string() })),
});

async function synthesize(input: unknown) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");
  const runId = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" }, fetch: runId.fetch });
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    output: Output.object({ schema: AiSchema }),
    system: `You are V.I.C., chief of staff to a venture investor at Dell Technologies Capital. Write a concise morning brief.
Rules: use ONLY the facts given. Never invent people, numbers or dates. Keep each meeting summary to 2 sentences.
Each meeting is about its "company" (an outside company) or its "portcos" (PortCos named in the title). "mentionedPortcos" only came up in passing: name them if relevant, but never summarise their details, status or workstreams.
Ignore scheduling logistics entirely — offered times, moving or confirming the slot, invites, travel. Focus on discussion topics and relationship history.
"summary": who the meeting is with and what it is about (lead with the company context for outside companies).
"companyAbout": only when the meeting has a "company" whose "about" is empty — one or two sentences on what that company does, from well-established general knowledge; empty string if unsure or there is no company.
"worthChecking": short notes where Outlook context (cowork) conflicts with Venture Pulse facts (e.g. a Back Burner PortCo discussed as a new deal, overdue actions with an attendee, a person not in the CRM). Empty if none.
"prep": 2-4 short, specific prep points per meeting drawn from both sources; no scheduling points.
"priorities": re-rank Cowork's top priorities using Venture Pulse facts (overdue actions, NM PortCos first); drop scheduling-only items (confirming or moving times); keep wording short; max 6.
"glance": one sentence summarising the day.
"quiet": one short suggested next step per quiet item (by index).`,
    prompt: JSON.stringify(input),
    providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
  });
  return await result.output;
}

/** Short web-grounded profile of an outside company (Google Search via Gemini); null when unavailable. */
async function companyProfile(name: string, domain: string): Promise<{ about: string; sources: string[] } | null> {
  const { isGeminiConfigured, geminiGenerate } = await import("./gemini.server");
  if (!isGeminiConfigured()) return null;
  const prompt = `In 2-3 factual sentences for a venture investor, describe the company "${name}"${domain ? ` (website ${domain})` : ""}: what it does, who it serves, size, ownership or HQ, and any notable news from the last six months. Plain text only, no preamble, no markdown. If you cannot identify this exact company, reply only: UNKNOWN`;
  try {
    const resp = await Promise.race([
      geminiGenerate({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ googleSearch: {} }], generationConfig: { maxOutputTokens: 600 + 1024, thinkingConfig: { thinkingBudget: 1024 } } }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 25_000)),
    ]);
    const cand = resp.candidates?.[0];
    const about = (cand?.content?.parts || []).map((p) => (typeof p.text === "string" ? p.text : "")).join("").replace(/\[\d+(,\s*\d+)*\]/g, "").replace(/\s+/g, " ").trim();
    if (!about || /^UNKNOWN\b/i.test(about)) return null;
    const gm = cand?.groundingMetadata as { groundingChunks?: Array<{ web?: { title?: string } }> } | undefined;
    const sources = [...new Set((gm?.groundingChunks || []).map((c) => (c.web?.title || "").trim()).filter(Boolean))].slice(0, 3);
    return { about: about.slice(0, 700), sources };
  } catch (e) { console.error(`[brief] company profile ${name}`, e); return null; }
}

/** Fill each outside company's "about" once per company name, in parallel. */
async function addCompanyProfiles(meetings: BriefMeeting[]) {
  const byName = new Map<string, BriefCompany>();
  for (const m of meetings) if (m.company && !byName.has(norm(m.company.name))) byName.set(norm(m.company.name), m.company);
  const found = new Map<string, { about: string; sources: string[] } | null>();
  await Promise.all([...byName].map(async ([k, c]) => { found.set(k, await companyProfile(c.name, c.domain)); }));
  for (const m of meetings) {
    const p = m.company && found.get(norm(m.company.name));
    if (m.company && p) m.company = { ...m.company, about: p.about, aboutSource: "web", sources: p.sources };
  }
}

/** Build (or rebuild) today's brief. Single-flight per owner/day. */
export async function buildMorningBrief(opts: { force?: boolean; sendEmail?: boolean } = {}) {
  const db = await admin();
  const today = reportingDay(new Date());
  const { data: existing } = await db.from("morning_briefs").select("*").eq("owner_email", BRIEF_OWNER).eq("brief_date", today).maybeSingle();
  if (existing?.status === "ready" && !opts.force) return { ok: true, skipped: "already built", id: existing.id };
  if (existing?.status === "building" && Date.now() - Date.parse(existing.updated_at) < 3 * 60_000) return { ok: true, skipped: "already building" };

  const email = await findCoworkEmail(today);
  if (!email) {
    if (!existing) await db.from("morning_briefs").insert({ owner_email: BRIEF_OWNER, brief_date: today, status: "waiting", error: "Claude Cowork's email hasn't arrived yet." });
    return { ok: true, skipped: "no cowork email yet" };
  }
  const claim = existing
    ? await db.from("morning_briefs").update({ status: "building", source_message_id: email.id, updated_at: new Date().toISOString() }).eq("id", existing.id).eq("updated_at", existing.updated_at).select("id").maybeSingle()
    : await db.from("morning_briefs").insert({ owner_email: BRIEF_OWNER, brief_date: today, status: "building", source_message_id: email.id }).select("id").maybeSingle();
  if (!claim.data) return { ok: true, skipped: "another run claimed it" };
  const id = claim.data.id;
  const text = email.body || email.snippet;
  try {
    const facts = await gather(today);
    const a = assemble(text, today, facts);
    await addCompanyProfiles(a.meetings);
    const ai = await synthesize({
      today, coworkIntro: a.cowork.intro, coworkPriorities: a.cowork.priorities, gaps: a.cowork.gaps,
      meetings: a.meetings.map((m, i) => ({ index: i, time: m.time, title: m.title, tags: m.tags, cowork: m.cowork, company: m.company, portcos: m.portcos, mentionedPortcos: (m.mentionedPortcos || []).map((p) => p.name), people: m.people, openActions: m.actions, recentNotes: m.notes, upcomingEvents: m.events })),
      dueThisWeek: a.due.slice(0, 15), quiet: a.quiet.map((q, i) => ({ index: i, ...q })),
    });
    const brief: MorningBrief = {
      date: today, subject: email.subject, builtAt: new Date().toISOString(), glance: ai.glance,
      priorities: ai.priorities.length ? ai.priorities : a.cowork.priorities,
      meetings: a.meetings.map((m, i) => {
        const x = ai.meetings.find((y) => y.index === i);
        const company = m.company && !m.company.about && x?.companyAbout ? { ...m.company, about: x.companyAbout, aboutSource: "general" as const } : m.company;
        return { ...m, company, summary: x?.summary || "", worthChecking: x?.worthChecking || [], prep: x?.prep || [] };
      }),
      dueThisWeek: a.due, quiet: a.quiet.map((q, i) => ({ label: q.label, detail: q.detail, link: q.link, nextStep: ai.quiet.find((y) => y.index === i)?.nextStep || "" })),
      campaigns: a.campaigns, events: a.events, gaps: a.cowork.gaps, newPeople: a.newPeople, warnings: facts.warnings,
    };
    await db.from("morning_briefs").update({ status: "ready", brief: brief as never, cowork_text: text.slice(0, 50_000), error: "", updated_at: new Date().toISOString() }).eq("id", id);
    if (opts.sendEmail !== false) await sendBriefEmail(id);
    return { ok: true, id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[brief] build failed", e);
    await db.from("morning_briefs").update({ status: "failed", error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", id);
    return { ok: false, error: message };
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const list = (items: string[]) => items.length ? `<ul style="margin:4px 0 8px 18px;padding:0">${items.map((i) => `<li style="margin:2px 0">${i}</li>`).join("")}</ul>` : "";
const h2 = (t: string) => `<h2 style="font-size:15px;margin:20px 0 6px;color:#0b3a6e">${esc(t)}</h2>`;

export function renderBriefHtml(b: MorningBrief, appUrl: string): string {
  const meetings = b.meetings.map((m) => {
    const pc = m.portcos.map((p) => `<div style="background:#f3f6fa;border-radius:6px;padding:8px 10px;margin:6px 0;font-size:12px"><b>${esc(p.name)}</b> ${p.badge ? `[${p.badge}]` : ""} ${esc(p.stage)} · Ownership ${esc(p.ownership)} · Invested ${esc(p.investment)} · Round ${esc(p.round)} · Investors ${esc(p.investors)}${p.workstreams.length ? `<br/>Workstreams: ${p.workstreams.map((w) => `${esc(w.name)} (${esc(w.status)}${w.priority ? `, ${esc(w.priority)}` : ""})`).join("; ")}` : ""}</div>`).join("");
    const ppl = m.people.map((p) => `${esc(p.name)}${p.company ? `, ${esc(p.company)}` : ""}${p.status === "matched" ? ` — ${esc(p.temperature || "")}${p.lastContact ? `, last touch ${esc(p.lastContact.slice(0, 10))}` : ""}` : p.status === "possible" ? " — check: possible match" : " — not in Venture Pulse"}`);
    const co = m.company;
    const coHtml = co ? `<div style="background:#f3f6fa;border-radius:6px;padding:8px 10px;margin:6px 0;font-size:12px"><b>${esc(co.name)}</b>${co.domain ? ` · <a href="https://${esc(co.domain)}">${esc(co.domain)}</a>` : ""}${co.about ? `<br/>${esc(co.about)}` : ""}${co.totalContacts ? `<br/><span style="color:#667">In Venture Pulse: ${co.totalContacts} contact${co.totalContacts === 1 ? "" : "s"} — ${esc(co.contacts.map((c) => c.name).join(", "))}</span>` : `<br/><span style="color:#667">No contacts at ${esc(co.name)} in Venture Pulse yet.</span>`}</div>` : "";
    const mentioned = m.mentionedPortcos?.length ? `<div style="font-size:11px;color:#667">PortCos mentioned: ${m.mentionedPortcos.map((p) => `${esc(p.name)}${p.badge ? ` [${p.badge}]` : ""}`).join(", ")}</div>` : "";
    return `<div style="border-top:1px solid #e3e8ef;padding-top:10px;margin-top:12px">
<div style="font-size:14px;font-weight:bold">${esc(m.time)} · ${esc(m.title)}</div>
<div style="font-size:11px;color:#667">${esc([...m.tags, m.platform, m.duration].filter(Boolean).join(" · "))}</div>
${coHtml}${pc}${mentioned}
${m.summary ? `<p style="margin:6px 0">${esc(m.summary)}</p>` : ""}
<div style="font-size:12px;color:#445"><b>From your Outlook:</b> ${esc(m.cowork)}</div>
${ppl.length ? `<div style="font-size:12px;margin-top:6px"><b>From Venture Pulse — people</b>${list(ppl)}</div>` : ""}
${m.actions.length ? `<div style="font-size:12px"><b>Open actions</b>${list(m.actions.map((a) => `${esc(a.summary)}${a.due ? ` (due ${esc(a.due)}${a.overdue ? ", overdue" : ""})` : ""}`))}</div>` : ""}
${m.notes.length ? `<div style="font-size:12px"><b>Recent notes</b>${list(m.notes.map((n) => `${esc(n.date)} ${esc(n.title)}`))}</div>` : ""}
${m.worthChecking.length ? `<div style="font-size:12px;color:#8a4b00"><b>Worth checking</b>${list(m.worthChecking.map(esc))}</div>` : ""}
${m.prep.length ? `<div style="font-size:12px"><b>Prep</b>${list(m.prep.map(esc))}</div>` : ""}</div>`;
  }).join("");
  return `<!doctype html><html><body style="background:#ffffff;font-family:Arial,sans-serif;color:#1d2433;font-size:13px;max-width:720px;margin:0 auto;padding:16px">
<h1 style="font-size:20px;margin:0 0 4px">Morning Brief — ${esc(b.date)}</h1>
<p style="margin:0 0 10px;color:#445">${esc(b.glance)}</p>
${h2("Top priorities")}<ol style="margin:4px 0 8px 18px;padding:0">${b.priorities.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>
${h2("Meetings")}${meetings}
${h2("Due this week")}${list(b.dueThisWeek.map((d) => `${esc(d.due)} ${d.overdue ? "<b style='color:#b42318'>overdue</b> " : ""}${esc(d.summary)}${d.person ? ` · ${esc(d.person)}` : ""}`)) || "<p>Nothing due.</p>"}
${h2("Anticipated follow-ups")}${list(b.quiet.map((q) => `<b>${esc(q.label)}</b> — ${esc(q.detail)}${q.nextStep ? `. <i>${esc(q.nextStep)}</i>` : ""}`)) || "<p>Nothing has gone quiet.</p>"}
${h2("Active campaigns")}${list(b.campaigns.map((c) => `${esc(c.name)} — ${c.contacted}/${c.members} contacted${c.inToday.length ? ` · today: ${esc(c.inToday.join(", "))}` : ""}`)) || "<p>No active campaigns.</p>"}
${h2("Next DTC events")}${list(b.events.map((e) => `${esc(e.start)} ${esc(e.name)}${e.location ? ` · ${esc(e.location)}` : ""}${e.portcos.length ? ` · ${esc(e.portcos.join(", "))}` : ""}${e.todaysPeople.length ? ` · with ${esc(e.todaysPeople.join(", "))}` : ""}`)) || "<p>No events in the next 30 days.</p>"}
${b.gaps || b.newPeople.length ? h2("Gaps") : ""}${b.gaps ? `<p>${esc(b.gaps)}</p>` : ""}${b.newPeople.length ? `<p>Not in Venture Pulse yet: ${esc(b.newPeople.map((p) => p.name).join(", "))}</p>` : ""}
<p style="margin-top:20px;font-size:12px"><a href="${esc(appUrl)}/brief">Open in Venture Pulse</a></p>
</body></html>`;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** Send the brief once to the Dell address from the Workspace mailbox. */
export async function sendBriefEmail(id: string, force = false) {
  const db = await admin();
  const { data: row } = await db.from("morning_briefs").select("*").eq("id", id).maybeSingle();
  if (!row || row.status !== "ready") return { ok: false, error: "Brief not ready" };
  if (row.email_status === "sent" && !force) return { ok: true, skipped: "already sent" };
  const fail = async (msg: string) => { await db.from("morning_briefs").update({ email_status: "failed", email_error: msg.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", id); return { ok: false, error: msg }; };
  // Sends through the linked Workspace Gmail connection (has gmail.send).
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const gmailKey = process.env["GOOGLE_MAIL_API_KEY"];
  if (!lovableKey || !gmailKey) return fail("The Workspace Gmail connection isn't linked to Venture Pulse.");
  const brief = row.brief as unknown as MorningBrief;
  const html = renderBriefHtml(brief, process.env["APP_URL"] || "https://crm.dt-capital.net");
  const subject = `Morning Brief — ${brief.date} (Venture Pulse)`;
  const mime = [`To: ${BRIEF_RECIPIENT}`, `Subject: =?UTF-8?B?${b64(subject)}?=`, "MIME-Version: 1.0", 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64(html)].join("\r\n");
  const raw = Buffer.from(mime, "utf8").toString("base64url");
  const res = await fetch("https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": gmailKey, "Content-Type": "application/json" }, body: JSON.stringify({ raw }) });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[brief] Gmail send failed [${res.status}]: ${body}`);
    return fail(`Gmail send failed [${res.status}]: ${body.slice(0, 200)}`);
  }
  await db.from("morning_briefs").update({ email_status: "sent", email_error: "", updated_at: new Date().toISOString() }).eq("id", id);
  return { ok: true };
}

export { BRIEF_SUBJECT };

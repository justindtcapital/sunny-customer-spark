// Vic server helpers: gateway provider, auth, and tools. Server-only.
import { createOpenAI } from "@ai-sdk/openai";
import { tool } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { allowedTeamEmail } from "@/lib/team-access";

const RUN_ID = "X-Lovable-AIG-Run-ID";

export function createVicProvider(request: Request) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");
  let runId = request.headers.get(RUN_ID)?.trim() || undefined;
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(RUN_ID)) headers.set(RUN_ID, runId);
      const res = await fetch(input, { ...init, headers });
      runId = runId || res.headers.get(RUN_ID) || undefined;
      return res;
    },
  });
  return { provider, getRunId: () => runId };
}

/** Verify the bearer token belongs to a confirmed teammate; returns an RLS-scoped client. */
export async function authenticateVic(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (token.split(".").length !== 3) return null;
  const url = process.env["SUPABASE_URL"]!, key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const supabase = createClient<Database>(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  const teamEmail = allowedTeamEmail(data.user?.email);
  if (error || !data.user?.email_confirmed_at || !teamEmail) return null;
  return { supabase, userId: data.user.id, teamEmail };
}

const q = (s: string) => s.toLowerCase();
const hit = (needle: string, ...hay: (string | undefined)[]) => {
  const words = q(needle).split(/\s+/).filter(Boolean);
  const text = q(hay.filter(Boolean).join(" "));
  return words.every((w) => text.includes(w));
};

export function vicTools() {
  return {
    searchNetwork: tool({
      description: "Search Network (rated contacts) and Prospecting people by name, company, title, sector or email. Returns up to 25 matches.",
      inputSchema: z.object({ query: z.string().describe("Words to match, e.g. 'CISO healthcare' or 'Maven'"), includeProspects: z.boolean().default(true) }),
      execute: async ({ query, includeProspects }) => {
        const { buildContacts, buildTargets } = await import("./sheets.server");
        const contacts = await buildContacts();
        const net = contacts.filter((c) => hit(query, c.name, c.company, c.title, c.sector, c.email)).slice(0, 25)
          .map((c) => ({ urid: c.urid || "", name: c.name, title: c.title, company: c.company, email: c.email, level: c.temperature, prime: c.prime, list: "Network" }));
        const pros = includeProspects
          ? (await buildTargets()).filter((t) => hit(query, t.name, t.company, t.title, t.sector, t.email)).slice(0, 15)
              .map((t) => ({ urid: t.urid || "", name: t.name, title: t.title, company: t.company, email: t.email, level: "Prospect", list: "Prospecting" }))
          : [];
        return { network: net, prospects: pros };
      },
    }),
    searchPortcos: tool({
      description: "Search portfolio companies (PortCos) by name, sector, location or anything in their summary — e.g. 'vector database', 'healthcare'. Use for 'do any PortCos…' questions. Empty query lists all.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const { buildPortfolioCompanies } = await import("./sheets.server");
        const all = await buildPortfolioCompanies();
        const list = query.trim() ? all.filter((c) => hit(query, c.name, c.sector, c.location, c.description, c.website)) : all;
        return list.slice(0, 60).map((c) => ({ name: c.name, sector: c.sector, website: c.website, location: c.location, summary: (c.description || "").slice(0, 400) }));
      },
    }),
    searchPartners: tool({
      description: "Search Partners (separate from PortCos) by name, category or description.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const { listPartners } = await import("./partners.server");
        const all = await listPartners();
        return all.filter((p) => !query.trim() || hit(query, JSON.stringify(p))).slice(0, 30);
      },
    }),
    searchEvents: tool({
      description: "Search Event Planner events by name, location, PortCo or date (YYYY or YYYY-MM).",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const { readPlannerEvents } = await import("./event-planner.server");
        const all = await readPlannerEvents();
        return all.filter((e) => hit(query, e.name, e.location, e.start, e.portcos.join(" "), e.subcategory, e.status)).slice(0, 30)
          .map((e) => ({ urid: e.urid, name: e.name, start: e.start, end: e.end, location: e.location, status: e.status, category: e.subcategory, portcos: e.portcos }));
      },
    }),
    proposeRelationshipChange: tool({
      description: "PROPOSE (do not perform) promoting, demoting or moving Network contacts to Prospecting. Look the people up with searchNetwork first and pass their exact urid/email/level. The user reviews and approves in the UI.",
      inputSchema: z.object({
        change: z.enum(["promote", "demote", "prospecting"]),
        reason: z.string(),
        contacts: z.array(z.object({ urid: z.string().optional(), name: z.string(), email: z.string(), temperature: z.enum(["Council", "Hot", "Warm", "Cold"]) })).min(1).max(100),
      }),
      execute: async (input) => ({ status: "awaiting_review" as const, ...input }),
    }),
    proposeEmailDraft: tool({
      description: "PROPOSE an email draft for the user to review and open in Outlook. Never sends.",
      inputSchema: z.object({ to: z.array(z.string()).max(20), subject: z.string(), body: z.string() }),
      execute: async (input) => ({ status: "awaiting_review" as const, ...input }),
    }),
  };
}

export function vicInstructions(teamEmail: string, page?: string) {
  return [
    "You are Vic, the Venture Pulse assistant for the Dell Technologies Capital portfolio development team.",
    `You are speaking with ${teamEmail}. Today is ${new Date().toISOString().slice(0, 10)}.`,
    page ? `The user is currently on this app page/context: ${page}. Use it to resolve 'this company', 'this event', etc.` : "",
    "Always ground answers in tool results; name the records you used. If tools return nothing relevant, say so — never invent people, companies, numbers or facts.",
    "You cannot change data directly. For any change, call a propose* tool; the user reviews and approves it in the app. Say clearly that the change is awaiting their review.",
    "Look people up with searchNetwork before proposing relationship changes, and only include exact matches. If a name is ambiguous, ask.",
    "Be concise. Use short markdown lists and tables where helpful.",
  ].filter(Boolean).join("\n");
}

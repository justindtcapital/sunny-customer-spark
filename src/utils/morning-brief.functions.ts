import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MorningBrief } from "./morning-brief.server";

const OWNER = "chris.falloon@dell.com";
function isOwner(claims: unknown) {
  const email = String((claims as { email?: string })?.email || "").toLowerCase();
  return email === OWNER;
}

export interface BriefRow { id: string; date: string; status: string; error: string; emailStatus: string; emailError: string; brief: MorningBrief | null; updatedAt: string }

/** The signed-in owner's briefs (RLS limits rows to their own email). */
export const fetchMorningBriefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number }) => z.object({ limit: z.number().int().min(1).max(30).optional() }).parse(d || {}))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("morning_briefs").select("id, brief_date, status, error, email_status, email_error, brief, updated_at").order("brief_date", { ascending: false }).limit(data.limit || 1);
    if (error) throw new Error(error.message);
    return { owner: isOwner(context.claims), briefs: (rows || []).map((r): BriefRow => ({ id: r.id, date: r.brief_date, status: r.status, error: r.error, emailStatus: r.email_status, emailError: r.email_error, brief: r.status === "ready" ? (r.brief as unknown as MorningBrief) : null, updatedAt: r.updated_at })) };
  });

/** Owner-only: build today's brief now (rebuild replaces today's). */
export const rebuildMorningBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { force?: boolean; sendEmail?: boolean }) => z.object({ force: z.boolean().optional(), sendEmail: z.boolean().optional() }).parse(d || {}))
  .handler(async ({ data, context }) => {
    if (!isOwner(context.claims)) throw new Error("Only the brief owner can rebuild it.");
    const { buildMorningBrief } = await import("./morning-brief.server");
    return buildMorningBrief({ force: data.force ?? true, sendEmail: data.sendEmail ?? false });
  });

/** Owner-only: (re)send a brief to the Dell address. */
export const emailMorningBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!isOwner(context.claims)) throw new Error("Only the brief owner can send it.");
    const { sendBriefEmail } = await import("./morning-brief.server");
    return sendBriefEmail(data.id, true);
  });

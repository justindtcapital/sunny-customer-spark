import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { WHATSAPP_WEBHOOK_URL, normalizeWhatsAppPhone } from "@/lib/whatsapp";
import { requireTeamAuth } from "./team-auth";

export interface WhatsAppLinkStatus {
  phoneE164: string | null;
  threadId: string | null;
  lastMessageAt: string | null;
  webhookUrl: string;
  configured: boolean;
}

export const getMyWhatsAppLinkFn = createServerFn({ method: "GET" })
  .middleware([requireTeamAuth])
  .handler(async ({ context }): Promise<WhatsAppLinkStatus> => {
    const configured = Boolean(
      process.env["TWILIO_ACCOUNT_SID"]?.trim() && process.env["TWILIO_AUTH_TOKEN"]?.trim(),
    );
    const { data, error } = await context.supabase
      .from("vic_whatsapp_links")
      .select("phone_e164,thread_id,last_message_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Couldn't load WhatsApp settings.");
    return {
      phoneE164: data?.phone_e164 ?? null,
      threadId: data?.thread_id ?? null,
      lastMessageAt: data?.last_message_at ?? null,
      webhookUrl: WHATSAPP_WEBHOOK_URL,
      configured,
    };
  });

const savePhoneSchema = z.object({ phone: z.string().min(7).max(40) });

export const saveMyWhatsAppLinkFn = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((d: z.input<typeof savePhoneSchema>) => savePhoneSchema.parse(d))
  .handler(async ({ data, context }): Promise<WhatsAppLinkStatus> => {
    const phoneE164 = normalizeWhatsAppPhone(data.phone);
    if (!phoneE164) {
      throw new Error("Enter a valid phone number with country code (for example +1 555 123 4567).");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: taken } = await supabaseAdmin
      .from("vic_whatsapp_links")
      .select("user_id")
      .eq("phone_e164", phoneE164)
      .maybeSingle();
    if (taken && taken.user_id !== context.userId) {
      throw new Error("That WhatsApp number is already linked to another teammate.");
    }

    const now = new Date().toISOString();
    const { data: saved, error } = await context.supabase
      .from("vic_whatsapp_links")
      .upsert(
        { user_id: context.userId, team_email: context.teamEmail, phone_e164: phoneE164, updated_at: now },
        { onConflict: "user_id" },
      )
      .select("phone_e164,thread_id,last_message_at")
      .single();
    if (error || !saved) throw new Error("Couldn't save your WhatsApp number.");
    return {
      phoneE164: saved.phone_e164,
      threadId: saved.thread_id,
      lastMessageAt: saved.last_message_at,
      webhookUrl: WHATSAPP_WEBHOOK_URL,
      configured: Boolean(
        process.env["TWILIO_ACCOUNT_SID"]?.trim() && process.env["TWILIO_AUTH_TOKEN"]?.trim(),
      ),
    };
  });

export const unlinkMyWhatsAppFn = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("vic_whatsapp_links")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error("Couldn't unlink your WhatsApp number.");
    return { ok: true };
  });
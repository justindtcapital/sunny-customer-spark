import { createHmac, timingSafeEqual } from "crypto";
import { convertToModelMessages, generateText, stepCountIs, type UIMessage } from "ai";
import type { Json } from "@/integrations/supabase/types";
import {
  WHATSAPP_APP_ORIGIN,
  detectTwilioChannel,
  formatSmsReply,
  formatTwilioAddress,
  formatWhatsAppReply,
  normalizeWhatsAppPhone,
  splitWhatsAppMessage,
} from "@/lib/whatsapp";

/** Twilio's official X-Twilio-Signature HMAC-SHA1 computation for form POST webhooks. */
export function computeTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  let payload = url;
  for (const key of Object.keys(params).sort()) {
    payload += key + (params[key] ?? "");
  }
  return createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Candidate public URLs Twilio may have signed against (accounts for proxy/custom-domain headers). */
export function candidateWebhookUrls(request: Request): string[] {
  const parsed = new URL(request.url);
  const pathAndQuery = `${parsed.pathname}${parsed.search}`;
  const urls = new Set<string>([request.url]);
  const fwdHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = fwdHost || request.headers.get("host")?.trim();
  const fwdProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (host) {
    urls.add(`https://${host}${pathAndQuery}`);
    if (fwdProto && fwdProto !== "https") urls.add(`${fwdProto}://${host}${pathAndQuery}`);
  }
  urls.add(`${WHATSAPP_APP_ORIGIN}${pathAndQuery}`);
  urls.add(`https://sunny-customer-spark.lovable.app${pathAndQuery}`);
  return [...urls];
}

/** Verify Twilio's X-Twilio-Signature header against TWILIO_AUTH_TOKEN. */
export function verifyTwilioWebhookSignature(
  request: Request,
  params: Record<string, string>,
  authToken: string,
): boolean {
  const sig = request.headers.get("x-twilio-signature")?.trim();
  if (!sig || !authToken) return false;
  return candidateWebhookUrls(request).some((url) => safeEqual(sig, computeTwilioSignature(authToken, url, params)));
}

/** Send an SMS or WhatsApp reply back through Twilio's REST API, chunked under Twilio's 1,600-char limit. */
export async function sendWhatsAppReply(opts: {
  to: string;
  from: string;
  body: string;
}): Promise<{ ok: boolean; sids: string[]; error?: string }> {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"]?.trim();
  const authToken = process.env["TWILIO_AUTH_TOKEN"]?.trim();
  if (!accountSid || !authToken) {
    console.error("[twilio-whatsapp] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
    return { ok: false, sids: [], error: "Twilio credentials not configured" };
  }
  const channel = detectTwilioChannel(opts.from, opts.to);
  const chunks = splitWhatsAppMessage(opts.body, 1500);
  const sids: string[] = [];
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;

  for (const chunk of chunks) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: formatTwilioAddress(opts.to, channel),
        From: formatTwilioAddress(opts.from, channel),
        Body: chunk,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[twilio-whatsapp] Send failed [${res.status}]: ${errBody}`);
      return { ok: false, sids, error: `Twilio error (${res.status})` };
    }
    const data = (await res.json().catch(() => ({}))) as { sid?: string };
    if (data.sid) sids.push(data.sid);
  }
  return { ok: true, sids };
}

interface WhatsAppLinkRow {
  user_id: string;
  team_email: string;
  phone_e164: string;
  thread_id: string | null;
}

export async function findWhatsAppLink(phoneRaw: string): Promise<WhatsAppLinkRow | null> {
  const phone = normalizeWhatsAppPhone(phoneRaw);
  if (!phone) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("vic_whatsapp_links")
    .select("user_id,team_email,phone_e164,thread_id")
    .eq("phone_e164", phone)
    .maybeSingle();
  if (error) {
    console.error("[twilio-whatsapp] Link lookup failed:", error.message);
    return null;
  }
  return data;
}

export async function resetWhatsAppThread(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("vic_whatsapp_links")
    .update({ thread_id: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}

/** Run one WhatsApp prompt through V.I.C., persist to the teammate's thread, and send the reply. */
export async function handleIncomingWhatsApp(opts: {
  link: WhatsAppLinkRow;
  fromRaw: string;
  toRaw: string;
  body: string;
  messageSid: string;
  request: Request;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { createVicProvider, vicInstructions, vicTools } = await import("./vic-ai.server");
  const channel = detectTwilioChannel(opts.fromRaw, opts.toRaw);
  const channelLabel = channel === "whatsapp" ? "WhatsApp" : "SMS";

  try {
    let threadId = opts.link.thread_id;
    if (threadId) {
      const { data: existing } = await supabaseAdmin
        .from("vic_threads")
        .select("id")
        .eq("id", threadId)
        .maybeSingle();
      if (!existing) threadId = null;
    }
    if (!threadId) {
      const { data: created, error: tErr } = await supabaseAdmin
        .from("vic_threads")
        .insert({ user_id: opts.link.user_id, title: channelLabel })
        .select("id")
        .single();
      if (tErr || !created) throw new Error(tErr?.message || "Could not create V.I.C. thread");
      threadId = created.id;
      await supabaseAdmin
        .from("vic_whatsapp_links")
        .update({ thread_id: threadId, updated_at: new Date().toISOString() })
        .eq("user_id", opts.link.user_id);
    }

    const userMessageId = `wa:${opts.messageSid}`;
    const { data: dup } = await supabaseAdmin
      .from("vic_messages")
      .select("id")
      .eq("thread_id", threadId)
      .eq("message_id", userMessageId)
      .maybeSingle();
    if (dup) return;

    const { data: prevRows } = await supabaseAdmin
      .from("vic_messages")
      .select("message")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(16);

    const userUiMsg: UIMessage = {
      id: userMessageId,
      role: "user",
      parts: [{ type: "text", text: opts.body }],
    };
    await supabaseAdmin.from("vic_messages").upsert(
      {
        thread_id: threadId,
        user_id: opts.link.user_id,
        message_id: userMessageId,
        role: "user",
        message: userUiMsg as unknown as Json,
      },
      { onConflict: "thread_id,message_id" },
    );

    const history: UIMessage[] = [
      ...(prevRows || []).reverse().map((r) => r.message as unknown as UIMessage),
      userUiMsg,
    ];
    const modelMessages = await convertToModelMessages(history).catch(() =>
      history
        .map((m) => ({
          role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
          content: (m.parts || []).map((p) => (p.type === "text" ? p.text : "")).join(" ").trim(),
        }))
        .filter((m) => m.content),
    );

    const { provider } = createVicProvider(opts.request);
    const channelNotes = [
      channel === "whatsapp" ? "Channel: WhatsApp mobile chat." : "Channel: SMS text message.",
      "Keep answers concise and easy to scan on a phone screen using short bullet points (do not use markdown tables).",
      "If you call any propose* tool to prepare a CRM update, briefly summarize the proposal and note that they can tap the Venture Pulse link below to review and approve it.",
    ].join(" ");

    const result = await generateText({
      model: provider.responses("openai/gpt-6-astra"),
      system: `${vicInstructions(opts.link.team_email, channelLabel)}\n${channelNotes}`,
      messages: modelMessages,
      tools: vicTools({ teamEmail: opts.link.team_email, kbFolderIds: [] }),
      stopWhen: stepCountIs(20),
      abortSignal: AbortSignal.timeout(45_000),
      providerOptions: { openai: { store: false, reasoningEffort: "low" } },
    });

    const parts: Array<Record<string, unknown>> = [];
    let hasProposal = false;
    for (const step of result.steps || []) {
      for (const tr of step.toolResults || []) {
        const output = tr.output as Record<string, unknown> | null | undefined;
        if (output && typeof output === "object" && output["status"] === "awaiting_review") {
          hasProposal = true;
        }
        parts.push({
          type: `tool-${tr.toolName}`,
          toolCallId: tr.toolCallId,
          state: "output-available",
          input: tr.input,
          output: tr.output,
        });
      }
    }

    const rawReply = result.text.trim() || "I checked your records but didn't have a clear answer to send back. Try rephrasing or opening V.I.C. in Venture Pulse.";
    parts.push({ type: "text", text: rawReply });

    const assistantMsgId = `wa-reply:${opts.messageSid}`;
    const now = new Date().toISOString();
    await supabaseAdmin.from("vic_messages").upsert(
      {
        thread_id: threadId,
        user_id: opts.link.user_id,
        message_id: assistantMsgId,
        role: "assistant",
        message: { id: assistantMsgId, role: "assistant", parts } as unknown as Json,
      },
      { onConflict: "thread_id,message_id" },
    );
    await Promise.all([
      supabaseAdmin.from("vic_threads").update({ updated_at: now }).eq("id", threadId),
      supabaseAdmin.from("vic_whatsapp_links").update({ last_message_at: now, updated_at: now }).eq("user_id", opts.link.user_id),
    ]);

    let outgoing = channel === "whatsapp" ? formatWhatsAppReply(rawReply) : formatSmsReply(rawReply);
    if (hasProposal) {
      outgoing += `\n\nReview & approve in Venture Pulse: ${WHATSAPP_APP_ORIGIN}/vic/${threadId}`;
    }
    await sendWhatsAppReply({ to: opts.fromRaw, from: opts.toRaw, body: outgoing });
  } catch (err) {
    console.error("[twilio-whatsapp] Processing failed:", err);
    await sendWhatsAppReply({
      to: opts.fromRaw,
      from: opts.toRaw,
      body: "Sorry, I hit a snag looking that up. Try again in a moment, or open V.I.C. in Venture Pulse.",
    }).catch(() => {});
  }
}
import { createFileRoute } from "@tanstack/react-router";
import { WHATSAPP_APP_ORIGIN, isWhatsAppResetCommand, twimlMessage } from "@/lib/whatsapp";

const XML_HEADERS = { "Content-Type": "text/xml; charset=utf-8" };

function xmlResponse(text?: string, status = 200): Response {
  return new Response(twimlMessage(text), { status, headers: XML_HEADERS });
}

export const Route = createFileRoute("/api/public/twilio-whatsapp")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, channel: "twilio-whatsapp" }),
      POST: async ({ request }) => {
        const authToken = process.env["TWILIO_AUTH_TOKEN"]?.trim();
        const accountSid = process.env["TWILIO_ACCOUNT_SID"]?.trim();
        if (!authToken || !accountSid) {
          return new Response("Twilio WhatsApp is not configured", { status: 503 });
        }

        const rawBody = await request.text();
        const form = new URLSearchParams(rawBody);
        const params: Record<string, string> = {};
        form.forEach((value, key) => {
          params[key] = value;
        });

        const {
          findWhatsAppLink,
          handleIncomingWhatsApp,
          resetWhatsAppThread,
          verifyTwilioWebhookSignature,
        } = await import("@/utils/twilio-whatsapp.server");

        if (!verifyTwilioWebhookSignature(request, params, authToken)) {
          console.warn("[twilio-whatsapp] Rejected request with invalid signature");
          return new Response("Invalid signature", { status: 403 });
        }

        const fromRaw = params["From"] || "";
        const toRaw = params["To"] || "";
        const body = (params["Body"] || "").trim();
        const messageSid = params["MessageSid"] || `wa-${Date.now()}`;

        if (!fromRaw || !toRaw) return xmlResponse();

        const link = await findWhatsAppLink(fromRaw);
        if (!link) {
          return xmlResponse(
            `This WhatsApp number isn't linked to a Venture Pulse account yet. Open V.I.C. (${WHATSAPP_APP_ORIGIN}/vic) and connect your number in the left menu.`,
          );
        }

        if (!body) {
          return xmlResponse("I can read text messages right now — send me a question or update in text.");
        }

        if (isWhatsAppResetCommand(body)) {
          await resetWhatsAppThread(link.user_id);
          return xmlResponse("Started a fresh V.I.C. chat. What can I help with?");
        }

        const { runInBackground } = await import("@/utils/background.server");
        await runInBackground(
          handleIncomingWhatsApp({ link, fromRaw, toRaw, body, messageSid, request }),
        );
        return xmlResponse();
      },
    },
  },
});
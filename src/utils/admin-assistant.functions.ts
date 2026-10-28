import { createServerFn } from "@tanstack/react-start";
import { requireTeamAuth } from "./team-auth";

export interface AssistantTurn { role: "user" | "assistant"; text: string }
export interface AssistantReply {
  reply: string;
  draft: { kind: "fix" | "feature"; title: string; description: string; lovablePrompt: string; priority: string; effort: string } | null;
  error: string;
}

const INSTRUCTIONS = `You are the Venture Pulse troubleshooting assistant inside the Admin tab of Venture Pulse, a CRM and portfolio-operations app for DT Capital (pages: Home with Tell/Ask Venture Pulse, Network, Prospecting, My Actions, Events planner, PortCo, Partners, Campaigns builder, Dashboard with Notes Imports and Activity Review, Admin).
Help teammates: explain how a process works, diagnose what they are seeing, and when they report a problem or want something new, turn it into a ticket.
You CANNOT change the app yourself. Never claim a fix is live. A builder will implement tickets in Lovable.
Ask at most one short clarifying question when the issue is unclear. Keep replies under 120 words, plain language.
When you have enough detail for a ticket, set draft: kind "fix" for something broken, "feature" for new or changed behaviour; title short; description of what the user sees and expects; lovablePrompt a precise, self-contained build instruction for Lovable naming the page and expected behaviour; priority low|medium|high; effort small|medium|large (your best guess of build size). Otherwise draft is null.`;

export const askAdminAssistantFn = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((input: { turns: AssistantTurn[]; page?: string }) => ({
    turns: (input.turns || []).slice(-20).map((t) => ({ role: t.role === "assistant" ? "assistant" : "user", text: String(t.text || "").slice(0, 6000) })) as AssistantTurn[],
    page: String(input.page || "").slice(0, 200),
  }))
  .handler(async ({ data }): Promise<AssistantReply> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { reply: "", draft: null, error: "The assistant is not configured." };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Lovable-API-Key": key, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        store: false,
        stream: true,
        reasoning: { effort: "low" },
        instructions: INSTRUCTIONS + (data.page ? `\nUser came from page: ${data.page}` : ""),
        input: data.turns.map((t) => ({ role: t.role, content: t.text })),
        text: { format: { type: "json_schema", name: "reply", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["reply", "draft"],
          properties: {
            reply: { type: "string" },
            draft: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false,
              required: ["kind", "title", "description", "lovablePrompt", "priority", "effort"],
              properties: {
                kind: { type: "string", enum: ["fix", "feature"] }, title: { type: "string" }, description: { type: "string" },
                lovablePrompt: { type: "string" }, priority: { type: "string", enum: ["low", "medium", "high"] },
                effort: { type: "string", enum: ["small", "medium", "large"] },
              } }] },
          },
        } } },
      }),
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      console.error("admin assistant failed", res.status, body.slice(0, 500));
      if (res.status === 402) return { reply: "", draft: null, error: "AI credits are used up — add credits to keep using the assistant." };
      if (res.status === 429) return { reply: "", draft: null, error: "Too many requests — try again in a moment." };
      return { reply: "", draft: null, error: "The assistant couldn't answer right now." };
    }
    // Consume the SSE stream server-side and keep the final text.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload) as { type?: string; delta?: string };
          if (ev.type === "response.output_text.delta" && ev.delta) text += ev.delta;
        } catch { /* ignore partial */ }
      }
    }
    try {
      const o = JSON.parse(text) as { reply: string; draft: AssistantReply["draft"] };
      return { reply: o.reply || "", draft: o.draft || null, error: "" };
    } catch {
      return { reply: "", draft: null, error: "The assistant returned an unreadable answer. Try again." };
    }
  });

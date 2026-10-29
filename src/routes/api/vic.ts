import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/vic")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateVic, createVicProvider, vicInstructions, vicTools } = await import("@/utils/vic-ai.server");
        const auth = await authenticateVic(request);
        if (!auth) return Response.json({ error: "Verified team sign-in required." }, { status: 401 });

        const body = (await request.json()) as { id?: string; threadId?: string; messages?: UIMessage[]; page?: string; kbFolderIds?: unknown };
        const threadId = body.threadId || body.id;
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (!threadId || messages.length === 0) return Response.json({ error: "Missing thread or messages." }, { status: 400 });

        const { data: thread } = await auth.supabase.from("vic_threads").select("id,title").eq("id", threadId).maybeSingle();
        if (!thread) return Response.json({ error: "Chat not found." }, { status: 404 });

        // Save the newest user message before calling the model.
        const last = messages[messages.length - 1];
        if (last?.role === "user") {
          const { error } = await auth.supabase.from("vic_messages").upsert(
            { thread_id: threadId, user_id: auth.userId, message_id: last.id, role: "user", message: last as unknown as Json },
            { onConflict: "thread_id,message_id" },
          );
          if (error) console.error("[vic] save user message failed", error);
          if (thread.title === "New chat") {
            const text = last.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
            if (text) await auth.supabase.from("vic_threads").update({ title: text.slice(0, 80) }).eq("id", threadId);
          }
        }

        const { provider, getRunId } = createVicProvider(request);
        const result = streamText({
          model: provider.responses("openai/gpt-6-astra"),
          system: vicInstructions(auth.teamEmail, body.page),
          messages: await convertToModelMessages(messages),
          tools: vicTools({ teamEmail: auth.teamEmail, kbFolderIds: Array.isArray(body.kbFolderIds) ? body.kbFolderIds.filter((x): x is string => typeof x === "string" && /^[\w-]{10,80}$/.test(x)).slice(0, 20) : [] }),
          stopWhen: stepCountIs(8),
          abortSignal: request.signal,
          providerOptions: { openai: { store: false, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] } },
        });

        const response = result.toUIMessageStreamResponse({
          originalMessages: messages,
          sendReasoning: true,
          onError: (e) => {
            console.error("[vic] stream error", e);
            return e instanceof Error ? e.message : "Vic hit an error.";
          },
          onFinish: async ({ responseMessage }) => {
            const { error } = await auth.supabase.from("vic_messages").upsert(
              { thread_id: threadId, user_id: auth.userId, message_id: responseMessage.id, role: "assistant", message: responseMessage as unknown as Json },
              { onConflict: "thread_id,message_id" },
            );
            if (error) console.error("[vic] save assistant message failed", error);
            await auth.supabase.from("vic_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
          },
        });
        const runId = getRunId();
        if (runId) response.headers.set("X-Lovable-AIG-Run-ID", runId);
        return response;
      },
    },
  },
});

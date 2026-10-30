import { createServerFn } from "@tanstack/react-start";

/** Speech-to-text for the homepage Tell/Ask capture window. */
export const transcribeAudioFn = createServerFn({ method: "POST" })
  .inputValidator((input: { base64: string; mimeType: string }) => {
    if (!input.base64 || input.base64.length > 20_000_000) throw new Error("Recording missing or too long");
    return input;
  })
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Transcription is not configured");
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const type = data.mimeType.split(";")[0] || "audio/webm";
    const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), `voice.${ext}`);
    form.append("model", "openai/gpt-transcribe");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("transcribe failed", res.status, body.slice(0, 500));
      if (res.status === 402) return { text: "", error: "AI credits are used up — add credits to keep transcribing." };
      if (res.status === 429) return { text: "", error: "Too many requests — try again in a moment." };
      return { text: "", error: "Couldn't transcribe the recording." };
    }
    const json = (await res.json()) as { text?: string };
    return { text: (json.text || "").trim(), error: "" };
  });

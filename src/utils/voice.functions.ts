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

export interface VoiceTags {
  summary: string;
  portcos: string[];
  portcoOptions: string[];
  contacts: { name: string; email: string; company: string; where: string }[];
  followUps: { action: string; dueDate: string }[];
}

/** Suggest PortCo / contact / follow-up tags for a voice or typed update. */
export const analyzeVoiceFn = createServerFn({ method: "POST" })
  .inputValidator((input: { text: string }) => ({ text: String(input?.text || "").slice(0, 20_000) }))
  .handler(async ({ data }): Promise<VoiceTags> => {
    const { matchCandidates } = await import("./knowledge-harvest.server");
    const { extractKnowledge } = await import("./knowledge.server");
    const { searchPeople } = await import("./notes-inbox.server");
    const cand = await matchCandidates();
    const ex = await extractKnowledge(data.text, "Voice update", cand.names, cand.workstreams);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const said = norm(data.text);
    const portcos = new Set<string>();
    if (ex.portco) portcos.add(ex.portco);
    for (const n of cand.names) if (norm(n).length >= 3 && said.includes(norm(n))) portcos.add(n);
    const contacts: VoiceTags["contacts"] = [];
    for (const p of ex.people.slice(0, 8)) {
      const hit = (await searchPeople(p.email || p.name)).find((m) => (p.email && m.email.toLowerCase() === p.email.toLowerCase()) || norm(m.name) === norm(p.name));
      if (hit && !contacts.some((c) => c.email === hit.email)) contacts.push(hit);
      else if (!hit) contacts.push({ name: p.name, email: p.email, company: p.company, where: "New" });
    }
    return {
      summary: ex.summary,
      portcos: [...portcos],
      portcoOptions: cand.names.sort((a, b) => a.localeCompare(b)),
      contacts,
      followUps: ex.nextSteps.map((n) => ({ action: n.action, dueDate: n.dueDate })),
    };
  });

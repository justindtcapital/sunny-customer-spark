import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, Square, Loader2, MessageSquarePlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { transcribeAudioFn } from "@/utils/voice.functions";
import { uploadNoteFn } from "@/utils/knowledge.functions";
import { submitQuery } from "@/utils/llm.functions";
import { MarkdownMessage } from "@/components/query/MarkdownMessage";
import { toast } from "sonner";

type Mode = "tell" | "ask";

function toBase64(buf: ArrayBuffer) {
  let s = "";
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function VoiceCaptureTiles({ email }: { email: string }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const tiles = [
    { m: "tell" as const, Icon: MessageSquarePlus, title: "Tell Venture Pulse", sub: "Voice or text update — conversation, follow-up, workstream note" },
    { m: "ask" as const, Icon: Sparkles, title: "Ask Venture Pulse", sub: "Voice or text question across Network, PortCos, events, notes & workstreams" },
  ];
  return <>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {tiles.map((t) => <Button key={t.m} variant="outline" onClick={() => setMode(t.m)} className="group h-auto items-center justify-start gap-4 whitespace-normal rounded-lg bg-card p-4 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><t.Icon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><span className="block font-display text-sm font-semibold">{t.title}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{t.sub}</span></span>
        <Mic className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
      </Button>)}
    </div>
    {mode && <CaptureDialog key={mode} mode={mode} email={email} onClose={() => setMode(null)} />}
  </>;
}

function CaptureDialog({ mode, email, onClose }: { mode: Mode; email: string; onClose: () => void }) {
  const transcribe = useServerFn(transcribeAudioFn);
  const upload = useServerFn(uploadNoteFn);
  const ask = useServerFn(submitQuery);
  const client = useQueryClient();
  const [text, setText] = useState("");
  const [title, setTitle] = useState(`Voice update — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState<"" | "transcribing" | "saving" | "asking">("");
  const [answer, setAnswer] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        if (!blob.size) return;
        setBusy("transcribing");
        try {
          const res = await transcribe({ data: { base64: toBase64(await blob.arrayBuffer()), mimeType: blob.type } });
          if (res.error) toast.error(res.error);
          else setText((t) => (t ? `${t} ${res.text}` : res.text));
        } catch { toast.error("Couldn't transcribe the recording"); } finally { setBusy(""); }
      };
      r.start();
      rec.current = r;
      setRecording(true);
    } catch { toast.error("Microphone access was blocked"); }
  }
  function stop() { rec.current?.stop(); setRecording(false); }

  async function save() {
    setBusy("saving");
    try {
      const body = text.trim();
      const name = `${title.trim() || "Voice update"}.txt`;
      await upload({ data: { name, text: body, base64: toBase64(new TextEncoder().encode(body).buffer as ArrayBuffer), mimeType: "text/plain", importedBy: email } });
      await client.invalidateQueries({ queryKey: ["home-momentum"] });
      toast.success("Saved — waiting in Notes & Activity for review");
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save the update"); } finally { setBusy(""); }
  }

  async function runAsk() {
    setBusy("asking");
    try {
      const res = await ask({ data: { prompt: text.trim(), sessionId, user: email } });
      setSessionId(res.meta.sessionId);
      const o = res.outcome;
      setAnswer(o.status === "complete" ? o.answer : o.status === "error" ? `Couldn't answer: ${o.error}` : "This needs a follow-up step — open the full Query page to continue.");
    } catch { toast.error("Couldn't reach Venture Pulse"); } finally { setBusy(""); }
  }

  const tell = mode === "tell";
  return <Dialog open onOpenChange={(o) => { if (!o) { if (recording) stop(); onClose(); } }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle className="font-display">{tell ? "Tell Venture Pulse" : "Ask Venture Pulse"}</DialogTitle>
        <DialogDescription>{tell ? "Record or type an update. Review and edit it, then save — it goes to Notes & Activity for tagging." : "Record or type a question. Venture Pulse searches the whole platform."}</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button type="button" size="lg" variant={recording ? "destructive" : "default"} className="rounded-full" disabled={!!busy && !recording} onClick={recording ? stop : start}>
            {recording ? <><Square className="mr-2 h-4 w-4" />Stop</> : <><Mic className="mr-2 h-4 w-4" />Record</>}
          </Button>
          <span className="text-xs text-muted-foreground">{recording ? <span className="inline-flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />Listening…</span> : busy === "transcribing" ? <span className="inline-flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Transcribing…</span> : "Tap Record, or type below"}</span>
        </div>
        {tell && <Input aria-label="Update title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (add NWK for network notes)" />}
        <Textarea aria-label={tell ? "Update text" : "Question"} rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={tell ? "e.g. Met Sarah at Acme about MavenAGI pilot — follow up next Tuesday with pricing." : "e.g. What's the latest with MavenAGI and who should I introduce them to?"} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {tell
            ? <Button disabled={!text.trim() || !!busy || recording} onClick={save}>{busy === "saving" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save update</Button>
            : <Button disabled={!text.trim() || !!busy || recording} onClick={runAsk}>{busy === "asking" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ask</Button>}
        </div>
        {!tell && busy === "asking" && <p className="text-xs text-muted-foreground">Searching across Venture Pulse… this can take up to a minute.</p>}
        {!tell && answer && <div className="rounded-md border border-border bg-muted/40 p-3 text-sm"><MarkdownMessage text={answer} /><p className="mt-3 text-[11px] text-muted-foreground">Ask a follow-up above — it keeps the context.</p></div>}
      </div>
    </DialogContent>
  </Dialog>;
}


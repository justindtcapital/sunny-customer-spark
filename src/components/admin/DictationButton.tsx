import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mic, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { recordWav } from "@/lib/record-wav";
import { transcribeAudioFn } from "@/utils/voice.functions";

export function DictationButton({ disabled, onText, onBusyChange }: {
  disabled: boolean;
  onText: (text: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const transcribe = useServerFn(transcribeAudioFn);
  const [state, setState] = useState<"idle" | "starting" | "recording" | "transcribing">("idle");
  const recorder = useRef<Awaited<ReturnType<typeof recordWav>> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; void recorder.current?.cancel(); recorder.current = null; };
  }, []);

  async function toggle() {
    if (state === "recording") {
      const current = recorder.current;
      recorder.current = null;
      setState("transcribing");
      try {
        const blob = await current?.stop();
        if (!blob || !mounted.current) return;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const result = await transcribe({ data: { base64: btoa(binary), mimeType: blob.type } });
        if (!mounted.current) return;
        if (result.error) toast.error(result.error);
        else if (result.text) onText(result.text);
        else toast.error("No speech detected — please record again");
      } catch (error) {
        if (mounted.current) toast.error(error instanceof Error ? error.message : "Couldn't transcribe the recording");
      } finally {
        if (mounted.current) { setState("idle"); onBusyChange(false); }
      }
      return;
    }
    if (state !== "idle" || disabled) return;
    setState("starting"); onBusyChange(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Voice recording isn't available in this browser");
      const next = await recordWav();
      if (!mounted.current) { await next.cancel(); return; }
      recorder.current = next; setState("recording");
    } catch (error) {
      if (mounted.current) {
        toast.error(error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access was blocked — allow it in your browser to dictate"
          : error instanceof Error ? error.message : "Couldn't start the microphone");
        setState("idle"); onBusyChange(false);
      }
    }
  }

  const label = state === "recording" ? "Stop dictation" : state === "transcribing" ? "Transcribing…" : state === "starting" ? "Opening microphone…" : "Dictate message";
  return <Button type="button" variant={state === "recording" ? "destructive" : "outline"}
    size="icon" className="shrink-0" title={label} aria-label={label} aria-pressed={state === "recording"}
    disabled={disabled || state === "starting" || state === "transcribing"} onClick={() => void toggle()}>
    {state === "recording" ? <Square className="h-4 w-4" /> : state === "idle" ? <Mic className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
  </Button>;
}
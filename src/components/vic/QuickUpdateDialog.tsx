import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DictationButton } from "@/components/admin/DictationButton";
import { createVicThread } from "@/lib/vic-client";

const EXAMPLES = [
  "Follow up with Sarah at AITAN next Tuesday about Dell OEM",
  "Met Halcyon today about GTM strategy — log it",
  "Terra GTM workstream is now Working to Complete",
];

/** "Update V.I.C.": type or say an update; V.I.C. tags it and shows review cards before anything saves. */
export function QuickUpdateButton({ onStarted }: { onStarted?: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [dictating, setDictating] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const id = await createVicThread();
      sessionStorage.setItem(`vic-pending:${id}`, `Update: ${t}`);
      setOpen(false); setText("");
      onStarted?.();
      void navigate({ to: "/vic/$threadId", params: { threadId: id } });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Button size="sm" className="w-full gap-1.5" onClick={() => setOpen(true)}><Zap className="size-3.5" />Update V.I.C.</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Update V.I.C.</DialogTitle>
            <DialogDescription>Tell V.I.C. about a follow-up, an action you took or workstream progress. It tags the people and companies, and nothing saves until you approve.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} className="min-h-[110px]"
              placeholder="e.g. Follow up with Sarah at AITAN next Tuesday"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }} />
            <DictationButton disabled={busy} onBusyChange={setDictating} onText={(t) => setText((v) => (v.trim() ? `${v.trim()} ${t}` : t))} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((x) => (
              <Button key={x} type="button" variant="outline" size="sm" className="h-auto whitespace-normal py-1 text-left text-[11px]" onClick={() => setText(x)}>{x}</Button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={busy || dictating || !text.trim()}>{busy ? "Starting…" : "Send to V.I.C."}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

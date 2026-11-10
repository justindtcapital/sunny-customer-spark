import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DictationButton } from "@/components/admin/DictationButton";
import { completionFollowUp } from "@/lib/completion-follow-up";
import { reportingDay } from "@/lib/home-momentum";

export function CompleteFollowUpForm({ busy, onSave, onCancel }: {
  busy: boolean;
  onSave: (note: string, next?: { date: string; note: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const [dictating, setDictating] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [date, setDate] = useState("");
  const [nextNote, setNextNote] = useState("");
  const submit = async () => {
    try {
      const next = completionFollowUp(flagged, date, nextNote, reportingDay(new Date()));
      await onSave(note, next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't complete the follow-up");
    }
  };
  return <div aria-label="Complete follow-up" className="space-y-3 rounded-md border border-border p-3">
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor="completion-note">What did you do? (optional note)</Label>
      <DictationButton disabled={busy} onBusyChange={setDictating} onText={(text) => setNote((value) => [value.trim(), text.trim()].filter(Boolean).join("\n").slice(0, 4000))} />
    </div>
    <Textarea id="completion-note" value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} rows={3} placeholder='e.g. "Sent the intro deck" or "Already handled on the call"' disabled={busy} />
    <Button type="button" size="sm" variant={flagged ? "secondary" : "outline"} aria-pressed={flagged} disabled={busy} onClick={() => setFlagged((value) => !value)}><Flag className="mr-1.5 h-3.5 w-3.5" />Flag for future follow-up</Button>
    {flagged && <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor="completion-next-date">Follow-up date</Label><Input id="completion-next-date" type="date" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="completion-next-note">Next follow-up (optional)</Label><Input id="completion-next-note" maxLength={500} value={nextNote} disabled={busy} placeholder="e.g. Check for a response" onChange={(e) => setNextNote(e.target.value)} /></div>
    </div>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={busy || dictating || (flagged && !date)} onClick={() => void submit()}>{busy ? "Saving…" : "Save & complete"}</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
    </div>
  </div>;
}
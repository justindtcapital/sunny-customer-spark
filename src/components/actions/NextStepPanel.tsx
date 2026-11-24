import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CalendarPlus, CheckCircle2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DictationButton } from "@/components/admin/DictationButton";
import { scheduleNextStepFn } from "@/utils/actions.functions";
import { reportingDay, type HomeReminder } from "@/lib/home-momentum";
import { nextStepTitle, quickFollowUpDates } from "@/lib/action-thread";
import { withRetry } from "@/lib/follow-up-completion";
import { teamMemberFor } from "@/lib/user-ownership";

const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", timeZone: "UTC" });

/**
 * Shown in the detail pane right after a one-click completion: say what happened
 * (optional) and schedule the next follow-up, then move on to the next action.
 */
export function NextStepPanel({ x, owner, status, canUndo, onUndo, onScheduled, onNext }: {
  x: HomeReminder;
  owner: string;
  status: "saving" | "saved" | "undoing";
  canUndo: boolean;
  onUndo: () => void;
  /** The new follow-up, so the list can show it without re-reading every sheet. */
  onScheduled: (next: HomeReminder | null, logged: boolean) => void;
  onNext?: () => void;
}) {
  const schedule = useServerFn(scheduleNextStepFn);
  const today = useMemo(() => reportingDay(new Date()), []);
  const quick = useMemo(() => quickFollowUpDates(today), [today]);
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [title, setTitle] = useState(() => nextStepTitle(x, (n) => !!teamMemberFor(n)));
  const [busy, setBusy] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [saved, setSaved] = useState<{ date: string; title: string; logged: boolean } | null>(null);
  const priorTitle = x.summary || `Follow-up with ${x.person}`;
  const badDate = !!date && date < today;
  const canSave = (!!note.trim() || (!!date && !!title.trim())) && !badDate;
  const label = date && note.trim() ? "Save note & schedule" : date ? "Schedule follow-up" : "Save note";

  const save = async () => {
    setBusy(true);
    try {
      // Outside people only: the owner is recorded separately.
      const people = (x.people?.length ? x.people.map((p) => p.name || p.email) : [x.contactName || x.person]).filter((n) => n && !teamMemberFor(n));
      const priorId = x.activityId || x.id;
      const next = date && title.trim() ? { date, title: title.trim() } : undefined;
      const res = await withRetry(() => schedule({ data: {
        priorId, priorActivityId: x.activityId || undefined, priorTitle, note: note.trim(), next, actor: owner,
        people, portcos: (x.company || "").split(/\s*,\s*/).filter(Boolean), tracks: x.tracks || [],
      } }));
      const gid = x.workstreamGid || (x.recordId?.startsWith("ws:") ? x.recordId.slice(3) : "");
      onScheduled(next && res.nextId ? {
        id: res.nextId, activityId: res.nextId, recordId: priorId, person: people.join(", ") || next.title, company: x.company, owner: x.owner,
        due: next.date, source: "Notes", summary: next.title, date: new Date().toISOString(), tracks: x.tracks,
        ...(gid ? { workstreamGid: gid } : {}), origin: { label: "Previous step", title: priorTitle, date: today, text: note.trim() },
      } : null, res.logged);
      setSaved({ date: next?.date || "", title: next?.title || "", logged: res.logged });
      toast.success(next ? `Follow-up set for ${shortDay(next.date)}` : "Note saved");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't save the next step — try again in a minute.", { description: e instanceof Error ? e.message : undefined });
    } finally { setBusy(false); }
  };

  return <div role="status" aria-label="Completed — what's next" className="space-y-3 rounded-md border border-good-foreground/30 bg-good/30 p-3">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge className="gap-1 border-transparent bg-good-foreground text-background hover:bg-good-foreground"><CheckCircle2 className="h-3.5 w-3.5" />Completed</Badge>
      <span className="text-muted-foreground">{status === "saving" ? "Saving…" : status === "undoing" ? "Reopening…" : "Saved — removed from your list."}</span>
      <div className="ml-auto flex items-center gap-1">
        {canUndo && <Button size="sm" variant="ghost" className="h-7" disabled={status !== "saved" || busy} onClick={onUndo}><Undo2 className="mr-1 h-3.5 w-3.5" />Undo</Button>}
        {onNext && <Button size="sm" variant="outline" className="h-7" onClick={onNext}>Next action<ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>}
      </div>
    </div>
    {saved ? <p className="text-sm">
      {saved.date ? <>Next follow-up set for <span className="font-semibold">{shortDay(saved.date)}</span>: {saved.title}.</> : null}
      {saved.logged ? <span className="text-muted-foreground">{saved.date ? " " : ""}Your note is saved with this action.</span> : null}
    </p> : <>
      <div className="text-sm font-semibold">What's next?</div>
      <div className="grid gap-3 @2xl:grid-cols-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="next-note" className="text-xs">What happened? <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <DictationButton disabled={busy} onBusyChange={setDictating} onText={(t) => setNote((v) => [v.trim(), t.trim()].filter(Boolean).join("\n").slice(0, 4000))} />
          </div>
          <Textarea id="next-note" rows={2} maxLength={4000} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} placeholder='e.g. "Sent the deck, waiting on their legal team"' className="bg-background" />
        </div>
        <div className="min-w-0 space-y-1">
          <Label className="text-xs">Schedule a follow-up</Label>
          <div className="flex flex-wrap items-center gap-1">
            {quick.map((q) => <Button key={q.label} type="button" size="sm" variant={date === q.date ? "default" : "outline"} aria-pressed={date === q.date} className="h-7 px-2 text-xs" disabled={busy} onClick={() => setDate(date === q.date ? "" : q.date)}>{q.label}</Button>)}
            <Input aria-label="Follow-up date" type="date" min={today} value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} className="h-7 w-36 bg-background text-xs" />
          </div>
          {date && <Input aria-label="Follow-up title" maxLength={300} value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} className="h-8 bg-background text-sm" />}
          {badDate && <p className="text-xs text-destructive">Pick today or a later date.</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || dictating || !canSave} onClick={() => void save()}><CalendarPlus className="mr-1 h-3.5 w-3.5" />{busy ? "Saving…" : label}</Button>
        {onNext && <Button size="sm" variant="ghost" disabled={busy} onClick={onNext}>No follow-up needed</Button>}
      </div>
    </>}
  </div>;
}

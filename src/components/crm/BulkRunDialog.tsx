import { useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2, Circle, Loader2, MinusCircle, XCircle } from "lucide-react";
import type { BulkOutcome } from "@/lib/bulk-operation";

export type RunStep = "validate" | "apply" | "verify" | "done";
export interface ReceiptLine { label: string; reason?: string }
export interface BulkRunState {
  title: string;
  step: RunStep;
  total: number;
  processed: number;
  error?: string;
  receipt?: { done: ReceiptLine[]; skipped: ReceiptLine[]; problems: ReceiptLine[]; doneLabel: string };
}

const STEPS: { key: Exclude<RunStep, "done">; label: string }[] = [
  { key: "validate", label: "Checking selection & reserving the write slot" },
  { key: "apply", label: "Saving changes to Google Sheets" },
  { key: "verify", label: "Reading back to confirm every change" },
];
const ORDER: RunStep[] = ["validate", "apply", "verify", "done"];

/** Turns journaled bulk outcomes into the three receipt groups. */
export function receiptFromOutcomes(outcomes: BulkOutcome[], doneLabel: string): NonNullable<BulkRunState["receipt"]> {
  const line = (o: BulkOutcome) => ({ label: o.label, reason: o.from && o.to ? `${o.from} → ${o.to}` : o.reason });
  return {
    doneLabel,
    done: outcomes.filter(o => o.status === "changed" || o.status === "moved").map(line),
    skipped: outcomes.filter(o => o.status === "already_complete" || o.status === "duplicate" || o.status === "review").map(line),
    problems: outcomes.filter(o => ["blocked", "failed", "uncertain", "pending"].includes(o.status)).map(line),
  };
}

function Group({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: ReceiptLine[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${tone}`}>{icon}{title} · {items.length}</div>
      <ul className="mt-1 space-y-0.5 pl-5 text-xs">
        {items.map((i, n) => <li key={n}><span className="text-foreground">{i.label}</span>{i.reason && <span className="text-muted-foreground"> — {i.reason}</span>}</li>)}
      </ul>
    </div>
  );
}

// Stage 2 (live progress) and Stage 3 (receipt) for every bulk action.
// Can't be dismissed while running so nobody double-clicks or closes mid-save.
export function BulkRunDialog({ state, onClose }: { state: BulkRunState | null; onClose: () => void }) {
  const running = !!state && state.step !== "done";
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);
  if (!state) return null;
  const at = ORDER.indexOf(state.step);
  const pct = state.step === "done" ? 100 : state.total ? Math.max(8, Math.round((state.processed / state.total) * 90)) : at * 30 + 5;
  const r = state.receipt;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !running) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] grid-rows-[auto_auto_1fr_auto]" onInteractOutside={(e) => running && e.preventDefault()} onEscapeKeyDown={(e) => running && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{state.title}</DialogTitle>
          <DialogDescription className="text-xs">
            {running ? "Please keep this window open — it takes a few seconds." : state.error ? "Stopped. Nothing below was guessed — this is what the system confirmed." : "Finished. Here's exactly what happened."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Progress value={pct} />
          {state.total > 0 && <div className="text-right text-[11px] tabular-nums text-muted-foreground">{state.processed} of {state.total}</div>}
          <ol className="space-y-1">
            {STEPS.map((s, i) => {
              const done = at > i, active = at === i && !state.error;
              return (
                <li key={s.key} className="flex items-center gap-2 text-xs">
                  {done ? <CheckCircle2 className="size-4 text-primary" /> : active ? <Loader2 className="size-4 animate-spin text-primary" /> : state.error && at === i ? <XCircle className="size-4 text-destructive" /> : <Circle className="size-4 text-muted-foreground" />}
                  <span className={done || active ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
                </li>
              );
            })}
          </ol>
        </div>
        <ScrollArea className="min-h-0 max-h-[45vh]">
          <div className="space-y-3 pr-3">
            {state.error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{state.error}<div className="mt-1 text-muted-foreground">Progress is recorded in Admin → Bulk activity. If it says “uncertain”, use “Check what was saved & unlock” there before trying again.</div></div>}
            {r && <>
              <Group icon={<CheckCircle2 className="size-3.5" />} title={r.doneLabel} items={r.done} tone="text-primary" />
              <Group icon={<MinusCircle className="size-3.5" />} title="Skipped / no change needed" items={r.skipped} tone="text-muted-foreground" />
              <Group icon={<AlertTriangle className="size-3.5" />} title="Needs attention" items={r.problems} tone="text-destructive" />
            </>}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button onClick={onClose} disabled={running}>{running ? "Working…" : "Close"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

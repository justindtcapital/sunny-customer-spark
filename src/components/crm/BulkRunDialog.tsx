import { useCallback, useEffect, useState } from "react";
import { fetchBulkLockStatus, reconcileImportOperation } from "@/utils/bulk-operations.functions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, RotateCcw, Unlock, CheckCircle2, Circle, Loader2, MinusCircle, XCircle } from "lucide-react";
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
type LockInfo = Awaited<ReturnType<typeof fetchBulkLockStatus>>;
export const isLockBlocked = (msg?: string) => !!msg && /another bulk operation|writes are paused/i.test(msg);

/** Inline recovery when the shared write slot is busy: shows the holder, polls until free, offers safe unlock and retry. */
function LockRecovery({ onRetry }: { onRetry?: () => void }) {
  const [lock, setLock] = useState<LockInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const check = useCallback(async () => { try { setLock(await fetchBulkLockStatus()); } catch { /* keep last */ } }, []);
  useEffect(() => { check(); const t = setInterval(check, 5000); return () => clearInterval(t); }, [check]);
  const unlock = async () => {
    if (!lock?.locked) return;
    setBusy(true); setNote("");
    try {
      const r = await reconcileImportOperation({ data: { id: lock.operationId, apply: true } });
      const saved = r.outcomes.filter(o => o.status === "changed").length;
      setNote(`Earlier import checked: ${saved} saved once, ${r.outcomes.length - saved} not saved or held for review. Unlocked.`);
      await check();
    } catch (e) { setNote(e instanceof Error ? e.message : "Couldn't unlock yet."); }
    finally { setBusy(false); }
  };
  const free = lock && !lock.locked;
  const waitS = lock?.locked ? Math.ceil(lock.waitMs / 1000) : 0;
  return (
    <div className="mt-2 space-y-2 rounded-md border bg-muted/40 p-2 text-xs text-foreground">
      {!lock ? <div className="text-muted-foreground">Checking what's holding things up…</div>
        : free ? <div>The other job has finished — nothing was changed by this attempt, so it's safe to retry.</div>
        : <div>
            Waiting on {lock.actor ? `${lock.actor}'s ` : "another "}{lock.kind.replace(/-/g, " ")} ({lock.status === "uncertain" ? "stopped mid-save, needs a check" : "still running"}).
            {lock.summary && <div className="text-muted-foreground">{lock.summary}</div>}
            {lock.status !== "uncertain" && <div className="text-muted-foreground">This page checks again every few seconds; Retry turns on when it's free.</div>}
          </div>}
      {note && <div className="text-muted-foreground">{note}</div>}
      <div className="flex flex-wrap gap-2">
        {lock?.locked && lock.canReconcile && (
          <Button size="sm" variant="outline" onClick={unlock} disabled={busy || waitS > 0}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Unlock className="size-3.5" />}
            {waitS > 0 ? `Check what was saved & unlock (in ${waitS}s)` : "Check what was saved & unlock"}
          </Button>
        )}
        {onRetry && <Button size="sm" onClick={onRetry} disabled={!free}><RotateCcw className="size-3.5" />Retry</Button>}
      </div>
    </div>
  );
}

export function BulkRunDialog({ state, onClose, onRetry }: { state: BulkRunState | null; onClose: () => void; onRetry?: () => void }) {
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
            {state.error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{state.error}{isLockBlocked(state.error) ? <LockRecovery onRetry={onRetry} /> : <div className="mt-1 text-muted-foreground">Progress is recorded in Admin → Bulk activity. If it says “uncertain”, use “Check what was saved & unlock” there before trying again.</div>}</div>}
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

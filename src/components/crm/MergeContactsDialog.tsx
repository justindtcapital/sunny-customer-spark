import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, ChevronDown, ChevronRight, Combine, Loader2, Merge } from "lucide-react";
import { fetchMergePreview, mergeContacts } from "@/utils/contact-merge.functions";
import { mergeFields, statusOptions, type FieldChoice } from "@/lib/contact-merge";
import { BulkRunDialog, receiptFromOutcomes, type BulkRunState } from "./BulkRunDialog";

type Preview = Awaited<ReturnType<typeof fetchMergePreview>>;

const TIER_ORDER = ["Council", "Hot", "Warm", "Cold", "Prospecting"];

/**
 * Side-by-side merge review: pick the record to keep, the status, and the value
 * for every field that differs. Nothing is written until "Merge" is pressed; the
 * others are archived (not deleted) and the merge can be undone.
 */
export function MergeContactsDialog({ open, urids, onOpenChange, onMerged }: { open: boolean; urids: string[]; onOpenChange: (open: boolean) => void; onMerged: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [keeper, setKeeper] = useState(0);
  const [choices, setChoices] = useState<Record<string, FieldChoice>>({});
  const [status, setStatus] = useState("");
  const [showSame, setShowSame] = useState(false);
  const [run, setRun] = useState<BulkRunState | null>(null);
  const key = urids.join("|");

  useEffect(() => {
    if (!open) return;
    let live = true;
    setPreview(null); setError(""); setChoices({}); setShowSame(false);
    fetchMergePreview({ data: { urids } })
      .then((p) => {
        if (!live) return;
        setPreview(p);
        const network = p.records.map((r, i) => ({ r, i })).filter(({ r }) => r.where === "Network")
          .sort((a, b) => TIER_ORDER.indexOf(a.r.status) - TIER_ORDER.indexOf(b.r.status));
        setKeeper(network[0]?.i ?? 0);
        const opts = statusOptions(p.records.map((r) => ({ urid: r.urid, values: r.values })));
        setStatus(opts.length === 1 ? opts[0] : "");
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "These people could not be loaded."));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  const records = useMemo(() => preview?.records.map((r) => ({ urid: r.urid, values: r.values })) || [], [preview]);
  const fields = useMemo(() => (preview ? mergeFields(preview.headers, records, keeper) : []), [preview, records, keeper]);
  const differing = fields.filter((f) => f.differs);
  const same = fields.filter((f) => !f.differs && f.values.some(Boolean));
  const statuses = useMemo(() => statusOptions(records), [records]);
  const choiceOf = (k: string) => choices[k] ?? fields.find((f) => f.key === k)?.defaultChoice ?? keeper;
  const n = preview?.records.length || 0;

  const doMerge = async () => {
    if (!preview || !status) return;
    const operationId = crypto.randomUUID();
    const finalChoices = Object.fromEntries(differing.map((f) => [f.key, choiceOf(f.key)]));
    setRun({ title: `Merging ${n} people`, step: "validate", total: n, processed: 0 });
    try {
      setRun((r) => r && { ...r, step: "apply" });
      const res = await mergeContacts({ data: {
        operationId, keeperUrid: preview.records[keeper].urid, urids: preview.records.map((r) => r.urid), choices: finalChoices, status: status as "Council",
        seen: Object.fromEntries(preview.records.map((r) => [r.urid, r.fingerprint])),
      } });
      setRun((r) => r && { ...r, step: "done", processed: n, receipt: receiptFromOutcomes(res.outcomes, "Merged") });
      if (res.outcomes.some((o) => o.status === "moved")) onMerged();
    } catch (e) {
      setRun((r) => r && { ...r, error: e instanceof Error ? e.message : "Merge failed. Nothing was changed." });
    }
  };

  if (run) return <BulkRunDialog state={run} onClose={() => { setRun(null); onOpenChange(false); }} onRetry={() => { setRun(null); void doMerge(); }} />;

  const keeperName = preview?.records[keeper]?.name || "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Merge className="h-4 w-4" />Merge {n || urids.length} people into one</DialogTitle>
          <DialogDescription>Choose which details to keep. The other records are archived, not deleted, and you can undo this later.</DialogDescription>
        </DialogHeader>

        {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {!preview && !error && <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading the latest details…</div>}

        {preview && (
          <ScrollArea className="max-h-[62vh] pr-3">
            <div className="space-y-4">
              {/* Record headers: which one to keep */}
              <div className="grid gap-2" style={{ gridTemplateColumns: `9rem repeat(${n}, minmax(0, 1fr))` }}>
                <div className="text-xs font-medium text-muted-foreground self-end pb-1">Main record</div>
                {preview.records.map((r, i) => (
                  <button key={r.urid} type="button" onClick={() => setKeeper(i)}
                    className={`rounded-lg border p-2 text-left transition-colors ${keeper === i ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-sm font-semibold text-foreground">{r.name}</span>
                      {keeper === i && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{r.where}</Badge>
                      {r.where === "Network" && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{r.status}</Badge>}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{keeper === i ? "Kept — keeps its ID" : "Will be archived"}</div>
                  </button>
                ))}
              </div>

              {statuses.length > 1 && (
                <div className={`rounded-lg border p-3 ${status ? "border-border" : "border-primary/50 bg-primary/5"}`}>
                  <div className="text-sm font-medium text-foreground">These records have different statuses. Where should the merged person be?</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {statuses.map((s) => (
                      <Button key={s} type="button" size="sm" variant={status === s ? "default" : "outline"} className="h-8 text-xs" onClick={() => setStatus(s)}>
                        {s === "Prospecting" ? "Prospecting" : `Network · ${s}`}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {differing.length ? `${differing.length} detail${differing.length === 1 ? "" : "s"} differ — click the value to keep` : "No details differ."}
                </div>
                <div className="space-y-1.5">
                  {differing.map((f) => {
                    const choice = choiceOf(f.key);
                    return (
                      <div key={f.key} className="grid items-stretch gap-2" style={{ gridTemplateColumns: `9rem repeat(${n}, minmax(0, 1fr))` }}>
                        <div className="flex flex-col justify-center">
                          <span className="text-xs font-medium text-foreground">{f.label}</span>
                          {f.key === "email" && <span className="text-[10px] text-muted-foreground">All addresses are kept; pick the main one</span>}
                          {f.combinable && f.key !== "email" && (
                            <button type="button" onClick={() => setChoices((c) => ({ ...c, [f.key]: "combine" }))}
                              className={`mt-0.5 inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${choice === "combine" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                              <Combine className="h-3 w-3" />Combine all
                            </button>
                          )}
                        </div>
                        {f.values.map((v, i) => {
                          const selected = choice === i || (choice === "combine" && !!v);
                          return (
                            <button key={i} type="button" disabled={!v} onClick={() => setChoices((c) => ({ ...c, [f.key]: i }))}
                              className={`min-h-9 rounded-md border px-2 py-1.5 text-left text-xs break-words transition-colors disabled:cursor-default ${selected ? "border-primary bg-primary/10 text-foreground" : v ? "border-border text-muted-foreground hover:bg-muted/50" : "border-dashed border-border text-muted-foreground/60"}`}>
                              {v || "—"}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              {same.length > 0 && (
                <div>
                  <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowSame((s) => !s)}>
                    {showSame ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    {same.length} detail{same.length === 1 ? " is" : "s are"} the same or only filled in once — kept automatically
                  </button>
                  {showSame && (
                    <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                      {same.map((f) => (
                        <div key={f.key} className="flex gap-2 text-xs"><span className="w-32 shrink-0 text-muted-foreground">{f.label}</span><span className="truncate text-foreground">{f.values.find(Boolean)}</span></div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{keeperName}</span> stays as the one person. Events, notes, PortCo intros and campaigns from the other record{n > 2 ? "s" : ""} will show on this profile. The other record{n > 2 ? "s are" : " is"} archived (hidden, kept as a backup) and can be restored from <span className="font-medium text-foreground">Find duplicates → Recent merges</span>.
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void doMerge()} disabled={!preview || !status}>
            <Merge className="h-4 w-4 mr-1.5" />{!status && preview ? "Choose a status first" : `Merge ${n || ""} people`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

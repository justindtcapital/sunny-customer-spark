import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Merge, RotateCcw, Users, X } from "lucide-react";
import { toast } from "sonner";
import { dismissDuplicateGroup, fetchDuplicateSuggestions, undoContactMerge } from "@/utils/contact-merge.functions";
import { MAX_MERGE } from "@/lib/contact-merge";
import { MergeContactsDialog } from "./MergeContactsDialog";
import { BulkRunDialog, receiptFromOutcomes, type BulkRunState } from "./BulkRunDialog";

type Data = Awaited<ReturnType<typeof fetchDuplicateSuggestions>>;

/** Suggested duplicates across Network and Prospecting, plus recent merges with Undo. */
export function DuplicatesDialog({ open, onOpenChange, onChanged }: { open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [merging, setMerging] = useState<string[] | null>(null);
  const [confirmUndo, setConfirmUndo] = useState("");
  const [busy, setBusy] = useState("");
  const [run, setRun] = useState<BulkRunState | null>(null);

  const load = useCallback(() => {
    setError("");
    fetchDuplicateSuggestions()
      .then((d) => {
        setData(d);
        setPicked(Object.fromEntries(d.groups.map((g) => [g.key, g.people.slice(0, MAX_MERGE).map((p) => p.urid)])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Suggestions could not be loaded."));
  }, []);
  useEffect(() => { if (open) { setData(null); load(); } }, [open, load]);

  const dismiss = async (key: string) => {
    const g = data?.groups.find((x) => x.key === key);
    if (!g) return;
    setBusy(key);
    try {
      await dismissDuplicateGroup({ data: { urids: g.people.map((p) => p.urid), names: g.people.map((p) => p.name) } });
      setData((d) => d && { ...d, groups: d.groups.filter((x) => x.key !== key), total: d.total - 1 });
      toast.success("Marked as not duplicates — they won't be suggested again.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally { setBusy(""); }
  };

  const undo = async (mergeId: string, name: string) => {
    setConfirmUndo("");
    setRun({ title: `Undoing merge · ${name}`, step: "validate", total: 1, processed: 0 });
    try {
      setRun((r) => r && { ...r, step: "apply" });
      const res = await undoContactMerge({ data: { operationId: crypto.randomUUID(), mergeId } });
      setRun((r) => r && { ...r, step: "done", processed: 1, receipt: receiptFromOutcomes(res.outcomes, "Restored") });
      onChanged();
    } catch (e) {
      setRun((r) => r && { ...r, error: e instanceof Error ? e.message : "Undo failed. Nothing was changed." });
    }
  };

  if (run) return <BulkRunDialog state={run} onClose={() => { setRun(null); load(); }} />;
  if (merging) return <MergeContactsDialog open urids={merging} onOpenChange={(o) => { if (!o) { setMerging(null); load(); } }} onMerged={onChanged} />;

  const fmt = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Find duplicates</DialogTitle>
          <DialogDescription>Possible duplicate people across Network and Prospecting. Nothing changes until you review and merge.</DialogDescription>
        </DialogHeader>
        {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {!data && !error && <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking everyone for duplicates…</div>}
        {data && (
          <Tabs defaultValue="suggested">
            <TabsList>
              <TabsTrigger value="suggested">Suggested · {data.total}</TabsTrigger>
              <TabsTrigger value="recent">Recent merges · {data.merges.length}</TabsTrigger>
            </TabsList>
            <TabsContent value="suggested">
              <ScrollArea className="h-[60vh] pr-3">
                {data.groups.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No likely duplicates found.</p>}
                <div className="space-y-2">
                  {data.groups.map((g) => {
                    const sel = picked[g.key] || [];
                    return (
                      <div key={g.key} className="rounded-lg border border-border p-3">
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant={g.strength === "strong" ? "default" : "secondary"} className="text-[10px]">{g.strength === "strong" ? "Likely" : "Possible"}</Badge>
                          {g.reasons.map((r) => <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>)}
                        </div>
                        <div className="space-y-1">
                          {g.people.map((p) => (
                            <label key={p.urid} className="flex cursor-pointer items-center gap-2 text-xs">
                              <Checkbox checked={sel.includes(p.urid)} onCheckedChange={(c) => setPicked((s) => ({ ...s, [g.key]: c ? [...sel, p.urid] : sel.filter((u) => u !== p.urid) }))} />
                              <span className="font-medium text-foreground">{p.name}</span>
                              <span className="text-muted-foreground truncate">{[p.title, p.company].filter(Boolean).join(" · ")}</span>
                              <span className="text-muted-foreground truncate">{p.email}</span>
                              <Badge variant="secondary" className="ml-auto shrink-0 text-[10px] px-1.5 py-0">{p.where === "Network" ? `Network · ${p.statusLabel}` : "Prospecting"}</Badge>
                            </label>
                          ))}
                        </div>
                        <div className="mt-2 flex justify-end gap-2">
                          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy === g.key} onClick={() => void dismiss(g.key)}>
                            {busy === g.key ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <X className="mr-1 h-3 w-3" />}Not duplicates
                          </Button>
                          <Button size="sm" className="h-7 text-xs" disabled={sel.length < 2 || sel.length > MAX_MERGE} onClick={() => setMerging(sel)}>
                            <Merge className="mr-1 h-3 w-3" />Review & merge
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="recent">
              <ScrollArea className="h-[60vh] pr-3">
                {data.merges.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No merges yet.</p>}
                <div className="space-y-1.5">
                  {data.merges.map((m) => (
                    <div key={m.mergeId} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="truncate"><span className="font-medium text-foreground">{m.keeperName}</span><span className="text-muted-foreground"> ← {m.otherNames}</span></div>
                        <div className="text-[11px] text-muted-foreground">{fmt(m.at)} · {m.by}</div>
                      </div>
                      {m.undone ? <Badge variant="outline" className="text-[10px]">Undone</Badge>
                        : confirmUndo === m.mergeId ? (
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">Make them separate again?</span>
                            <Button size="sm" className="h-7 text-xs" onClick={() => void undo(m.mergeId, m.keeperName)}>Undo</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmUndo("")}>Cancel</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmUndo(m.mergeId)}><RotateCcw className="mr-1 h-3 w-3" />Undo</Button>
                        )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

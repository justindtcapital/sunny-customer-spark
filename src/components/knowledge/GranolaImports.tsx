// Granola Imports — every Granola note Venture Pulse has copied, with Saved /
// Copied to Drive / Transcript checks and a verified "Safe to delete in
// Granola" badge. Venture Pulse never deletes anything in Granola.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ExternalLink, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  fetchGranolaImportsFn,
  syncGranolaFn,
  verifyGranolaImportsFn,
} from "@/utils/knowledge.functions";
import type { GranolaImportStatus } from "@/utils/granola.server";

type Filter = "all" | "safe" | "attention";

function Tick({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", ok ? "text-foreground" : "text-muted-foreground")}>
      {ok ? <Check className="h-3.5 w-3.5 text-primary" /> : <X className="h-3.5 w-3.5 text-destructive" />}
      {label}
    </span>
  );
}

export function GranolaImports() {
  const [connected, setConnected] = useState(true);
  const [items, setItems] = useState<GranolaImportStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchGranolaImportsFn();
      setConnected(r.connected);
      setItems(r.imports);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const safeCount = items.filter((i) => i.safeToDelete).length;
  const shown = useMemo(
    () => items.filter((i) => (filter === "safe" ? i.safeToDelete : filter === "attention" ? !i.safeToDelete : true)),
    [items, filter],
  );

  async function importNow() {
    setBusy("harvest");
    try {
      const r = await syncGranolaFn();
      const problems = r.errors.filter((e) => /granola|drive/i.test(e)).length;
      toast.success(`${r.granolaNotesAdded} new Granola notes saved, ${r.granolaCopiedToDrive} copied to Drive, ${problems} problems.`);
      await load();
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  async function verify(noteIds?: string[], retry = false) {
    setBusy(noteIds?.[0] || "verify");
    try {
      const r = await verifyGranolaImportsFn({ data: { noteIds, retry } });
      setItems(r.imports);
    } catch (e) {
      toast.error(`Check failed: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <button className="flex items-center gap-2 text-left" onClick={() => setOpen((o) => !o)}>
          <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
          <CardTitle className="text-base">Granola Imports</CardTitle>
          <span className="text-xs text-muted-foreground">
            {loading ? "loading…" : `${items.length} notes · ${safeCount} safe to delete`}
          </span>
        </button>
        {connected && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => verify()}>
              {busy === "verify" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              Check copies
            </Button>
            <Button size="sm" disabled={!!busy} onClick={importNow}>
              {busy === "harvest" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Import from Granola
            </Button>
          </div>
        )}
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {!connected ? (
            <p className="text-sm text-muted-foreground">Granola isn't connected yet.</p>
          ) : (
            <>
              <div className="flex gap-1">
                {(["all", "safe", "attention"] as Filter[]).map((f) => (
                  <Button key={f} size="sm" variant={filter === f ? "secondary" : "ghost"} onClick={() => setFilter(f)}>
                    {f === "all" ? "All" : f === "safe" ? "Safe to delete" : "Needs attention"}
                  </Button>
                ))}
              </div>
              {shown.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {items.length === 0 ? "No Granola notes imported yet. Click “Import from Granola”." : "Nothing in this view."}
                </p>
              )}
              <div className="divide-y divide-border rounded-md border border-border">
                {shown.map((i) => (
                  <div key={i.noteId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                    <div className="min-w-[240px] flex-1">
                      <div className="text-sm font-medium">{i.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {i.date} · {i.portco || "No PortCo matched"}
                      </div>
                    </div>
                    <Tick ok={i.saved} label="Saved" />
                    <Tick ok={i.copiedToDrive} label="Copied to Drive" />
                    <span className="text-xs text-muted-foreground">
                      Transcript: {i.hasTranscript ? "included" : "none available"}
                    </span>
                    {i.safeToDelete ? (
                      <Badge className="bg-primary text-primary-foreground">Safe to delete in Granola</Badge>
                    ) : (
                      <span className="flex items-center gap-2 text-xs text-destructive">
                        Missing: {i.missing.join(", ")}
                        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => verify([i.noteId], true)}>
                          {busy === i.noteId ? <Loader2 className="h-3 w-3 animate-spin" /> : "Retry"}
                        </Button>
                      </span>
                    )}
                    <div className="flex gap-2 text-xs">
                      {i.driveUrl && (
                        <a className="inline-flex items-center gap-1 text-primary hover:underline" href={i.driveUrl} target="_blank" rel="noreferrer">
                          Drive <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {i.granolaUrl && (
                        <a className="inline-flex items-center gap-1 text-primary hover:underline" href={i.granolaUrl} target="_blank" rel="noreferrer">
                          Granola <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Deleting a note in Granola never removes it from Venture Pulse or Drive, and it won't be imported again.
              </p>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

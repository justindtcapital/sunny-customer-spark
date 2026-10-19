import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildManualMerge, MANUAL_MERGE_FIELDS, type ManualMergeField } from "@/lib/event-cleanup";
import { dtcStatusOf, type PlannerEvent } from "@/lib/event-planner";
import { mergePlannerEventsFn } from "@/utils/event-planner.functions";
import { cn } from "@/lib/utils";

const LABELS: Record<ManualMergeField, string> = {
  name: "Name", start: "Start", end: "End", location: "Location", subcategory: "Category",
  dtcStatus: "DTC Status", owner: "Owner", format: "Format", website: "Website", lumaUrl: "Luma URL",
};

export function EventMergeDialog({ events, open, onClose, onMerged }: {
  events: PlannerEvent[]; open: boolean; onClose: () => void; onMerged: () => void;
}) {
  const qc = useQueryClient();
  const merge = useServerFn(mergePlannerEventsFn);
  const [keeper, setKeeper] = useState("");
  const [picks, setPicks] = useState<Partial<Record<ManualMergeField, string>>>({});
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const value = (e: PlannerEvent, f: ManualMergeField) => (f === "dtcStatus" ? e.dtcStatus || dtcStatusOf(e, today) : e[f]) as string;

  useEffect(() => {
    if (!open || !events.length) return;
    const k = (events.find((e) => e.source === "Tracker") || events[0]).urid;
    setKeeper(k);
    const init: Partial<Record<ManualMergeField, string>> = {};
    for (const f of MANUAL_MERGE_FIELDS) init[f] = (events.find((e) => e.urid === k && value(e, f)) || events.find((e) => value(e, f)) || events[0]).urid;
    setPicks(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, events]);

  async function save() {
    setBusy(true);
    try {
      const merged = buildManualMerge(events, keeper, picks);
      if (picks.dtcStatus) merged.dtcStatus = value(events.find((e) => e.urid === picks.dtcStatus)!, "dtcStatus");
      const r = await merge({ data: { keeper: merged, loserUrids: events.filter((e) => e.urid !== keeper).map((e) => e.urid) } });
      toast.success(`Merged ${r.merged + 1} events into one`);
      await qc.invalidateQueries({ queryKey: ["event-planner"] });
      onMerged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Merge {events.length} events</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Pick the value to keep for each field. Sectors, PortCos, Partners, notes and attendees from every event are combined.</p>
        <div className="grid text-xs" style={{ gridTemplateColumns: `110px repeat(${events.length}, minmax(0,1fr))` }}>
          <div className="font-semibold py-2 border-b border-border">Keep record</div>
          {events.map((e) => (
            <label key={e.urid} className="flex items-center gap-1.5 py-2 px-2 border-b border-border cursor-pointer font-semibold">
              <input type="radio" name="keeper" checked={keeper === e.urid} onChange={() => setKeeper(e.urid)} />
              <span className="truncate">{e.source || "Event"}</span>
            </label>
          ))}
          {MANUAL_MERGE_FIELDS.map((f) => (
            <div key={f} className="contents">
              <div className="py-1.5 text-muted-foreground border-b border-border">{LABELS[f]}</div>
              {events.map((e) => (
                <label key={e.urid} className={cn("flex items-start gap-1.5 py-1.5 px-2 border-b border-border cursor-pointer rounded-sm", picks[f] === e.urid && "bg-accent")}>
                  <input type="radio" name={f} className="mt-0.5" checked={picks[f] === e.urid} onChange={() => setPicks((p) => ({ ...p, [f]: e.urid }))} />
                  <span className="break-words min-w-0">{value(e, f) || <span className="text-muted-foreground">—</span>}</span>
                </label>
              ))}
            </div>
          ))}
          <div className="py-1.5 text-muted-foreground">Combined</div>
          {events.map((e) => (
            <div key={e.urid} className="py-1.5 px-2 text-muted-foreground break-words">
              {[e.sectors.join(", "), e.portcos.join(", "), e.partners.join(", ")].filter(Boolean).join(" · ") || "—"}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !keeper}>{busy ? "Merging…" : "Merge into one"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

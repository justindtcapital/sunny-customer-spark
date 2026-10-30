import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { History, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { HistoryLink, HistoryProposal } from "@/lib/event-history";
import type { PlannerEvent, PlannerAttendee } from "@/lib/event-planner";
import { previewEventHistoryFn, saveEventHistoryLinksFn, unlinkEventHistoryFn } from "@/utils/event-planner.functions";

const PAGE = 40;

export function EventHistoryDialog({ open, year, onClose, onSaved }: { open: boolean; year: number; onClose: () => void; onSaved: () => void }) {
  const preview = useServerFn(previewEventHistoryFn);
  const save = useServerFn(saveEventHistoryLinksFn);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<{ proposals: HistoryProposal[]; alreadyLinked: number; targets: number } | null>(null);
  const [error, setError] = useState("");
  /** source key → chosen target URID ("" = skip). */
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, number>>({ clear: PAGE, review: PAGE, unmatched: PAGE });

  useEffect(() => {
    if (!open) return;
    setPlan(null); setError(""); setChoice({}); setShow({ clear: PAGE, review: PAGE, unmatched: PAGE });
    setBusy(true);
    preview({ data: { year } })
      .then((r) => {
        setPlan(r);
        const c: Record<string, string> = {};
        for (const p of r.proposals) if (p.status === "clear") c[`${p.source.kind}:${p.source.id}`] = p.candidates[0].urid;
        setChoice(c);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false));
  }, [open, year]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => ({
    clear: plan?.proposals.filter((p) => p.status === "clear") ?? [],
    review: plan?.proposals.filter((p) => p.status === "review") ?? [],
    unmatched: plan?.proposals.filter((p) => p.status === "unmatched") ?? [],
  }), [plan]);
  const selectedCount = Object.values(choice).filter(Boolean).length;

  async function submit() {
    if (!plan) return;
    const links = plan.proposals.flatMap((p) => {
      const urid = choice[`${p.source.kind}:${p.source.id}`];
      const c = urid && p.candidates.find((x) => x.urid === urid);
      if (!c) return [];
      return [{
        targetUrid: c.urid, kind: p.source.kind, sourceId: p.source.id, sourceName: p.source.name,
        sourceDate: p.source.date, portcos: p.source.portcos, reason: c.reason, sourceUrl: p.source.url || "",
      }];
    });
    setSaving(true);
    try {
      const r = await save({ data: { links } });
      toast.success(`Linked ${r.added} item${r.added === 1 ? "" : "s"}${r.skipped ? ` · ${r.skipped} already linked` : ""}. Original records were not changed.`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const row = (p: HistoryProposal) => {
    const key = `${p.source.kind}:${p.source.id}`;
    const value = choice[key] || "";
    return (
      <div key={key} className="flex items-start gap-2 py-1.5 border-b border-border last:border-0 text-xs">
        {p.status !== "unmatched" && (
          <Checkbox
            className="mt-0.5"
            checked={!!value}
            onCheckedChange={(v) => setChoice((c) => ({ ...c, [key]: v ? (p.candidates.length === 1 ? p.candidates[0].urid : c[key] || "") : "" }))}
            disabled={p.candidates.length > 1 && !value}
            aria-label={`Link ${p.source.name}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">
            <Badge variant="outline" className="h-4 px-1 text-[9px] mr-1">{p.source.kind === "event" ? "Event" : "Activity"}</Badge>
            {p.source.name}
          </div>
          <div className="text-muted-foreground">
            {p.source.date || "no date"}{p.source.portcos.length ? ` · ${p.source.portcos.join(", ")}` : ""}{p.note ? ` · ${p.note}` : ""}
          </div>
        </div>
        {p.candidates.length === 1 && <span className="shrink-0 text-muted-foreground max-w-[45%] truncate">→ {p.candidates[0].name}</span>}
        {p.candidates.length > 1 && (
          <Select value={value || "skip"} onValueChange={(v) => setChoice((c) => ({ ...c, [key]: v === "skip" ? "" : v }))}>
            <SelectTrigger className="h-7 w-52 text-xs shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="skip" className="text-xs">Skip</SelectItem>
              {p.candidates.map((c) => <SelectItem key={c.urid} value={c.urid} className="text-xs">{c.name} ({c.start})</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
    );
  };

  const section = (k: "clear" | "review" | "unmatched", title: string, hint: string) => {
    const list = groups[k];
    if (!list.length) return null;
    return (
      <section className="space-y-1">
        <h3 className="text-xs font-semibold">{title} ({list.length})</h3>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
        <div>{list.slice(0, show[k]).map(row)}</div>
        {list.length > show[k] && (
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShow((s) => ({ ...s, [k]: s[k] + PAGE }))}>
            Show more ({list.length - show[k]} left)
          </Button>
        )}
      </section>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Link past history to {year} potential events</DialogTitle></DialogHeader>
        {busy && <p className="text-xs text-muted-foreground">Reading past events and reviewed activity…</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {plan && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {plan.targets} potential event{plan.targets === 1 ? "" : "s"} in {year}
              {plan.alreadyLinked ? ` · ${plan.alreadyLinked} item${plan.alreadyLinked === 1 ? "" : "s"} already linked` : ""}.
              Nothing is created or changed — only links are saved.
            </p>
            {section("clear", "Clear matches", "Selected for you. Untick anything that looks wrong.")}
            {section("review", "Needs review", "Several possible events, a generic name, or PortCos that differ. Pick one or leave unticked.")}
            {section("unmatched", "Unmatched past events", "No matching potential event. Shown for information only.")}
            {!plan.proposals.length && <p className="text-xs text-muted-foreground">Nothing new to link.</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={!selectedCount || saving}>
            {saving ? "Saving…" : `Link ${selectedCount} item${selectedCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EventHistorySection({ event, links, all, attendees, onChanged, onOpen }: {
  event: PlannerEvent;
  links: HistoryLink[];
  all: PlannerEvent[];
  attendees: PlannerAttendee[];
  onChanged: () => void;
  onOpen: (e: PlannerEvent) => void;
}) {
  const unlink = useServerFn(unlinkEventHistoryFn);
  const mine = links
    .filter((l) => l.targetUrid === event.urid)
    .sort((a, b) => b.sourceDate.localeCompare(a.sourceDate));
  if (!mine.length) return null;
  async function remove(l: HistoryLink) {
    try {
      await unlink({ data: { targetUrid: l.targetUrid, kind: l.kind, sourceId: l.sourceId } });
      toast.success("Link removed. The original record is unchanged.");
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-semibold flex items-center gap-1"><History className="h-3.5 w-3.5" /> Past history ({mine.length})</h3>
      {mine.map((l) => {
        const past = l.kind === "event" ? all.find((e) => e.urid === l.sourceId || e.sourceRef.includes(`Merged URID: ${l.sourceId}`)) : undefined;
        const count = past ? attendees.filter((a) => a.eventUrid === past.urid && a.status !== "Invited").length : 0;
        return (
          <div key={`${l.kind}:${l.sourceId}`} className="flex items-start gap-2 text-xs">
            <div className="min-w-0 flex-1">
              <div className="truncate">
                <Badge variant="outline" className="h-4 px-1 text-[9px] mr-1">{l.kind === "event" ? "Event" : "Activity"}</Badge>
                {past ? (
                  <button className="underline-offset-2 hover:underline" onClick={() => onOpen(past)}>{l.sourceDate.slice(0, 4)} · {past.name}</button>
                ) : l.kind === "activity" ? (
                  <Link to="/activity" className="underline-offset-2 hover:underline">{l.sourceDate} · {l.sourceName}</Link>
                ) : (
                  <span>{l.sourceDate.slice(0, 4)} · {l.sourceName} <span className="text-muted-foreground">(no longer in tracker)</span></span>
                )}
              </div>
              <div className="text-muted-foreground">
                {[past && (past.dtcStatus || past.status), l.portcos.length && `PortCos: ${l.portcos.join(", ")}`, past && `Attended ${Math.max(count, past.networkCount || 0)}`]
                  .filter(Boolean).join(" · ")}
              </div>
            </div>
            <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0 text-muted-foreground" onClick={() => remove(l)} aria-label={`Unlink ${l.sourceName}`}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        );
      })}
    </section>
  );
}

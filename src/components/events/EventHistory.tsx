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
  const [tab, setTab] = useState<"clear" | "review" | "unmatched">("clear");
  const [show, setShow] = useState<Record<string, number>>({ clear: PAGE, review: PAGE, unmatched: PAGE });

  useEffect(() => {
    if (!open) return;
    setPlan(null); setError(""); setChoice({}); setShow({ clear: PAGE, review: PAGE, unmatched: PAGE }); setTab("clear");
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

  const keyOf = (p: HistoryProposal) => `${p.source.kind}:${p.source.id}`;
  const yearOf = (p: HistoryProposal) => (p.source.date || "").slice(0, 4) || "No date";
  const list = groups[tab];
  const years = useMemo(() => [...new Set(list.map(yearOf))].sort((x, y) => (x === "No date" ? 1 : y === "No date" ? -1 : x.localeCompare(y))), [list]);
  const gridCols = { gridTemplateColumns: `28px repeat(${years.length}, minmax(0, 1fr)) minmax(0, 1.2fr)` };

  /** Clear matches: one row per future event, past items spread across year columns. */
  const clearRows = useMemo(() => {
    const m = new Map<string, { urid: string; name: string; start: string; items: HistoryProposal[] }>();
    for (const p of groups.clear) {
      const c = p.candidates[0];
      const r = m.get(c.urid) || { urid: c.urid, name: c.name, start: c.start, items: [] };
      r.items.push(p); m.set(c.urid, r);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [groups.clear]);

  const sourceChip = (p: HistoryProposal, withBox: boolean) => {
    const key = keyOf(p);
    return (
      <label key={key} className="flex items-start gap-1.5 rounded border border-border bg-muted/40 px-1.5 py-1">
        {withBox && (
          <Checkbox className="mt-0.5 h-3.5 w-3.5" checked={!!choice[key]} aria-label={`Link ${p.source.name}`}
            onCheckedChange={(v) => setChoice((c) => ({ ...c, [key]: v ? p.candidates[0].urid : "" }))} />
        )}
        <span className="min-w-0">
          <span className="block truncate font-medium">{p.source.name}</span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {p.source.kind === "event" ? "Event" : "Activity"} · {p.source.date || "no date"}{p.source.portcos.length ? ` · ${p.source.portcos.join(", ")}` : ""}
          </span>
        </span>
      </label>
    );
  };

  const header = (
    <div className="grid gap-2 border-b border-border pb-1 text-[11px] font-semibold text-muted-foreground sticky top-0 bg-background z-10" style={gridCols}>
      <span />
      {years.map((y) => <span key={y}>{y}</span>)}
      <span className="text-foreground">{year} potential event</span>
    </div>
  );

  const renderClear = () => clearRows.slice(0, show.clear).map((r) => {
    const keys = r.items.map(keyOf);
    const on = keys.filter((k) => choice[k]).length;
    return (
      <div key={r.urid} className="grid gap-2 border-b border-border py-1.5 text-xs items-start" style={gridCols}>
        <Checkbox className="mt-1" checked={on === keys.length ? true : on ? "indeterminate" : false} aria-label={`Link all to ${r.name}`}
          onCheckedChange={(v) => setChoice((c) => { const n = { ...c }; for (const k of keys) n[k] = v ? r.urid : ""; return n; })} />
        {years.map((y) => <div key={y} className="space-y-1 min-w-0">{r.items.filter((p) => yearOf(p) === y).map((p) => sourceChip(p, r.items.length > 1))}</div>)}
        <div className="min-w-0 rounded border border-primary/40 bg-primary/5 px-1.5 py-1">
          <span className="block truncate font-medium">→ {r.name}</span>
          <span className="block text-[10px] text-muted-foreground">{r.start || "no date"} · {r.items[0].candidates[0].reason}</span>
        </div>
      </div>
    );
  });

  const renderSingle = (p: HistoryProposal) => {
    const key = keyOf(p);
    const value = choice[key] || "";
    return (
      <div key={key} className="grid gap-2 border-b border-border py-1.5 text-xs items-start" style={gridCols}>
        {p.status === "review" ? (
          <Checkbox className="mt-1" checked={!!value} disabled={p.candidates.length > 1 && !value} aria-label={`Link ${p.source.name}`}
            onCheckedChange={(v) => setChoice((c) => ({ ...c, [key]: v ? (p.candidates.length === 1 ? p.candidates[0].urid : c[key] || "") : "" }))} />
        ) : <span />}
        {years.map((y) => <div key={y} className="min-w-0">{yearOf(p) === y && sourceChip(p, false)}</div>)}
        <div className="min-w-0">
          {p.status === "unmatched" ? (
            <span className="text-muted-foreground italic">No matching {year} event</span>
          ) : p.candidates.length === 1 ? (
            <div className="rounded border border-dashed border-border px-1.5 py-1">
              <span className="block truncate font-medium">→ {p.candidates[0].name}</span>
              <span className="block text-[10px] text-muted-foreground">{p.candidates[0].start}</span>
            </div>
          ) : (
            <Select value={value || "skip"} onValueChange={(v) => setChoice((c) => ({ ...c, [key]: v === "skip" ? "" : v }))}>
              <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="skip" className="text-xs">Pick one or skip…</SelectItem>
                {p.candidates.map((c) => <SelectItem key={c.urid} value={c.urid} className="text-xs">{c.name} ({c.start})</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {p.note && <span className="mt-0.5 block text-[10px] text-muted-foreground">⚠ {p.note}</span>}
        </div>
      </div>
    );
  };

  const total = tab === "clear" ? clearRows.length : list.length;
  const hints = {
    clear: "Each row is one future event. The same event from earlier years sits on the left. Ticked rows will be linked.",
    review: "Possible matches we can't confirm automatically. Tick the ones that are the same event, or pick the right one.",
    unmatched: "Past events with no matching future event. For information only — nothing to link.",
  } as const;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Link past history to {year} potential events</DialogTitle></DialogHeader>
        {busy && <p className="text-xs text-muted-foreground">Reading past events and reviewed activity…</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {plan && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {plan.targets} potential event{plan.targets === 1 ? "" : "s"} in {year}
              {plan.alreadyLinked ? ` · ${plan.alreadyLinked} item${plan.alreadyLinked === 1 ? "" : "s"} already linked` : ""}.
              Nothing is created or changed — only links are saved.
            </p>
            <div className="flex gap-1">
              {(["clear", "review", "unmatched"] as const).map((k) => (
                <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} className="h-7 text-xs" onClick={() => setTab(k)}>
                  {k === "clear" ? "Clear matches" : k === "review" ? "Needs review" : "Unmatched"} ({k === "clear" ? clearRows.length : groups[k].length})
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{hints[tab]}</p>
            {total > 0 && (
              <div>
                {header}
                {tab === "clear" ? renderClear() : list.slice(0, show[tab]).map(renderSingle)}
                {total > show[tab] && (
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShow((s) => ({ ...s, [tab]: s[tab] + PAGE }))}>
                    Show more ({total - show[tab]} left)
                  </Button>
                )}
              </div>
            )}
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

import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { dayOf, type DateCount, type TagGroup } from "@/lib/attendance-reconcile";

type Ev = { urid: string; name: string; start: string; city: string };
const fmt = (d: string) => { const t = Date.parse(d + "T12:00:00"); return isNaN(t) ? d : new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); };
const list = (xs: DateCount[]) => xs.map((x) => `${fmt(x.date)} (${x.count})`).join(" · ");
function batchLine(g: TagGroup) {
  const parts: string[] = [];
  if (g.batches.length) parts.push(`${g.batches.length === 1 ? "Uploaded" : `${g.batches.length} batches`}: ${list(g.batches)}`);
  else parts.push("Upload date unknown");
  if (g.tagDates.length) parts.push(`Tag date${g.tagDates.length > 1 ? "s" : ""}: ${list(g.tagDates)}`);
  return parts.join(" — ");
}

function EventCombo({ g, events, value, onChange }: { g: TagGroup; events: Ev[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const predicted = new Set(g.candidates.map((c) => c.urid));
  const sel = g.candidates.find((c) => c.urid === value) || events.find((e) => e.urid === value);
  const pick = (v: string) => { onChange(v); setOpen(false); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 w-full justify-start text-xs font-normal truncate">
          {sel ? `${sel.name} · ${sel.start}` : <span className="text-muted-foreground">Pick an event ({g.candidates.length} predicted)</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command filter={(v, search) => (v.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search events by name, city or date…" className="text-xs" />
          <CommandList className="max-h-72">
            <CommandEmpty>No event found.</CommandEmpty>
            <CommandGroup heading="Predicted">
              {g.candidates.map((c) => <CommandItem key={c.urid} value={`p ${c.name} ${c.start} ${c.urid}`} onSelect={() => pick(c.urid)} className="text-xs">{c.name} · {c.start}</CommandItem>)}
            </CommandGroup>
            <CommandGroup heading="All Events DB">
              {events.filter((e) => !predicted.has(e.urid)).map((e) => <CommandItem key={e.urid} value={`${e.name} ${e.city} ${e.start} ${e.urid}`} onSelect={() => pick(e.urid)} className="text-xs">{e.name}{e.city ? ` · ${e.city}` : ""} · {e.start}</CommandItem>)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
import { applyAttendanceReconcileFn, previewAttendanceReconcileFn } from "@/utils/event-planner.functions";

type Tab = TagGroup["status"];
const LABEL: Record<Tab, string> = { clear: "Clear matches", review: "Needs review", unmatched: "No match" };

export function AttendanceReconcileDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const preview = useServerFn(previewAttendanceReconcileFn);
  const apply = useServerFn(applyAttendanceReconcileFn);
  const [groups, setGroups] = useState<TagGroup[] | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("clear");
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setGroups(null); setError(""); setChoice({}); setTab("clear"); setBusy(true);
    preview()
      .then((r) => {
        setGroups(r.groups); setEvents(r.events);
        const c: Record<string, string> = {};
        for (const g of r.groups) if (g.status === "clear" && g.people.length > g.alreadyLinked) c[g.tagName] = g.candidates[0].urid;
        setChoice(c);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const by = useMemo(() => ({
    clear: groups?.filter((g) => g.status === "clear") ?? [],
    review: groups?.filter((g) => g.status === "review") ?? [],
    unmatched: groups?.filter((g) => g.status === "unmatched") ?? [],
  }), [groups]);
  const peopleToAdd = (groups ?? []).filter((g) => choice[g.tagName]).reduce((n, g) => n + g.people.length - (g.status === "clear" ? g.alreadyLinked : 0), 0);

  async function save() {
    setSaving(true);
    try {
      const r = await apply({ data: { choices: Object.fromEntries(Object.entries(choice).filter(([, v]) => v)) } });
      toast.success(`Added ${r.added} attendee${r.added === 1 ? "" : "s"} to their events`);
      onSaved(); onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>Match tagged people to events</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          People were tagged with event names that don't always match the planner. Approve each match below to show those people as attendees on the event. Nothing about the people or events is changed, and anyone already on an event is skipped.
        </p>
        {busy && <p className="text-sm py-6 text-center text-muted-foreground">Reading events and tags…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {groups && (
          <>
            <div className="flex gap-1.5">
              {(["clear", "review"] as Tab[]).map((t) => (
                <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} className="h-7 text-xs" onClick={() => setTab(t)}>
                  {LABEL[t]} <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{by[t].length}</Badge>
                </Button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto border rounded-md divide-y min-h-[200px]">
              <div className="grid grid-cols-[24px_1.2fr_60px_1.5fr] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40 sticky top-0">
                <span /><span>Tag on people</span><span>People</span><span>Planner event</span>
              </div>
              {by[tab].length === 0 && <p className="text-xs text-muted-foreground p-4">Nothing here.</p>}
              {by[tab].map((g) => {
                const done = g.status === "clear" && g.alreadyLinked >= g.people.length;
                return (
                  <div key={g.tagName} className="px-3 py-1.5 text-xs">
                    <div className="grid grid-cols-[24px_1.2fr_60px_1.5fr] gap-2 items-center">
                      <Checkbox
                        disabled={!g.candidates.length || done}
                        checked={!!choice[g.tagName]}
                        onCheckedChange={(v) => setChoice((c) => ({ ...c, [g.tagName]: v ? (c[g.tagName] || g.candidates[0]?.urid || "") : "" }))}
                      />
                      <button type="button" className="text-left truncate hover:underline" onClick={() => setExpanded(expanded === g.tagName ? "" : g.tagName)}>{g.tagName}</button>
                      <span className="text-xs text-muted-foreground">{g.people.length}{g.alreadyLinked ? ` (${g.alreadyLinked} on)` : ""}</span>
                      {g.status === "clear" ? (
                        <span className={cn("truncate text-xs", done && "text-muted-foreground")}>{g.candidates[0].name} · {g.candidates[0].start} {done && "— all linked"}</span>
                      ) : g.status === "review" ? (
                        <EventCombo g={g} events={events} value={choice[g.tagName] || ""} onChange={(v) => setChoice((c) => ({ ...c, [g.tagName]: v }))} />
                      ) : <span className="text-xs text-muted-foreground">No planner event with this name</span>}
                    </div>
                    <p className="mt-0.5 ml-8 text-[9px] leading-tight text-muted-foreground/70">{batchLine(g)}</p>
                    {expanded === g.tagName && (
                      <div className="mt-1 ml-8 space-y-0.5 text-[10px] text-muted-foreground">
                        {(g.batches.length ? g.batches : [{ date: "", count: g.people.length }]).map((b) => (
                          <p key={b.date || "none"}><span className="font-medium text-foreground">{b.date ? fmt(b.date) : "Unknown date"}:</span> {g.people.filter((p) => !b.date || dayOf(p.added) === b.date).map((p) => p.name || p.email).join(", ")}</p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !peopleToAdd}>{saving ? "Saving…" : `Add ${peopleToAdd} attendee${peopleToAdd === 1 ? "" : "s"}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

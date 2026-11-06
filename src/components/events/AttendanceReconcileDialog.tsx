import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TagGroup } from "@/lib/attendance-reconcile";
import { applyAttendanceReconcileFn, previewAttendanceReconcileFn } from "@/utils/event-planner.functions";

type Tab = TagGroup["status"];
const LABEL: Record<Tab, string> = { clear: "Clear matches", review: "Needs review", unmatched: "No match" };

export function AttendanceReconcileDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const preview = useServerFn(previewAttendanceReconcileFn);
  const apply = useServerFn(applyAttendanceReconcileFn);
  const [groups, setGroups] = useState<TagGroup[] | null>(null);
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
        setGroups(r.groups);
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
                  <div key={g.tagName} className="px-3 py-2 text-sm">
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
                        <Select value={choice[g.tagName] || ""} onValueChange={(v) => setChoice((c) => ({ ...c, [g.tagName]: v }))}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={`Pick one of ${g.candidates.length}`} /></SelectTrigger>
                          <SelectContent>{g.candidates.map((c) => <SelectItem key={c.urid} value={c.urid} className="text-xs">{c.name} · {c.start}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : <span className="text-xs text-muted-foreground">No planner event with this name</span>}
                    </div>
                    {expanded === g.tagName && (
                      <p className="mt-1 ml-8 text-xs text-muted-foreground">{g.people.map((p) => p.name || p.email).join(", ")}</p>
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

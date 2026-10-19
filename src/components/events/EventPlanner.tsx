import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft, ChevronRight, Plus, Upload, Link2, RefreshCw, ExternalLink, Pencil, CheckCircle2, Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import type { Contact } from "@/lib/types";
import {
  PLANNER_CATEGORIES, PLANNER_SECTORS, IMPORT_FIELDS, IMPORT_FIELD_LABELS,
  plannerWindow, stepAnchor, overlaps, columnFor, windowTotals, priorYears, subcategoryColor,
  sectorDotColor, normalizeSector, guessImportMapping, parsePlannerCsv, parseTrackerDate, splitList,
  mapTrackerStatus, eventSeriesKey, DTC_STATUSES, dtcStatusOf,
  type PlannerEvent, type PlannerZoom, type PlannerAttendee, type ImportField,
} from "@/lib/event-planner";
import {
  fetchPlannerFn, addPlannerEventsFn, updatePlannerEventFn, syncAsanaPlannerFn, extractEventFromUrlFn,
  addPlannerAttendeesFn,
} from "@/utils/event-planner.functions";

type StatusView = "Confirmed" | "Potential" | "Both";
const SUBCATS = PLANNER_CATEGORIES.flatMap((c) => c.subcategories.map((s) => s.name));
const today = () => new Date().toISOString().slice(0, 10);
const tileVar = (sub: string) => `var(--planner-${subcategoryColor(sub)})`;

export const plannerQueryKey = ["event-planner"];

export function EventPlanner({ contacts }: { contacts: Contact[] }) {
  const { email } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: plannerQueryKey, queryFn: () => fetchPlannerFn() });
  const attendees = data?.attendees ?? [];
  // Network count = the larger of the typed count and logged attendees.
  const events = useMemo(() => {
    const n = new Map<string, number>();
    (data?.attendees ?? []).forEach((a) => a.status !== "Invited" && n.set(a.eventUrid, (n.get(a.eventUrid) || 0) + 1));
    return (data?.events ?? []).map((e) => ({ ...e, networkCount: Math.max(e.networkCount || 0, n.get(e.urid) || 0) }));
  }, [data]);
  const refresh = () => qc.invalidateQueries({ queryKey: plannerQueryKey });

  const [zoom, setZoom] = useState<PlannerZoom>("year");
  const [anchor, setAnchor] = useState(today());
  const [statusView, setStatusView] = useState<StatusView>("Both");
  const [search, setSearch] = useState("");
  const [subFilter, setSubFilter] = useState<string[]>([]);
  const [sectorFilter, setSectorFilter] = useState<string[]>([]);
  const [showDeclined, setShowDeclined] = useState(false);
  const [dtcFilter, setDtcFilter] = useState<string[]>([]);
  const [portco, setPortco] = useState("");
  const [partner, setPartner] = useState("");
  const [owner, setOwner] = useState("");
  const [source, setSource] = useState("");
  const [selected, setSelected] = useState<PlannerEvent | null>(null);
  const [editing, setEditing] = useState<Partial<PlannerEvent> | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const syncFn = useServerFn(syncAsanaPlannerFn);
  const [syncing, setSyncing] = useState(false);

  const win = useMemo(() => plannerWindow(zoom, anchor), [zoom, anchor]);
  const options = useMemo(() => {
    const u = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      portcos: u(events.flatMap((e) => e.portcos)),
      partners: u(events.flatMap((e) => e.partners)),
      owners: u(events.flatMap((e) => splitList(e.owner))),
      sources: u(events.map((e) => e.source)),
    };
  }, [events]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      const dtc = dtcStatusOf(e, today());
      if (dtcFilter.length && !dtcFilter.includes(dtc)) return false;
      if (e.status === "Declined" && !showDeclined && !dtcFilter.includes("Declined")) return false;
      if (statusView !== "Both" && e.status !== "Declined" && e.status !== statusView) return false;
      if (subFilter.length && !subFilter.includes(e.subcategory)) return false;
      if (sectorFilter.length && !e.sectors.map(normalizeSector).some((s) => sectorFilter.includes(s))) return false;
      if (portco && !e.portcos.includes(portco)) return false;
      if (partner && !e.partners.includes(partner)) return false;
      if (owner && !splitList(e.owner).includes(owner)) return false;
      if (source && e.source !== source) return false;
      if (q && !`${e.name} ${e.location} ${e.portcos.join(" ")} ${e.partners.join(" ")} ${e.notes}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [events, search, subFilter, sectorFilter, dtcFilter, showDeclined, statusView, portco, partner, owner, source]);

  const inWindow = filtered.filter((e) => overlaps(e, win.start, win.end));
  const undated = filtered.filter((e) => !e.start);

  async function syncAsana() {
    setSyncing(true);
    try {
      const r = await syncFn({ data: { by: email || "" } });
      toast.success(r.added ? `Added ${r.added} new Asana event${r.added === 1 ? "" : "s"}` : "Already up to date with Asana");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="grid grid-cols-[210px_minmax(0,1fr)] gap-5">
      {/* Filters */}
      <aside className="space-y-4 text-xs">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events" className="h-8 pl-7 text-xs" />
        </div>
        <FilterBlock title="Category">
          {PLANNER_CATEGORIES.map((c) => (
            <div key={c.name} className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.name}</div>
              {c.subcategories.map((s) => (
                <label key={s.name} className="flex items-center gap-2 cursor-pointer">
                  <ColorCheck
                    color={tileVar(s.name)}
                    checked={subFilter.includes(s.name)}
                    onChange={(v) => setSubFilter((p) => (v ? [...p, s.name] : p.filter((x) => x !== s.name)))}
                  />
                  <span className="truncate">{s.name}</span>
                </label>
              ))}
            </div>
          ))}
        </FilterBlock>
        <FilterBlock title="DTC Status">
          {DTC_STATUSES.map((s) => (
            <label key={s} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={dtcFilter.includes(s)}
                onCheckedChange={(v) => setDtcFilter((p) => (v ? [...p, s] : p.filter((x) => x !== s)))}
              />
              <span className="flex-1">{s}</span>
              <span className="text-muted-foreground tabular-nums">{events.filter((e) => dtcStatusOf(e, today()) === s).length}</span>
            </label>
          ))}
        </FilterBlock>
        <FilterBlock title="Sector">
          {PLANNER_SECTORS.map((s) => (
            <label key={s} className="flex items-center gap-2 cursor-pointer">
              <ColorCheck
                round
                color={`var(--sector-${sectorDotColor(s)})`}
                checked={sectorFilter.includes(s)}
                onChange={(v) => setSectorFilter((p) => (v ? [...p, s] : p.filter((x) => x !== s)))}
              />
              {s}
            </label>
          ))}
        </FilterBlock>
        <FilterSelect label="PortCo" value={portco} onChange={setPortco} options={options.portcos} />
        <FilterSelect label="Partner" value={partner} onChange={setPartner} options={options.partners} />
        <FilterSelect label="Owner" value={owner} onChange={setOwner} options={options.owners} />
        <FilterSelect label="Source" value={source} onChange={setSource} options={options.sources} />
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={showDeclined} onCheckedChange={(v) => setShowDeclined(!!v)} /> Show declined
        </label>
      </aside>

      <div className="min-w-0 space-y-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Seg value={zoom} onChange={(v) => setZoom(v as PlannerZoom)} options={["week", "month", "year"]} />
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setAnchor(stepAnchor(zoom, anchor, -1))} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAnchor(today())}>Today</Button>
            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setAnchor(stepAnchor(zoom, anchor, 1))} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-sm font-semibold min-w-[150px]">{win.label}</div>
          <Seg value={statusView} onChange={(v) => setStatusView(v as StatusView)} options={["Confirmed", "Potential", "Both"]} />
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button size="sm" className="h-7 text-xs" onClick={() => setEditing({ status: "Potential", subcategory: "Unassigned", source: "Manual" })}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add event
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCsvOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1" /> Import CSV
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLinkOpen(true)}>
              <Link2 className="h-3.5 w-3.5 mr-1" /> Add from link
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={syncAsana} disabled={syncing}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1", syncing && "animate-spin")} /> Sync Asana
            </Button>
          </div>
        </div>
        {data?.error && <p className="text-xs text-destructive">Couldn't read the event tracker: {data.error}</p>}

        {/* Grid */}
        <div className="rounded-lg border border-border overflow-x-auto">
          <div
            className="grid min-w-[900px]"
            style={{ gridTemplateColumns: `150px repeat(${win.columns.length}, minmax(0,1fr)) 150px` }}
          >
            <div className="bg-muted/50 border-b border-border" />
            {win.columns.map((c) => (
              <div key={c.key} className={cn("bg-muted/50 border-b border-l border-border px-1 py-1.5 text-center text-xs font-medium", c.start <= today() && today() <= c.end && "text-primary")}>
                {c.label}
              </div>
            ))}
            <div className="bg-muted/50 border-b border-l border-border px-2 py-1.5 text-xs font-medium">
              {zoom === "week" ? "This week" : zoom === "month" ? "This month" : "This year"}
            </div>

            {PLANNER_CATEGORIES.map((cat) => {
              const rowEvents = inWindow.filter((e) => e.category === cat.name);
              if (cat.name === "Unassigned" && rowEvents.length === 0) return null;
              const totals = windowTotals(rowEvents, win);
              return (
                <Row key={cat.name}>
                  <div className="border-b border-border p-2 space-y-1">
                    <div className="text-xs font-semibold">{cat.name}</div>
                    {cat.subcategories.map((s) => (
                      <div key={s.name} className="flex items-center gap-1.5 text-[10px] text-muted-foreground leading-tight">
                        <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: tileVar(s.name) }} />
                        {s.name}
                      </div>
                    ))}
                  </div>
                  {win.columns.map((col) => (
                    <div key={col.key} className="border-b border-l border-border p-1 space-y-1 min-h-[90px]">
                      {rowEvents
                        .filter((e) => columnFor(e, win) === col.key)
                        .sort((a, b) => a.start.localeCompare(b.start))
                        .map((e) => (
                          <Tile key={e.urid} e={e} zoom={zoom} onClick={() => setSelected(e)} />
                        ))}
                    </div>
                  ))}
                  <div className="border-b border-l border-border p-2 text-[11px] space-y-0.5 bg-muted/20">
                    <div><span className="font-semibold">{totals.events}</span> events</div>
                    <div><span className="font-semibold">{totals.network}</span> network</div>
                    <div><span className="font-semibold">{totals.portcos}</span> PortCos</div>
                    {Object.entries(totals.sectors).map(([s, n]) => (
                      <div key={s} className="flex items-center gap-1 text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--sector-${sectorDotColor(s)})` }} />
                        {s} – {n}
                      </div>
                    ))}
                  </div>
                </Row>
              );
            })}
          </div>
        </div>
        {isLoading && <p className="text-xs text-muted-foreground">Loading events…</p>}
        {!isLoading && events.length === 0 && (
          <p className="text-xs text-muted-foreground">No events yet — add one, import a CSV or sync Asana.</p>
        )}
        {undated.length > 0 && (
          <div className="rounded-lg border border-dashed border-border p-3">
            <div className="text-xs font-semibold mb-2">No date yet ({undated.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {undated.map((e) => (
                <div key={e.urid} className="w-40"><Tile e={e} zoom="month" onClick={() => setSelected(e)} /></div>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-3 w-5 rounded border-2" style={{ borderColor: "var(--planner-blue)" }} /> Confirmed</span>
          <span className="flex items-center gap-1"><span className="h-3 w-5 rounded border-2 border-dashed" style={{ borderColor: "var(--planner-blue)" }} /> Potential</span>
          <span>Tile color = category · dot = sector</span>
        </div>
      </div>

      <EventDetail
        event={selected}
        all={events}
        attendees={attendees}
        contacts={contacts}
        onClose={() => setSelected(null)}
        onEdit={(e) => setEditing(e)}
        onSaved={(e) => { setSelected(e); refresh(); }}
      />
      <EventForm
        initial={editing}
        options={options}
        onClose={() => setEditing(null)}
        onSaved={(e) => { setEditing(null); if (e) setSelected(e); refresh(); }}
      />
      <CsvImportDialog open={csvOpen} onClose={() => setCsvOpen(false)} onDone={refresh} />
      <LinkDialog open={linkOpen} onClose={() => setLinkOpen(false)} onExtracted={(e) => { setLinkOpen(false); setEditing(e); }} />
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
      {options.map((o) => (
        <Button key={o} size="sm" variant={value === o ? "secondary" : "ghost"} className="h-6 px-2 text-xs capitalize" onClick={() => onChange(o)}>
          {o}
        </Button>
      ))}
    </div>
  );
}

function FilterBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="font-semibold text-foreground">{title}</div>
      {children}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="space-y-1">
      <div className="font-semibold">{label}</div>
      <Select value={value || "__all"} onValueChange={(v) => onChange(v === "__all" ? "" : v)}>
        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">All</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function shortDate(e: PlannerEvent): string {
  if (!e.start) return "TBD";
  const f = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8)}`;
  return e.end && e.end !== e.start ? `${f(e.start)}–${f(e.end)}` : f(e.start);
}

function Tile({ e, zoom, onClick }: { e: PlannerEvent; zoom: PlannerZoom; onClick: () => void }) {
  const color = tileVar(e.subcategory);
  const potential = e.status === "Potential";
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-md border-2 px-1.5 py-1 transition hover:shadow-md",
        potential && "border-dashed",
        e.status === "Declined" && "opacity-50 line-through",
      )}
      style={{
        borderColor: color,
        background: `color-mix(in oklch, ${color} ${potential ? 6 : 16}%, transparent)`,
      }}
      title={`${e.name} · ${e.subcategory} · ${e.status}`}
    >
      <div className="flex items-start gap-1">
        <span className={cn("font-medium leading-tight flex-1 min-w-0", zoom === "year" ? "text-[10px] line-clamp-2" : "text-xs line-clamp-2")}>
          {e.name}
        </span>
        <span className="flex gap-0.5 pt-0.5 shrink-0">
          {[...new Set(e.sectors.map(normalizeSector))].slice(0, 3).map((s) => (
            <span key={s} className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--sector-${sectorDotColor(s)})` }} />
          ))}
        </span>
      </div>
      {zoom !== "year" && (
        <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
          {shortDate(e)}{e.location ? ` · ${e.location}` : ""}
        </div>
      )}
      <div className="text-[9px] text-muted-foreground leading-tight">
        Network = {e.networkCount || "x"} · PortCo = {e.portcos.length || "x"}
      </div>
      {zoom === "week" && (
        <div className="text-[10px] text-muted-foreground leading-tight mt-0.5 space-y-0.5">
          {e.format && <div className="capitalize">{e.format}</div>}
          {e.owner && <div>Owner: {e.owner}</div>}
          {potential && <Badge variant="outline" className="h-4 px-1 text-[9px]">Potential</Badge>}
        </div>
      )}
    </button>
  );
}

// ── Detail pane ────────────────────────────────────────────────
function EventDetail({
  event, all, attendees, contacts, onClose, onEdit, onSaved,
}: {
  event: PlannerEvent | null;
  all: PlannerEvent[];
  attendees: PlannerAttendee[];
  contacts: Contact[];
  onClose: () => void;
  onEdit: (e: PlannerEvent) => void;
  onSaved: (e: PlannerEvent) => void;
}) {
  const update = useServerFn(updatePlannerEventFn);
  const addAtt = useServerFn(addPlannerAttendeesFn);
  const [q, setQ] = useState("");
  const e = event;
  const people = useMemo(() => {
    if (!e) return [];
    const key = eventSeriesKey(e.name);
    const rows = attendees.filter((a) => a.eventUrid === e.urid).map((a) => ({ name: a.name, email: a.email, kind: a.kind || "Network", status: a.status || "Attended" }));
    const seen = new Set(rows.map((r) => (r.email || r.name).toLowerCase()));
    for (const c of contacts) {
      const hit = c.eventsAttended.some((x) => eventSeriesKey(x) === key) || c.eventsInvited.some((x) => eventSeriesKey(x) === key);
      if (!hit) continue;
      const k = (c.email || c.name).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({ name: c.name, email: c.email, kind: "Network", status: c.eventsAttended.some((x) => eventSeriesKey(x) === key) ? "Attended" : "Invited" });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [e, attendees, contacts]);
  const prior = e ? priorYears(e, all) : [];
  const matches = q.trim().length >= 2
    ? contacts.filter((c) => `${c.name} ${c.email} ${c.company}`.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : [];

  async function promote() {
    if (!e) return;
    try {
      const next = await update({ data: { urid: e.urid, patch: { status: "Confirmed" }, expectedUpdated: e.updated } });
      toast.success("Moved to Confirmed");
      onSaved(next);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  async function addPerson(c: Contact, status: string) {
    if (!e) return;
    await addAtt({ data: { attendees: [{ eventUrid: e.urid, name: c.name, email: c.email, kind: "Network", status, date: today() }] } });
    setQ("");
    toast.success(`${c.name} added as ${status.toLowerCase()}`);
    onSaved(e);
  }

  return (
    <Sheet open={!!e} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        {e && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6">{e.name}</SheetTitle>
            </SheetHeader>
            <div className="mt-3 space-y-4 text-sm">
              <div className="flex flex-wrap gap-1.5">
                <Badge style={{ background: tileVar(e.subcategory) }} className="text-primary-foreground border-0">{e.subcategory}</Badge>
                <Badge variant={e.status === "Confirmed" ? "default" : "outline"}>{e.status}</Badge>
                {e.sectors.map((s) => (
                  <Badge key={s} variant="secondary" className="gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--sector-${sectorDotColor(s)})` }} />
                    {normalizeSector(s)}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => onEdit(e)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                {e.status !== "Confirmed" && (
                  <Button size="sm" onClick={promote}><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark confirmed</Button>
                )}
              </div>
              <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
                <Field k="Dates" v={shortDate(e) + (e.start ? ` ${e.start.slice(0, 4)}` : "")} />
                <Field k="Location" v={e.location} />
                <Field k="Format" v={e.format} />
                <Field k="Category" v={`${e.category} › ${e.subcategory}`} />
                <Field k="Owner" v={e.owner} />
                <Field k="PortCos" v={e.portcos.join(", ")} />
                <Field k="Partners" v={e.partners.join(", ")} />
                <Field k="Event contact" v={e.eventContact} />
                <Field k="Actions needed" v={e.actionsNeeded} />
                <Field k="Source" v={`${e.source}${e.sourceRef && !/^https?:/.test(e.sourceRef) ? ` · ${e.sourceRef}` : ""}`} />
                <Field k="Added by" v={e.createdBy} />
              </dl>
              {e.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{e.notes}</p>}
              <div className="flex flex-wrap gap-2">
                {e.website && <LinkOut href={e.website} label="Event website" />}
                {e.lumaUrl && <LinkOut href={e.lumaUrl} label="Luma / RSVP" />}
                {e.asanaGid && <LinkOut href={`https://app.asana.com/0/0/${e.asanaGid}`} label="Asana" />}
                {/^https?:/.test(e.sourceRef) && e.sourceRef !== e.website && e.sourceRef !== e.lumaUrl && <LinkOut href={e.sourceRef} label="Source page" />}
              </div>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold">Attendees & invites ({people.length})</h3>
                <div className="relative">
                  <Input value={q} onChange={(x) => setQ(x.target.value)} placeholder="Add a Network contact…" className="h-7 text-xs" />
                  {matches.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow">
                      {matches.map((c) => (
                        <div key={c.id} className="flex items-center justify-between px-2 py-1 text-xs hover:bg-muted">
                          <span className="truncate">{c.name} <span className="text-muted-foreground">{c.company}</span></span>
                          <span className="flex gap-1 shrink-0">
                            <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]" onClick={() => addPerson(c, "Invited")}>Invited</Button>
                            <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]" onClick={() => addPerson(c, "Attended")}>Attended</Button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {people.map((p) => (
                    <div key={p.email || p.name} className="flex items-center justify-between text-xs">
                      <span className="truncate">{p.name}{p.email && <span className="text-muted-foreground"> · {p.email}</span>}</span>
                      <span className="flex gap-1 shrink-0">
                        <Badge variant="outline" className="h-4 px-1 text-[9px]">{p.kind}</Badge>
                        <Badge variant="secondary" className="h-4 px-1 text-[9px]">{p.status}</Badge>
                      </span>
                    </div>
                  ))}
                  {people.length === 0 && <p className="text-xs text-muted-foreground">No attendees yet.</p>}
                </div>
              </section>

              <section className="space-y-1">
                <h3 className="text-xs font-semibold">Prior years</h3>
                {prior.length === 0 && <p className="text-xs text-muted-foreground">No earlier editions found.</p>}
                {prior.map((p) => (
                  <div key={p.urid} className="flex justify-between text-xs">
                    <span>{p.start.slice(0, 4)} · {p.name}</span>
                    <span className="text-muted-foreground">{p.status} · Network {p.networkCount || "–"} · PortCo {p.portcos.length}</span>
                  </div>
                ))}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </>
  );
}
function LinkOut({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
      <ExternalLink className="h-3 w-3" /> {label}
    </a>
  );
}

// ── Add / edit form ────────────────────────────────────────────
function EventForm({
  initial, options, onClose, onSaved,
}: {
  initial: Partial<PlannerEvent> | null;
  options: { portcos: string[]; partners: string[]; owners: string[] };
  onClose: () => void;
  onSaved: (e: PlannerEvent | null) => void;
}) {
  const { email } = useAuth();
  const add = useServerFn(addPlannerEventsFn);
  const update = useServerFn(updatePlannerEventFn);
  const [form, setForm] = useState<Partial<PlannerEvent>>({});
  const [key, setKey] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  if (initial !== key) {
    setKey(initial);
    setForm(initial || {});
  }
  const set = <K extends keyof PlannerEvent>(k: K, v: PlannerEvent[K]) => setForm((f) => ({ ...f, [k]: v }));
  const list = (k: "sectors" | "portcos" | "partners") => (form[k] || []).join("; ");

  async function save() {
    if (!form.name?.trim()) return toast.error("Event name is required");
    setSaving(true);
    try {
      if (form.urid) {
        const next = await update({ data: { urid: form.urid, patch: form, expectedUpdated: (initial?.updated as string) || "" } });
        toast.success("Event saved");
        onSaved(next);
      } else {
        const r = await add({ data: { events: [form], by: email || "" } });
        if (r.skipped.length) toast.warning("An event with that name and date already exists");
        else toast.success("Event added");
        onSaved(null);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!initial} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.urid ? "Edit event" : "Add event"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <L label="Event name" full><Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} /></L>
          <L label="Start date"><Input type="date" value={form.start || ""} onChange={(e) => set("start", e.target.value)} /></L>
          <L label="End date"><Input type="date" value={form.end || ""} onChange={(e) => set("end", e.target.value)} /></L>
          <L label="Category">
            <Select value={form.subcategory || "Unassigned"} onValueChange={(v) => set("subcategory", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLANNER_CATEGORIES.map((c) => c.subcategories.map((s) => (
                  <SelectItem key={s.name} value={s.name}>{c.name} › {s.name}</SelectItem>
                )))}
              </SelectContent>
            </Select>
          </L>
          <L label="Status">
            <Select value={form.status || "Potential"} onValueChange={(v) => set("status", v as PlannerEvent["status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Confirmed", "Potential", "Declined"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </L>
          <L label="Location"><Input value={form.location || ""} onChange={(e) => set("location", e.target.value)} /></L>
          <L label="Format">
            <Select value={form.format || "__none"} onValueChange={(v) => set("format", v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {["in-person", "virtual", "hybrid"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </L>
          <L label="Sectors (; separated)" hint={PLANNER_SECTORS.join(", ")}>
            <Input value={list("sectors")} onChange={(e) => set("sectors", splitList(e.target.value))} />
          </L>
          <L label="Owner / DTC coverage"><Input list="vp-owners" value={form.owner || ""} onChange={(e) => set("owner", e.target.value)} /></L>
          <L label="PortCos (; separated)"><Input list="vp-portcos" value={list("portcos")} onChange={(e) => set("portcos", splitList(e.target.value))} /></L>
          <L label="Partners (; separated)"><Input list="vp-partners" value={list("partners")} onChange={(e) => set("partners", splitList(e.target.value))} /></L>
          <L label="Network attendees (count)"><Input type="number" value={form.networkCount || ""} onChange={(e) => set("networkCount", Number(e.target.value) || 0)} /></L>
          <L label="Event contact"><Input value={form.eventContact || ""} onChange={(e) => set("eventContact", e.target.value)} /></L>
          <L label="Website"><Input value={form.website || ""} onChange={(e) => set("website", e.target.value)} /></L>
          <L label="Luma / RSVP link"><Input value={form.lumaUrl || ""} onChange={(e) => set("lumaUrl", e.target.value)} /></L>
          <L label="Actions needed" full><Input value={form.actionsNeeded || ""} onChange={(e) => set("actionsNeeded", e.target.value)} /></L>
          <L label="Notes" full><Textarea rows={3} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></L>
        </div>
        <datalist id="vp-owners">{options.owners.map((o) => <option key={o} value={o} />)}</datalist>
        <datalist id="vp-portcos">{options.portcos.map((o) => <option key={o} value={o} />)}</datalist>
        <datalist id="vp-partners">{options.partners.map((o) => <option key={o} value={o} />)}</datalist>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : form.urid ? "Save changes" : "Add event"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function L({ label, children, full, hint }: { label: string; children: React.ReactNode; full?: boolean; hint?: string }) {
  return (
    <div className={cn("space-y-1", full && "col-span-2")}>
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── CSV import ────────────────────────────────────────────────
function toIsoDate(raw: string): { start: string; end: string } {
  const s = raw.trim();
  const full = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (full) {
    const y = +full[3] < 100 ? 2000 + +full[3] : +full[3];
    return parseTrackerDate(s.replace(/\/\d{2,4}/, ""), y);
  }
  const p = parseTrackerDate(s, new Date().getFullYear());
  if (p.start) return p;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t).toISOString().slice(0, 10);
    return { start: d, end: d };
  }
  return { start: "", end: "" };
}

function CsvImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { email } = useAuth();
  const add = useServerFn(addPlannerEventsFn);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<number, ImportField | "">>({});
  const [status, setStatus] = useState<"Potential" | "Confirmed">("Potential");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");

  async function onFile(f: File) {
    const r = parsePlannerCsv(await f.text());
    setFileName(f.name);
    setRows(r);
    setMap(guessImportMapping(r[0] || []));
  }
  const headers = rows[0] || [];
  const body = rows.slice(1);
  const nameCol = Object.entries(map).find(([, f]) => f === "name")?.[0];

  function build(): Partial<PlannerEvent>[] {
    return body.map((r) => {
      const e: Partial<PlannerEvent> = { status, source: "CSV", sourceRef: fileName, subcategory: "Unassigned" };
      Object.entries(map).forEach(([i, f]) => {
        const v = (r[+i] || "").trim();
        if (!f || !v) return;
        if (f === "start") Object.assign(e, toIsoDate(v));
        else if (f === "end") e.end = toIsoDate(v).start;
        else if (f === "sectors" || f === "portcos" || f === "partners") e[f] = splitList(v);
        else if (f === "status") e.status = mapTrackerStatus(v);
        else if (f === "subcategory") e.subcategory = SUBCATS.find((s) => s.toLowerCase() === v.toLowerCase()) || "Unassigned";
        else (e as Record<string, unknown>)[f] = v;
      });
      return e;
    }).filter((e) => e.name);
  }

  async function run() {
    const events = build();
    if (!events.length) return toast.error("Map a column to Event name first");
    setBusy(true);
    try {
      const r = await add({ data: { events, by: email || "" } });
      toast.success(`Imported ${r.added} event${r.added === 1 ? "" : "s"}${r.skipped.length ? ` · ${r.skipped.length} duplicates skipped` : ""}`);
      setRows([]);
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Import events from CSV</DialogTitle></DialogHeader>
        <Input type="file" accept=".csv,text/csv,.tsv,.txt" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {headers.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground">{body.length} rows found. Match each column to an event field.</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-32 truncate font-medium" title={h}>{h || `Column ${i + 1}`}</span>
                  <Select value={map[i] || "__skip"} onValueChange={(v) => setMap((m) => ({ ...m, [i]: v === "__skip" ? "" : (v as ImportField) }))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__skip">Skip</SelectItem>
                      {IMPORT_FIELDS.map((f) => <SelectItem key={f} value={f}>{IMPORT_FIELD_LABELS[f]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs">
              Add as
              <Seg value={status} onChange={(v) => setStatus(v as "Potential" | "Confirmed")} options={["Potential", "Confirmed"]} />
              <span className="text-muted-foreground">(a mapped Status column overrides this)</span>
            </div>
            {nameCol !== undefined && (
              <div className="rounded border border-border p-2 text-xs space-y-0.5 max-h-40 overflow-y-auto">
                {build().slice(0, 8).map((e, i) => (
                  <div key={i}>{e.name} <span className="text-muted-foreground">· {e.start || "no date"} {e.location ? `· ${e.location}` : ""}</span></div>
                ))}
              </div>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={run} disabled={busy || !body.length}>{busy ? "Importing…" : `Import ${build().length || ""} events`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkDialog({ open, onClose, onExtracted }: { open: boolean; onClose: () => void; onExtracted: (e: Partial<PlannerEvent>) => void }) {
  const extract = useServerFn(extractEventFromUrlFn);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const e = await extract({ data: { url: url.trim() } });
      onExtracted({ ...e, subcategory: "Unassigned" });
      setUrl("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add event from a link</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Paste a Luma page or event website. Venture Pulse reads it and fills in the details for you to review.</p>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://lu.ma/…" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={go} disabled={busy || !url.trim()}>{busy ? "Reading page…" : "Read event"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Checkbox filled with its legend colour: faint when off, solid with a tick when on. */
function ColorCheck({ color, checked, onChange, round }: { color: string; checked: boolean; onChange: (v: boolean) => void; round?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(ev) => { ev.preventDefault(); onChange(!checked); }}
      className={cn("relative h-3.5 w-3.5 shrink-0 border-2 flex items-center justify-center", round ? "rounded-full" : "rounded-[3px]")}
      style={{ borderColor: color, background: color, opacity: checked ? 1 : 0.55 }}
    >
      {checked && <Check className="h-2.5 w-2.5 text-background" strokeWidth={4} />}
    </button>
  );
}

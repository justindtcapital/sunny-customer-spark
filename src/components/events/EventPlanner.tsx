import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft, ChevronRight, Plus, Upload, Link2, RefreshCw, ExternalLink, Pencil, CheckCircle2, Search, Check,
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
import { eventReferenceNames } from "@/lib/event-cleanup";
import { teamMemberFor, teamProfile } from "@/lib/user-ownership";
import { eventMatchesFilters, mergeEventAutofill, type EventView } from "@/lib/event-views";
import type { AsanaEvent, Contact } from "@/lib/types";
import {
  PLANNER_CATEGORIES, PLANNER_SECTORS, IMPORT_FIELDS, IMPORT_FIELD_LABELS,
  plannerWindow, stepAnchor, overlaps, columnFor, windowTotals, priorYears, subcategoryColor,
  sectorDotColor, normalizeSector, guessImportMapping, parsePlannerCsv, parseTrackerDate, splitList, parseEventDate, dominantYear, dtcStatusOf,
  mapTrackerStatus, eventSeriesKey, DTC_STATUSES, DEFAULT_DTC_STATUSES, dtcStatusOf, asanaSubcategory, categoryOfSubcategory,
  duplicateKey,
  type PlannerEvent, type PlannerZoom, type PlannerAttendee, type ImportField,
} from "@/lib/event-planner";
import {
  fetchPlannerFn, addPlannerEventsFn, updatePlannerEventFn, enrichFromAsanaFn, fetchAsanaOverlayFn,
  extractEventFromUrlFn, addPlannerAttendeesFn,
} from "@/utils/event-planner.functions";

const SUBCATS = PLANNER_CATEGORIES.flatMap((c) => c.subcategories.map((s) => s.name));
const today = () => new Date().toISOString().slice(0, 10);
const tileVar = (sub: string) => `var(--planner-${subcategoryColor(sub)})`;

/** Read-only planner-shaped view of a live Asana event (Show Asana data overlay). */
function asanaToPlanner(a: AsanaEvent): PlannerEvent {
  const sub = asanaSubcategory(a);
  return {
    urid: `asana:${a.gid}`, name: a.name, start: a.date, end: a.date, location: "",
    category: categoryOfSubcategory(sub), subcategory: sub,
    status: a.status === "completed" ? "Confirmed" : "Potential",
    sectors: a.sectors || [], portcos: a.portcos || [], partners: [], owner: a.owner || "",
    format: a.format || "", website: "", lumaUrl: "", source: "Asana (live)",
    sourceRef: `https://app.asana.com/0/0/${a.gid}`, asanaGid: a.gid,
    networkCount: a.attendeeCount || 0, notes: "", actionsNeeded: "", eventContact: "",
    createdBy: "", updated: "", dtcStatus: "",
  };
}

export const plannerQueryKey = ["event-planner"];

export function EventPlanner({ contacts, view = "planner", openEventName, renderView }: {
  contacts: Contact[];
  view?: EventView;
  openEventName?: string;
  renderView?: (events: PlannerEvent[], onSelect: (event: PlannerEvent) => void) => ReactNode;
}) {
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

  const [showAsana, setShowAsana] = useState(false);
  const { data: asanaOverlay } = useQuery({
    queryKey: ["asana-overlay"],
    queryFn: () => fetchAsanaOverlayFn(),
    enabled: showAsana,
    staleTime: 60_000,
  });
  // Live Asana overlay: only events not already in the tracker (by gid or name+date).
  const asanaExtras = useMemo(() => {
    if (!showAsana || !asanaOverlay?.events) return [] as PlannerEvent[];
    const gids = new Set(events.map((e) => e.asanaGid).filter(Boolean));
    const keys = new Set(events.map(duplicateKey));
    return asanaOverlay.events
      .filter(
        (a) =>
          a.gid && !a.gid.startsWith("app-") && a.date &&
          !gids.has(a.gid) && !events.some(e => e.sourceRef.includes(`/0/0/${a.gid}`)) &&
          !keys.has(duplicateKey({ name: a.name, start: a.date })),
      )
      .map(asanaToPlanner);
  }, [showAsana, asanaOverlay, events]);
  const allEvents = useMemo(() => [...events, ...asanaExtras], [events, asanaExtras]);

  const [zoom, setZoom] = useState<PlannerZoom>("year");
  const [anchor, setAnchor] = useState(today());
  const [search, setSearch] = useState("");
  const [subFilter, setSubFilter] = useState<string[]>([]);
  const [sectorFilter, setSectorFilter] = useState<string[]>([]);
  const [dtcFilter, setDtcFilter] = useState<string[]>([...DEFAULT_DTC_STATUSES]);
  const [portco, setPortco] = useState("");
  const [partner, setPartner] = useState("");
  const [owner, setOwner] = useState("");
  const [source, setSource] = useState("");
  const [selected, setSelected] = useState<PlannerEvent | null>(null);
  const [editing, setEditing] = useState<Partial<PlannerEvent> | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const enrichFn = useServerFn(enrichFromAsanaFn);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (!openEventName) return;
    const target = openEventName.trim().toLowerCase();
    const match = events.find(e => eventReferenceNames(e).some(name => name.toLowerCase() === target));
    if (match) setSelected(match);
  }, [openEventName, events]);

  const win = useMemo(() => plannerWindow(zoom, anchor), [zoom, anchor]);
  const options = useMemo(() => {
    const u = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      portcos: u(events.flatMap((e) => e.portcos)),
      partners: u(events.flatMap((e) => e.partners)),
      owners: u(events.flatMap((e) => splitList(e.owner).map(o => teamMemberFor(o)?.displayName || o))),
      sources: u(allEvents.map((e) => e.source)),
    };
  }, [allEvents]);

  const filtered = useMemo(() => {
    return allEvents.filter(e => eventMatchesFilters(e, {
      search, subcategories: subFilter, sectors: sectorFilter, statuses: dtcFilter,
      statusView: "Both", portco, partner, owner, source,
    }, today()));
  }, [allEvents, search, subFilter, sectorFilter, dtcFilter, portco, partner, owner, source]);

  const inWindow = filtered.filter((e) => overlaps(e, win.start, win.end));
  const undated = filtered.filter((e) => !e.start);

  async function mergeAsana() {
    if (!window.confirm("One-time merge: fill empty event fields from Asana and combine same-date duplicates in the tracker. Continue?"))
      return;
    setMerging(true);
    try {
      const r = await enrichFn({ data: { by: email || "" } });
      toast.success(
        `Enriched ${r.enriched} event${r.enriched === 1 ? "" : "s"}, merged ${r.merged} duplicate${r.merged === 1 ? "" : "s"}` +
          (r.unmatchedAsana ? ` · ${r.unmatchedAsana} Asana-only left` : ""),
      );
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMerging(false);
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
      </aside>

      <div className="min-w-0 space-y-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {view === "planner" && <><Seg value={zoom} onChange={(v) => setZoom(v as PlannerZoom)} options={["week", "month", "year"]} />
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setAnchor(stepAnchor(zoom, anchor, -1))} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAnchor(today())}>Today</Button>
            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setAnchor(stepAnchor(zoom, anchor, 1))} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-sm font-semibold min-w-[150px]">{win.label}</div></>}
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
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <Checkbox checked={showAsana} onCheckedChange={(v) => setShowAsana(!!v)} /> Show Asana data
            </label>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={mergeAsana} disabled={merging}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1", merging && "animate-spin")} /> Merge Asana data
            </Button>
          </div>
        </div>
        {data?.error && <p className="text-xs text-destructive">Couldn't read the event tracker: {data.error}</p>}

        {view !== "planner" && renderView ? renderView(filtered, setSelected) : <>
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
                        // Week/month: a multi-day event appears in every column it spans.
                        .filter((e) => (zoom === "year" ? columnFor(e, win) === col.key : overlaps(e, col.start, col.end)))
                        .sort((a, b) => a.start.localeCompare(b.start))
                        .map((e) => (
                          <Tile
                            key={e.urid}
                            e={e}
                            zoom={zoom}
                            clipStart={zoom !== "year" && !!e.start && e.start < col.start}
                            clipEnd={zoom !== "year" && !!e.end && e.end > col.end}
                            onClick={() => setSelected(e)}
                          />
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
          <p className="text-xs text-muted-foreground">No events yet — add one, import a CSV or turn on Show Asana data.</p>
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
        </>}
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
      <CsvImportDialog open={csvOpen} onClose={() => setCsvOpen(false)} onDone={({ firstDate, statuses }) => {
        refresh();
        if (firstDate) setAnchor(firstDate);
        const hidden = statuses.filter((s) => !dtcFilter.includes(s));
        if (hidden.length) { setDtcFilter((f) => [...new Set([...f, ...hidden])]); toast.info(`Showing ${hidden.join(", ")} events so your import is visible`); }
      }} />
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

function Tile({ e, zoom, clipStart, clipEnd, onClick }: {
  e: PlannerEvent;
  zoom: PlannerZoom;
  /** Event started before this column (continuation from the left). */
  clipStart?: boolean;
  /** Event continues past this column. */
  clipEnd?: boolean;
  onClick: () => void;
}) {
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
          {clipStart && "◂ "}{e.name}{clipEnd && " ▸"}
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
  const asanaOnly = !!e && e.urid.startsWith("asana:");
  const people = useMemo(() => {
    if (!e) return [];
    const keys = new Set(eventReferenceNames(e).map(eventSeriesKey));
    const rows = attendees.filter((a) => a.eventUrid === e.urid).map((a) => ({ name: a.name, email: a.email, kind: a.kind || "Network", status: a.status || "Attended" }));
    const seen = new Set(rows.map((r) => (r.email || r.name).toLowerCase()));
    for (const c of contacts) {
      const hit = c.eventsAttended.some((x) => keys.has(eventSeriesKey(x))) || c.eventsInvited.some((x) => keys.has(eventSeriesKey(x)));
      if (!hit) continue;
      const k = (c.email || c.name).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({ name: c.name, email: c.email, kind: "Network", status: c.eventsAttended.some((x) => keys.has(eventSeriesKey(x))) ? "Attended" : "Invited" });
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
                <Badge variant="secondary">{dtcStatusOf(e, today())}</Badge>
                {e.sectors.map((s) => (
                  <Badge key={s} variant="secondary" className="gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--sector-${sectorDotColor(s)})` }} />
                    {normalizeSector(s)}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                {!asanaOnly && (
                  <Button size="sm" variant="outline" onClick={() => onEdit(e)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                )}
                {!asanaOnly && e.status !== "Confirmed" && (
                  <Button size="sm" onClick={promote}><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark confirmed</Button>
                )}
                {asanaOnly && <Badge variant="outline" className="text-xs">Live from Asana — not yet in the tracker</Badge>}
              </div>
              <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
                <Field k="Dates" v={shortDate(e) + (e.start ? ` ${e.start.slice(0, 4)}` : "")} />
                <Field k="Location" v={e.location} />
                <Field k="Format" v={e.format} />
                <Field k="Category" v={`${e.category} › ${e.subcategory}`} />
                <Field k="Owner" v={splitList(e.owner).map(o => teamMemberFor(o)?.displayName || o).join(", ")} />
                <Field k="PortCos" v={e.portcos.join(", ")} />
                <Field k="Partners" v={e.partners.join(", ")} />
                <Field k="Event contact" v={e.eventContact} />
                <Field k="Actions needed" v={e.actionsNeeded} />
                <Field k="Source" v={`${e.source}${e.sourceRef && !/^https?:/.test(e.sourceRef) ? ` · ${e.sourceRef}` : ""}`} />
                <Field k="Added by" v={teamMemberFor(e.createdBy)?.displayName || teamProfile(e.createdBy)?.displayName || ""} />
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
                  {!asanaOnly && (
                  <Input value={q} onChange={(x) => setQ(x.target.value)} placeholder="Add a Network contact…" className="h-7 text-xs" />
                  )}
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
  const extract = useServerFn(extractEventFromUrlFn);
  const [form, setForm] = useState<Partial<PlannerEvent>>({});
  const [key, setKey] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [filling, setFilling] = useState(false);
  if (initial !== key) {
    setKey(initial);
    setForm(initial || {});
  }
  const set = <K extends keyof PlannerEvent>(k: K, v: PlannerEvent[K]) => setForm((f) => ({ ...f, [k]: v }));
  const list = (k: "sectors" | "portcos" | "partners") => (form[k] || []).join("; ");

  async function autofill() {
    const url = form.website?.trim();
    if (!url) return;
    setFilling(true);
    try {
      const extracted = await extract({ data: { url } });
      setForm(current => mergeEventAutofill(current, extracted));
      toast.success("Event details filled — ready to review");
    } catch (error) {
      toast.error((error as Error).message);
    } finally { setFilling(false); }
  }

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
        if (r.review.length) toast.warning("A possible matching event needs review in Admin; your incoming fields and tags were retained.");
        else if (r.skipped.length) toast.warning("This exact event already exists");
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
          <L label="Website" full>
            <div className="flex flex-wrap gap-2">
              <Input aria-label="Event website" type="url" className="flex-1 min-w-0" placeholder="https://…" value={form.website || ""} onChange={(e) => set("website", e.target.value)} />
              <Button variant="outline" onClick={autofill} disabled={filling || !form.website?.trim()}>
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", filling && "animate-spin")} />
                {filling ? "Reading page…" : "Autofill from link"}
              </Button>
            </div>
          </L>
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
          <L label="Luma / RSVP link"><Input value={form.lumaUrl || ""} onChange={(e) => set("lumaUrl", e.target.value)} /></L>
          <L label="Actions needed" full><Input value={form.actionsNeeded || ""} onChange={(e) => set("actionsNeeded", e.target.value)} /></L>
          <L label="Notes" full><Textarea rows={3} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></L>
        </div>
        <datalist id="vp-owners">{options.owners.map((o) => <option key={o} value={o} />)}</datalist>
        <datalist id="vp-portcos">{options.portcos.map((o) => <option key={o} value={o} />)}</datalist>
        <datalist id="vp-partners">{options.partners.map((o) => <option key={o} value={o} />)}</datalist>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || filling}>{saving ? "Saving…" : form.urid ? "Save changes" : "Add event"}</Button>
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
type CsvRow = { event: Partial<PlannerEvent>; error?: string; line: number };

function CsvImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (r: { firstDate: string; statuses: string[] }) => void }) {
  const { email } = useAuth();
  const add = useServerFn(addPlannerEventsFn);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<number, ImportField | "">>({});
  const [status, setStatus] = useState<"Potential" | "Confirmed">("Potential");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [result, setResult] = useState<null | { added: number; skipped: number; review: number; rejected: { name: string; reason: string }[] }>(null);

  async function onFile(f: File) {
    const r = parsePlannerCsv(await f.text());
    setFileName(f.name);
    setRows(r);
    const m = guessImportMapping(r[0] || []);
    setMap(m);
    const dateCols = Object.entries(m).filter(([, f]) => f === "start" || f === "end").map(([i]) => +i);
    setYear(dominantYear(r.slice(1).flatMap((row) => dateCols.map((i) => row[i] || "")), new Date().getFullYear()));
    setResult(null);
  }
  const headers = rows[0] || [];
  const body = rows.slice(1);
  const nameCol = Object.entries(map).find(([, f]) => f === "name")?.[0];

  function buildRows(): CsvRow[] {
    return body.map((r, n) => {
      const e: Partial<PlannerEvent> = { status, source: "CSV", sourceRef: fileName, subcategory: "Unassigned" };
      let error: string | undefined;
      let sawDate = false;
      Object.entries(map).forEach(([i, f]) => {
        const v = (r[+i] || "").trim();
        if (!f || !v) return;
        if (f === "start") {
          sawDate = true;
          const d = parseEventDate(v, year);
          if (d.error) error = d.error; else { e.start = d.start; e.end = e.end && e.end > d.end ? e.end : d.end; }
        } else if (f === "end") {
          const d = parseEventDate(v, year);
          if (d.error) error = `End: ${d.error}`; else e.end = d.end;
        }
        else if (f === "sectors" || f === "portcos" || f === "partners") e[f] = splitList(v);
        else if (f === "status") e.status = mapTrackerStatus(v);
        else if (f === "subcategory") e.subcategory = SUBCATS.find((s) => s.toLowerCase() === v.toLowerCase()) || "Unassigned";
        else (e as Record<string, unknown>)[f] = v;
      });
      if (!error && !sawDate) error = "No start date";
      if (!error && e.start && e.end && e.end < e.start) error = "End date before start";
      return { event: e, error, line: n + 2 };
    }).filter((x) => x.event.name);
  }
  const built = buildRows();
  const valid = built.filter((x) => !x.error);
  const invalid = built.filter((x) => x.error);

  function downloadRejected(list: { name: string; reason: string }[]) {
    const csv = ["Event,Reason", ...list.map((x) => `"${x.name.replace(/"/g, '""')}","${x.reason.replace(/"/g, '""')}"`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `rejected-${fileName || "events"}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function run() {
    if (nameCol === undefined) return toast.error("Map a column to Event name first");
    const events = valid.map((x) => x.event);
    const clientRejected = invalid.map((x) => ({ name: `${x.event.name} (row ${x.line})`, reason: x.error || "Invalid" }));
    if (!events.length) { setResult({ added: 0, skipped: 0, review: 0, rejected: clientRejected }); return toast.error("No rows have a readable date"); }
    setBusy(true);
    try {
      const r = await add({ data: { events, by: email || "" } });
      const rejected = [...clientRejected, ...(r.rejected || [])];
      setResult({ added: r.added, skipped: r.skipped.length, review: r.review.length, rejected });
      const message = `Imported ${r.added} event${r.added === 1 ? "" : "s"}${r.skipped.length ? ` · ${r.skipped.length} exact duplicates skipped` : ""}${r.review.length ? ` · ${r.review.length} need review in Admin` : ""}${rejected.length ? ` · ${rejected.length} rejected` : ""}`;
      if (!r.added) toast.error(message); else if (r.review.length || rejected.length) toast.warning(message); else toast.success(message);
      const savedNames = new Set(r.outcomes.filter((o: { status: string }) => o.status === "changed").map((o: { label: string }) => o.label));
      const saved = events.filter((e) => savedNames.has(clean(e.name)));
      const firstDate = saved.map((e) => e.start || "").filter(Boolean).sort()[0] || "";
      setRows([]);
      onDone({ firstDate, statuses: [...new Set(saved.map((e) => dtcStatusOf(e as PlannerEvent)))] });
      if (!rejected.length) onClose();
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
              Year for dates without one
              <Input type="number" className="h-7 w-20 text-xs" value={year} onChange={(e) => setYear(+e.target.value || new Date().getFullYear())} aria-label="Default year" />
            </div>
            <div className="flex items-center gap-2 text-xs">
              Add as
              <Seg value={status} onChange={(v) => setStatus(v as "Potential" | "Confirmed")} options={["Potential", "Confirmed"]} />
              <span className="text-muted-foreground">(a mapped Status column overrides this)</span>
            </div>
            {nameCol !== undefined && (
              <div className="rounded border border-border p-2 text-xs space-y-0.5 max-h-40 overflow-y-auto">
                <div className="font-medium">{valid.length} ready · {invalid.length} will be rejected</div>
                {invalid.slice(0, 20).map((x) => (
                  <div key={`x${x.line}`} className="text-destructive">Row {x.line}: {x.event.name} — {x.error}</div>
                ))}
                {valid.slice(0, 8).map((x) => (
                  <div key={x.line}>{x.event.name} <span className="text-muted-foreground">· {x.event.start}{x.event.end && x.event.end !== x.event.start ? ` → ${x.event.end}` : ""} {x.event.location ? `· ${x.event.location}` : ""}</span></div>
                ))}
              </div>
            )}
          </>
        )}
        {result && (
          <div className="rounded border border-border p-2 text-xs space-y-1">
            <div className="font-medium">Imported {result.added} · Duplicates {result.skipped} · Need review {result.review} · Rejected {result.rejected.length}</div>
            {result.rejected.slice(0, 20).map((x, i) => <div key={i} className="text-destructive">{x.name} — {x.reason}</div>)}
            {result.rejected.length > 0 && <Button size="sm" variant="outline" onClick={() => downloadRejected(result.rejected)}>Download rejected rows</Button>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{result ? "Close" : "Cancel"}</Button>
          <Button onClick={run} disabled={busy || !valid.length}>{busy ? "Importing…" : `Import ${valid.length || ""} events`}</Button>
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

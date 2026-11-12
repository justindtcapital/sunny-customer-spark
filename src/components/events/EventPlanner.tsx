import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft, ChevronRight, Plus, Upload, Link2, RefreshCw, ExternalLink, CheckCircle2, Search, Check, Trash2, History, X, SlidersHorizontal,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { MultiSelect } from "@/components/ui/multi-select";
import { useEventFiltersSlot } from "@/lib/page-actions-slot";
import { useAuth } from "@/lib/auth-context";
import { eventReferenceNames } from "@/lib/event-cleanup";
import { campaignsForEvent, eventPeople } from "@/lib/event-people";
import { ownerInitials, isClosedStatus } from "@/lib/campaign-results";
import { CampaignTypeBadge, statusLabel } from "@/components/campaigns/CampaignList";
import { fetchTargets } from "@/utils/sheets.functions";
import { fetchCampaigns } from "@/utils/campaigns.functions";
import { Link } from "@tanstack/react-router";
import { teamMemberFor, teamProfile } from "@/lib/user-ownership";
import { eventMatchesFilters, mergeEventAutofill, type EventView } from "@/lib/event-views";
import type { AsanaEvent, Contact, TargetLead } from "@/lib/types";
import {
  PLANNER_CATEGORIES, PLANNER_SECTORS, IMPORT_FIELDS, IMPORT_FIELD_LABELS,
  plannerWindow, stepAnchor, overlaps, columnFor, windowTotals, priorYears, subcategoryColor,
  sectorDotColor, normalizeSector, guessImportMapping, parsePlannerCsv, splitList, parseEventDate, dominantYear,
  mapTrackerStatus, eventSeriesKey, DTC_STATUSES, DEFAULT_DTC_STATUSES, dtcStatusOf, asanaSubcategory, categoryOfSubcategory,
  duplicateKey, plannerCategories, placementRow, plannerStatusForDtc, canonicalSubcategory, PARTNER_ROWS, POTENTIAL_ROW,
  type PlannerCategory, type PlannerPartnerCategory,
  type PlannerEvent, type PlannerZoom, type PlannerAttendee, type ImportField,
} from "@/lib/event-planner";
import {
  fetchPlannerFn, addPlannerEventsFn, updatePlannerEventFn, deletePlannerEventFn, enrichFromAsanaFn, fetchAsanaOverlayFn,
  extractEventFromUrlFn, addPlannerAttendeesFn, fetchEventTagsFn, setPlannerPartnerFn, fetchPartnerNamesFn,
} from "@/utils/event-planner.functions";
import { EventHistoryDialog, EventHistorySection } from "./EventHistory";
import { AttendanceReconcileDialog } from "./AttendanceReconcileDialog";
import type { HistoryLink } from "@/lib/event-history";

const SUBCATS = PLANNER_CATEGORIES.flatMap((c) => c.subcategories.map((s) => s.name));
const today = () => new Date().toISOString().slice(0, 10);
// Categories in use (fixed + partners broken out from the Partners list); set by EventPlanner on render.
let activeCats: PlannerCategory[] = PLANNER_CATEGORIES;
const tileVar = (sub: string) => `var(--planner-${subcategoryColor(sub, activeCats)})`;
const rowOfSub = (sub: string) => activeCats.find((c) => c.subcategories.some((s) => s.name === canonicalSubcategory(sub)))?.name || "Unassigned";

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

const ROW_LABELS: Record<string, string> = { "DTC Led Events": "DTC-led events", "Partner Led Events": "Partner-led events", Briefings: "Briefings", Potential: "Potential" };

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
  const cats = useMemo(() => plannerCategories(data?.partnerCategories ?? []), [data]);
  activeCats = cats;
  const filterSlot = useEventFiltersSlot();

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
  const [portcos, setPortcos] = useState<string[]>([]);
  const [partner, setPartner] = useState("");
  const [owner, setOwner] = useState("");
  const [source, setSource] = useState("");
  const [selected, setSelected] = useState<PlannerEvent | null>(null);
  const [editing, setEditing] = useState<Partial<PlannerEvent> | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [attendOpen, setAttendOpen] = useState(false);
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
      statusView: "Both", portcos, partner, owner, source,
    }, today()));
  }, [allEvents, search, subFilter, sectorFilter, dtcFilter, portcos, partner, owner, source]);

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

  const toggleSub = (name: string, v: boolean) => setSubFilter((p) => (v ? [...p, name] : p.filter((x) => x !== name)));
  const filterBlocks = (
    <>
      {view !== "planner" && (
        <FilterBlock title="Category">
          {cats.filter((c) => c.name !== "Unassigned").map((c) => (
            <div key={c.name} className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.name}</div>
              {c.subcategories.map((s) => (
                <label key={s.name} className="flex items-center gap-2 cursor-pointer">
                  <ColorCheck color={tileVar(s.name)} checked={subFilter.includes(s.name)} onChange={(v) => toggleSub(s.name, v)} />
                  <span className="truncate">{s.name}</span>
                </label>
              ))}
            </div>
          ))}
        </FilterBlock>
      )}
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
      <div className="space-y-1">
        <div className="font-semibold">PortCo</div>
        <MultiSelect options={options.portcos} value={portcos} onChange={setPortcos} placeholder="All" className="h-7 text-xs" />
      </div>
      <FilterSelect label="Partner" value={partner} onChange={setPartner} options={options.partners} />
      <FilterSelect label="Owner" value={owner} onChange={setOwner} options={options.owners} />
      <FilterSelect label="Source" value={source} onChange={setSource} options={options.sources} />
    </>
  );

  return (
    <div className="space-y-3">
      {filterSlot ? createPortal(
        <div className="mt-2 space-y-3 rounded-md border border-dashed border-primary/40 bg-primary/5 p-2 text-xs">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <SlidersHorizontal className="h-3 w-3" /> Event filters
          </div>
          {filterBlocks}
        </div>,
        filterSlot,
      ) : (
        <div className="grid grid-cols-2 gap-4 rounded-md border border-dashed border-border p-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
          {filterBlocks}
        </div>
      )}

      <div className="min-w-0 space-y-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-48">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events" className="h-7 pl-7 text-xs" />
          </div>
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
            <Button size="sm" className="h-7 text-xs" onClick={() => setEditing({ status: "Potential", dtcStatus: "Potential", subcategory: "Unassigned", source: "Manual" })}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add event
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCsvOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1" /> Import CSV
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLinkOpen(true)}>
              <Link2 className="h-3.5 w-3.5 mr-1" /> Add from link
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setHistoryOpen(true)}>
              <History className="h-3.5 w-3.5 mr-1" /> Link past history
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAttendOpen(true)}>
              Match tagged attendees
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

            {[...cats.filter((c) => c.name !== "Unassigned"), { name: POTENTIAL_ROW, subcategories: [] }].map((cat) => {
              const rowEvents = inWindow.filter((e) => placementRow(e, today()) === cat.name);
              const totals = windowTotals(rowEvents, win);
              const isPotential = cat.name === POTENTIAL_ROW;
              const fixed = new Set(PLANNER_CATEGORIES.flatMap((c) => c.subcategories.map((x) => x.name)));
              return (
                <Row key={cat.name}>
                  <div className={cn("border-b border-border p-2 space-y-1", isPotential && "bg-muted/30")}>
                    <div className="text-xs font-semibold">{ROW_LABELS[cat.name] || cat.name}</div>
                    {isPotential && <p className="text-[10px] text-muted-foreground leading-tight">Set DTC Status to Considering to move an event up into its row.</p>}
                    {cat.subcategories.map((s) => (
                      <div key={s.name} className="group flex items-center gap-1.5 text-[10px] leading-tight">
                        <ColorCheck color={tileVar(s.name)} checked={subFilter.includes(s.name)} onChange={(v) => toggleSub(s.name, v)} />
                        <button type="button" className="truncate text-left text-muted-foreground hover:text-foreground" onClick={() => toggleSub(s.name, !subFilter.includes(s.name))}>{s.name}</button>
                        {!fixed.has(s.name) && (
                          <RemovePartnerButton name={s.name} row={cat.name} partners={data?.partnerCategories ?? []} onDone={refresh} />
                        )}
                      </div>
                    ))}
                    {(PARTNER_ROWS as readonly string[]).includes(cat.name) && (
                      <AddPartnerButton row={cat.name} existing={data?.partnerCategories ?? []} onDone={refresh} />
                    )}
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
          <span className="flex items-center gap-1"><span className="h-3 w-5 rounded border-2" style={{ borderColor: "var(--planner-blue)" }} /> Confirmed / Completed</span>
          <span className="flex items-center gap-1"><span className="h-3 w-5 rounded border-2 border-dashed" style={{ borderColor: "var(--planner-blue)" }} /> Considering / Potential</span>
          <span>Tile color = category · dot = sector</span>
        </div>
        </>}
      </div>

      <EventDetail
        event={selected}
        all={events}
        attendees={attendees}
        historyLinks={data?.historyLinks ?? []}
        onOpen={setSelected}
        onHistoryChanged={refresh}
        contacts={contacts}
        officialPortcos={data?.officialPortcos ?? []}
        options={options}
        onClose={() => setSelected(null)}
        onSaved={(e) => { setSelected(e); refresh(); }}
        onDeleted={() => { setSelected(null); refresh(); }}
      />
      <EventForm
        initial={editing}
        options={{ ...options, officialPortcos: data?.officialPortcos ?? [] }}
        onClose={() => setEditing(null)}
        onSaved={(e) => { setEditing(null); if (e) setSelected(e); refresh(); }}
      />
      <CsvImportDialog open={csvOpen} onClose={() => setCsvOpen(false)} onDone={({ firstDate, statuses }) => {
        refresh();
        if (firstDate) setAnchor(firstDate);
        const hidden = statuses.filter((s) => !dtcFilter.includes(s));
        if (hidden.length) { setDtcFilter((f) => [...new Set([...f, ...hidden])]); toast.info(`Showing ${hidden.join(", ")} events so your import is visible`); }
      }} />
      <EventHistoryDialog
        open={historyOpen}
        year={Math.max(Number(anchor.slice(0, 4)) || 0, new Date().getFullYear() + 1)}
        onClose={() => setHistoryOpen(false)}
        onSaved={refresh}
      />
      <AttendanceReconcileDialog open={attendOpen} onClose={() => setAttendOpen(false)} onSaved={refresh} />
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
  event, all, attendees, contacts, onClose, onSaved, onDeleted, historyLinks, onOpen, onHistoryChanged, officialPortcos, options,
}: {
  officialPortcos: string[];
  options: { partners: string[]; owners: string[] };
  historyLinks: HistoryLink[];
  onOpen: (e: PlannerEvent) => void;
  onHistoryChanged: () => void;
  onDeleted: () => void;
  event: PlannerEvent | null;
  all: PlannerEvent[];
  attendees: PlannerAttendee[];
  contacts: Contact[];
  onClose: () => void;
  onSaved: (e: PlannerEvent) => void;
}) {
  const addAtt = useServerFn(addPlannerAttendeesFn);
  const del = useServerFn(deletePlannerEventFn);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [q, setQ] = useState("");
  const e = event;
  const asanaOnly = !!e && e.urid.startsWith("asana:");
  // Prospects and campaigns load lazily (shared caches with the rest of the Events page).
  const targetsQ = useQuery({ queryKey: ["campaign-targets"], queryFn: () => fetchTargets(), staleTime: 60_000, enabled: !!e });
  const campaignsQ = useQuery({ queryKey: ["campaigns"], queryFn: () => fetchCampaigns(), staleTime: 30_000, enabled: !!e });
  const tagsFn = useServerFn(fetchEventTagsFn);
  const refNames = e ? eventReferenceNames(e) : [];
  const tagsQ = useQuery({
    queryKey: ["event-person-tags", ...refNames],
    queryFn: () => tagsFn({ data: { names: refNames } }),
    staleTime: 60_000,
    enabled: !!e && !asanaOnly,
  });
  const prospects = useMemo(() => ((targetsQ.data || []) as TargetLead[]), [targetsQ.data]);
  const people = useMemo(
    () => (e ? eventPeople(e, attendees, contacts, prospects, tagsQ.data?.tags || []) : []),
    [e, attendees, contacts, prospects, tagsQ.data],
  );
  const peopleLoading = targetsQ.isLoading || tagsQ.isLoading;
  const linkedCampaigns = useMemo(
    () => (e ? campaignsForEvent(e, campaignsQ.data?.campaigns || []) : []),
    [e, campaignsQ.data],
  );
  const prior = e ? priorYears(e, all) : [];
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const pool = [
      ...contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, company: c.company, kind: "Network" })),
      ...prospects.map((t) => ({ id: t.id, name: t.name, email: t.email, company: t.company, kind: "Prospect" })),
    ];
    return pool.filter((c) => `${c.name} ${c.email} ${c.company}`.toLowerCase().includes(needle)).slice(0, 8);
  }, [q, contacts, prospects]);

  async function remove() {
    if (!e) return;
    setDeleting(true);
    try {
      const r = await del({ data: { urid: e.urid, expectedUpdated: e.updated, name: e.name } });
      toast.success(`Deleted ${e.name}${r.attendees ? ` and ${r.attendees} attendance record${r.attendees === 1 ? "" : "s"}` : ""}. Contacts were not changed.`);
      setConfirmDelete(false);
      onDeleted();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  async function addPerson(c: { name: string; email: string; kind: string }, status: string) {
    if (!e) return;
    await addAtt({ data: { attendees: [{ eventUrid: e.urid, name: c.name, email: c.email, kind: c.kind, status, date: today() }] } });
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
              <div className="flex gap-2 items-center">
                {asanaOnly ? (
                  <Badge variant="outline" className="text-xs">Live from Asana — not yet in the tracker</Badge>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Changes save as you go.</span>
                )}
                {!asanaOnly && (
                  <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                  </Button>
                )}
              </div>
              {asanaOnly ? (
                <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
                  <Field k="Dates" v={shortDate(e) + (e.start ? ` ${e.start.slice(0, 4)}` : "")} />
                  <Field k="Category" v={`${e.category} › ${e.subcategory}`} />
                  <Field k="Owner" v={splitList(e.owner).map(o => teamMemberFor(o)?.displayName || o).join(", ")} />
                  <Field k="PortCos" v={e.portcos.join(", ")} />
                </dl>
              ) : (
                <InlineEventEditor key={e.urid} event={e} officialPortcos={officialPortcos} options={options} onSaved={onSaved} />
              )}
              {asanaOnly && e.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{e.notes}</p>}
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
                  <Input value={q} onChange={(x) => setQ(x.target.value)} placeholder="Add a Network contact or prospect…" className="h-7 text-xs" />
                  )}
                  {matches.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow">
                      {matches.map((c) => (
                        <div key={c.id} className="flex items-center justify-between px-2 py-1 text-xs hover:bg-muted">
                          <span className="truncate">{c.name} <span className="text-muted-foreground">{c.company}</span>{c.kind === "Prospect" && <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px]">Prospect</Badge>}</span>
                          <span className="flex gap-1 shrink-0">
                            <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]" onClick={() => addPerson(c, "Invited")}>Invited</Button>
                            <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]" onClick={() => addPerson(c, "Attended")}>Attended</Button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {people.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    {(["Attended", "Registered", "Invited"] as const)
                      .map((st) => [st, people.filter((p) => p.status === st).length] as const)
                      .filter(([, n]) => n > 0)
                      .map(([st, n]) => `${n} ${st.toLowerCase()}`)
                      .join(" · ")}
                  </p>
                )}
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {people.map((p) => (
                    <div key={p.key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">
                        {p.name}
                        {p.company && <span className="text-muted-foreground"> · {p.company}</span>}
                        {!p.company && p.email && p.email !== p.name && <span className="text-muted-foreground"> · {p.email}</span>}
                      </span>
                      <span className="flex gap-1 shrink-0">
                        <Badge variant="outline" className={cn("h-4 px-1 text-[9px]", p.kind === "Not in CRM" && "text-muted-foreground border-dashed")}>{p.kind}</Badge>
                        <Badge variant={p.status === "Attended" ? "default" : "secondary"} className="h-4 px-1 text-[9px]">{p.status}</Badge>
                      </span>
                    </div>
                  ))}
                  {people.length === 0 && (
                    <p className="text-xs text-muted-foreground">{peopleLoading ? "Loading attendees…" : "No attendees or invites yet."}</p>
                  )}
                </div>
              </section>

              <section className="space-y-1.5">
                <h3 className="text-xs font-semibold">Campaigns ({linkedCampaigns.length})</h3>
                {campaignsQ.isLoading && <p className="text-xs text-muted-foreground">Loading campaigns…</p>}
                {!campaignsQ.isLoading && linkedCampaigns.length === 0 && (
                  <p className="text-xs text-muted-foreground">No campaigns are tied to this event.</p>
                )}
                {linkedCampaigns.map((c) => (
                  <Link
                    key={c.id}
                    to="/campaigns"
                    search={{ campaign: c.id }}
                    className={cn("flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted/50", isClosedStatus(c.status) && "opacity-70")}
                  >
                    <span className="min-w-0 flex items-center gap-1.5">
                      <span className="truncate font-medium">{c.name}</span>
                      <CampaignTypeBadge purpose={c.purpose} />
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0 text-[10px] text-muted-foreground">
                      {typeof c.memberCount === "number" && <span>{c.memberCount} people</span>}
                      <Badge variant="secondary" className="h-4 px-1 text-[9px] capitalize">{statusLabel(c.status)}</Badge>
                      {c.owner && (
                        <span title={c.owner} className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[8px] font-semibold text-primary">
                          {ownerInitials(c.owner)}
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </section>

              <EventHistorySection event={e} links={historyLinks} all={all} attendees={attendees} onChanged={onHistoryChanged} onOpen={onOpen} />

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
        <AlertDialog open={confirmDelete} onOpenChange={(o) => !deleting && setConfirmDelete(o)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {e?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Removes this event and its attendance records from the tracker. People stay in the CRM. A copy is kept in the "Deleted Events" tab so it can be restored.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={deleting} onClick={(x) => { x.preventDefault(); void remove(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? "Deleting…" : "Delete event"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

// ── Inline editing in the side panel (each field saves on its own, one save at a time) ──
function InlineEventEditor({ event: e, officialPortcos, options, onSaved }: {
  event: PlannerEvent;
  officialPortcos: string[];
  options: { partners: string[]; owners: string[] };
  onSaved: (e: PlannerEvent) => void;
}) {
  const update = useServerFn(updatePlannerEventFn);
  const updatedRef = useRef(e.updated);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const [savedKey, setSavedKey] = useState("");
  const [savingKey, setSavingKey] = useState("");
  useEffect(() => { updatedRef.current = e.updated; }, [e.updated]);

  function save(key: string, patch: Partial<PlannerEvent>) {
    chain.current = chain.current.then(async () => {
      setSavingKey(key);
      try {
        const next = await update({ data: { urid: e.urid, patch, expectedUpdated: updatedRef.current } });
        updatedRef.current = next.updated;
        onSaved(next);
        setSavedKey(key);
        setTimeout(() => setSavedKey((k) => (k === key ? "" : k)), 1500);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setSavingKey("");
      }
    });
  }
  const dtc = dtcStatusOf(e, today());
  const sub = canonicalSubcategory(e.subcategory);
  const mark = (key: string) =>
    savingKey === key ? <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" /> : savedKey === key ? <Check className="h-3 w-3 text-primary" /> : null;
  const knownSectors = new Set<string>(PLANNER_SECTORS);
  const sectors = [...new Set(e.sectors.map(normalizeSector))];

  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
      <Row2 label="Name" mark={mark("name")}><TextCell value={e.name} onCommit={(v) => v.trim() ? save("name", { name: v.trim() }) : toast.error("Event name is required")} /></Row2>
      <Row2 label="DTC Status" mark={mark("status")}>
        <Select value={dtc} onValueChange={(v) => {
          if (v !== "Potential" && v !== "Declined" && rowOfSub(sub) === "Unassigned")
            return void toast.error("Pick a category first so the event can move into its planner row.");
          save("status", { dtcStatus: v, status: plannerStatusForDtc(v) });
        }}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{DTC_STATUSES.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
        </Select>
      </Row2>
      <Row2 label="Category" mark={mark("category")}>
        <Select value={sub} onValueChange={(v) => save("category", { subcategory: v, category: rowOfSub(v) })}>
          <SelectTrigger className="h-7 text-xs">
            <span className="flex min-w-0 items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: tileVar(sub) }} /><SelectValue /></span>
          </SelectTrigger>
          <SelectContent>
            {activeCats.map((c) => c.subcategories.map((s) => (
              <SelectItem key={s.name} value={s.name} className="text-xs">{c.name === "Unassigned" ? "No category" : `${ROW_LABELS[c.name] || c.name} › ${s.name}`}</SelectItem>
            )))}
          </SelectContent>
        </Select>
      </Row2>
      <Row2 label="Start" mark={mark("start")}><TextCell type="date" value={e.start} onCommit={(v) => save("start", { start: v, end: e.end && e.end >= v ? e.end : v })} /></Row2>
      <Row2 label="End" mark={mark("end")}><TextCell type="date" value={e.end} onCommit={(v) => save("end", { end: v })} /></Row2>
      <Row2 label="Location" mark={mark("location")}><TextCell value={e.location} onCommit={(v) => save("location", { location: v })} /></Row2>
      <Row2 label="Format" mark={mark("format")}>
        <Select value={e.format || "__none"} onValueChange={(v) => save("format", { format: v === "__none" ? "" : v })}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none" className="text-xs">—</SelectItem>
            {["in-person", "virtual", "hybrid"].map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </Row2>
      <Row2 label="Sector" mark={mark("sectors")}>
        <div className="flex flex-wrap gap-1 pt-1">
          {[...PLANNER_SECTORS, ...sectors.filter((x) => !knownSectors.has(x))].map((s) => {
            const on = sectors.includes(s);
            return (
              <button key={s} type="button" onClick={() => save("sectors", { sectors: on ? sectors.filter((x) => x !== s) : [...sectors, s] })}
                className={cn("flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]", on ? "border-foreground/30 bg-muted" : "border-border text-muted-foreground opacity-70")}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--sector-${sectorDotColor(s)})` }} />{s}
              </button>
            );
          })}
        </div>
      </Row2>
      <Row2 label="Owner" mark={mark("owner")}><TextCell list="vp-owners-inline" value={e.owner} onCommit={(v) => save("owner", { owner: v })} /></Row2>
      <Row2 label="PortCos" mark={mark("portcos")}><PortcoPicker value={e.portcos} official={officialPortcos} onChange={(v) => save("portcos", { portcos: v })} /></Row2>
      <Row2 label="Partners" mark={mark("partners")}><TextCell list="vp-partners-inline" placeholder="; separated" value={e.partners.join("; ")} onCommit={(v) => save("partners", { partners: splitList(v) })} /></Row2>
      <Row2 label="Network count" mark={mark("networkCount")}><TextCell type="number" value={e.networkCount ? String(e.networkCount) : ""} onCommit={(v) => save("networkCount", { networkCount: Number(v) || 0 })} /></Row2>
      <Row2 label="Event contact" mark={mark("eventContact")}><TextCell value={e.eventContact} onCommit={(v) => save("eventContact", { eventContact: v })} /></Row2>
      <Row2 label="Website" mark={mark("website")}><TextCell type="url" value={e.website} onCommit={(v) => save("website", { website: v.trim() })} /></Row2>
      <Row2 label="Luma / RSVP" mark={mark("lumaUrl")}><TextCell type="url" value={e.lumaUrl} onCommit={(v) => save("lumaUrl", { lumaUrl: v.trim() })} /></Row2>
      <Row2 label="Actions needed" mark={mark("actionsNeeded")}><TextCell value={e.actionsNeeded} onCommit={(v) => save("actionsNeeded", { actionsNeeded: v })} /></Row2>
      <Row2 label="Notes" mark={mark("notes")}><TextCell multiline value={e.notes} onCommit={(v) => save("notes", { notes: v })} /></Row2>
      <div className="pt-1.5 text-[11px] text-muted-foreground">Source</div>
      <div className="pt-1.5 text-[11px] text-muted-foreground break-words">
        {e.source}{e.sourceRef && !/^https?:/.test(e.sourceRef) ? ` · ${e.sourceRef}` : ""}
        {e.createdBy ? ` · added by ${teamMemberFor(e.createdBy)?.displayName || teamProfile(e.createdBy)?.displayName || e.createdBy}` : ""}
      </div>
      <datalist id="vp-owners-inline">{options.owners.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="vp-partners-inline">{options.partners.map((o) => <option key={o} value={o} />)}</datalist>
    </div>
  );
}

function Row2({ label, mark, children }: { label: string; mark: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="flex items-center gap-1 pt-1.5 text-[11px] text-muted-foreground">{label} {mark}</div>
      <div className="min-w-0">{children}</div>
    </>
  );
}

function TextCell({ value, onCommit, type = "text", multiline, list, placeholder }: {
  value: string; onCommit: (v: string) => void; type?: string; multiline?: boolean; list?: string; placeholder?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onCommit(v); };
  if (multiline)
    return <Textarea rows={3} className="min-h-[56px] text-xs" value={v} onChange={(x) => setV(x.target.value)} onBlur={commit} />;
  return (
    <Input type={type} list={list} placeholder={placeholder} className="h-7 text-xs" value={v}
      onChange={(x) => setV(x.target.value)} onBlur={commit}
      onKeyDown={(x) => { if (x.key === "Enter") (x.target as HTMLInputElement).blur(); if (x.key === "Escape") setV(value); }} />
  );
}

// ── Partner categories (break a partner out of "Other" into its own colour) ──
function AddPartnerButton({ row, existing, onDone }: { row: string; existing: PlannerPartnerCategory[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const setFn = useServerFn(setPlannerPartnerFn);
  const { data: names = [], isLoading } = useQuery({ queryKey: ["partner-names"], queryFn: () => fetchPartnerNamesFn(), enabled: open, staleTime: 60_000 });
  const taken = new Set(existing.filter((x) => x.row === row).map((x) => x.partner.toLowerCase()));
  async function add(partner: string) {
    setBusy(true);
    try {
      await setFn({ data: { partner, row } });
      toast.success(`${partner} added to ${ROW_LABELS[row] || row}`);
      setOpen(false);
      onDone();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-1 pt-0.5 text-[10px] text-primary hover:underline" disabled={busy}>
          <Plus className="h-3 w-3" /> Add partner
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search Partners…" className="text-xs" />
          <CommandList>
            <CommandEmpty>{isLoading ? "Loading partners…" : "No partner with that name"}</CommandEmpty>
            <CommandGroup>
              {names.filter((n) => !taken.has(n.toLowerCase())).map((n) => (
                <CommandItem key={n} value={n} onSelect={() => add(n)} className="text-xs">{n}</CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function RemovePartnerButton({ name, row, partners, onDone }: { name: string; row: string; partners: PlannerPartnerCategory[]; onDone: () => void }) {
  const setFn = useServerFn(setPlannerPartnerFn);
  const hit = partners.find((p) => p.row === row && (row === "Briefings" ? `${p.partner} Briefings` : p.partner) === name);
  if (!hit) return null;
  return (
    <button type="button" aria-label={`Remove ${name}`} title="Remove this partner category (its events show as Other)"
      className="ml-auto opacity-0 group-hover:opacity-70 hover:opacity-100"
      onClick={async () => {
        if (!window.confirm(`Remove ${name} as its own category? Its events will show under Other.`)) return;
        try { await setFn({ data: { partner: hit.partner, row, remove: true } }); onDone(); } catch (err) { toast.error((err as Error).message); }
      }}>
      <X className="h-3 w-3" />
    </button>
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

/** PortCo tags come only from the official Portfolio list; legacy unmatched tags show flagged until removed. */
function PortcoPicker({ value, official, onChange }: { value: string[]; official: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const lower = new Set(official.map((o) => o.toLowerCase()));
  const has = (n: string) => value.some((v) => v.toLowerCase() === n.toLowerCase());
  const toggle = (n: string) => onChange(has(n) ? value.filter((v) => v.toLowerCase() !== n.toLowerCase()) : [...value, n]);
  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((v) => {
            const unofficial = official.length > 0 && !lower.has(v.toLowerCase());
            return (
              <Badge key={v} variant={unofficial ? "outline" : "secondary"} className={cn("gap-1 text-[11px]", unofficial && "border-destructive text-destructive")}
                title={unofficial ? "Not in the Portfolio list — remove it or pick the official company" : undefined}>
                {v}
                <button type="button" aria-label={`Remove ${v}`} className="opacity-60 hover:opacity-100" onClick={() => toggle(v)}>×</button>
              </Badge>
            );
          })}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="w-full justify-start text-xs font-normal text-muted-foreground">
            {official.length ? "Add PortCo…" : "Portfolio list unavailable"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search PortCos…" className="text-xs" />
            <CommandList>
              <CommandEmpty>No PortCo with that name</CommandEmpty>
              <CommandGroup>
                {official.map((o) => (
                  <CommandItem key={o} value={o} onSelect={() => toggle(o)} className="text-xs">
                    <CheckCircle2 className={cn("h-3.5 w-3.5 mr-1.5", has(o) ? "opacity-100 text-primary" : "opacity-0")} />{o}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── Add / edit form ────────────────────────────────────────────
function EventForm({
  initial, options, onClose, onSaved,
}: {
  initial: Partial<PlannerEvent> | null;
  options: { portcos: string[]; partners: string[]; owners: string[]; officialPortcos: string[] };
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
            <Select value={canonicalSubcategory(form.subcategory || "Unassigned")} onValueChange={(v) => setForm((f) => ({ ...f, subcategory: v, category: rowOfSub(v) }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {activeCats.map((c) => c.subcategories.map((s) => (
                  <SelectItem key={s.name} value={s.name}>{c.name === "Unassigned" ? "No category" : `${ROW_LABELS[c.name] || c.name} › ${s.name}`}</SelectItem>
                )))}
              </SelectContent>
            </Select>
          </L>
          <L label="DTC Status">
            <Select value={form.dtcStatus || dtcStatusOf({ dtcStatus: "", status: form.status || "Potential", start: form.start || "", end: form.end || "" }, today())}
              onValueChange={(v) => setForm((f) => ({ ...f, dtcStatus: v, status: plannerStatusForDtc(v) }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DTC_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
          <L label="PortCos" hint="Pick from the official Portfolio list"><PortcoPicker value={form.portcos || []} official={options.officialPortcos} onChange={(v) => set("portcos", v)} /></L>
          <L label="Partners (; separated)"><Input list="vp-partners" value={list("partners")} onChange={(e) => set("partners", splitList(e.target.value))} /></L>
          <L label="Network attendees (count)"><Input type="number" value={form.networkCount || ""} onChange={(e) => set("networkCount", Number(e.target.value) || 0)} /></L>
          <L label="Event contact"><Input value={form.eventContact || ""} onChange={(e) => set("eventContact", e.target.value)} /></L>
          <L label="Luma / RSVP link"><Input value={form.lumaUrl || ""} onChange={(e) => set("lumaUrl", e.target.value)} /></L>
          <L label="Actions needed" full><Input value={form.actionsNeeded || ""} onChange={(e) => set("actionsNeeded", e.target.value)} /></L>
          <L label="Notes" full><Textarea rows={3} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></L>
        </div>
        <datalist id="vp-owners">{options.owners.map((o) => <option key={o} value={o} />)}</datalist>
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
      const saved = events.filter((e) => savedNames.has((e.name || "").trim()));
      const firstDate = saved.map((e) => e.start || "").filter(Boolean).sort()[0] || "";
      setRows([]);
      onDone({ firstDate, statuses: [...new Set(saved.map((e) => dtcStatusOf(e as PlannerEvent, today())))] });
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

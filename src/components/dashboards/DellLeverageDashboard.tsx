// Dell Leverage Dashboard: a QBR view of the Sell-In and Sell-With workstreams, written from Dell's
// side. Rows come from fetchDellLeverageFn, which only returns Dell-facing fields (no DTC
// priorities, ROI ratings, owners or notes), so the page is safe to share on screen.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, Loader2, Pencil, RefreshCw, Sparkles, UserRoundX, X } from "lucide-react";
import { PortcoLogo } from "@/components/portfolio/PortcoLogo";
import { draftDellNotesFn, fetchDellLeverageFn, type DellLeverageData } from "@/utils/dell-leverage.functions";
import { updateWorkstreamFn } from "@/utils/asana.functions";
import { useAuth } from "@/lib/auth-context";
import {
  ALL_STAGES, DEFAULT_DELL_FILTER, DELL_MOTIONS, DELL_NOTES_FIELD, NO_BU, PIPELINE_STAGES, buHeatmap, companiesAtStage, companyRelationships, companyStageBoard,
  existingOutcomes, filterDellRows, hasLinkedStakeholder, movementInWindow, peopleOf, productCounts, stageCounts, stakeholderMap, summarizeDell, workstreamsOf,
  type DellFilter, type DellMotion, type DellRow, type DellStage, type DellWorkstream, type Movement, type MovementKind, type StakeholderPerson,
} from "@/lib/dell-leverage";
import { useWorkstreams } from "@/lib/use-workstreams";
import { WorkstreamDetail } from "@/components/portfolio/WorkstreamsPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const MOTION_COLOR: Record<DellMotion, string> = { "Sell-In": "var(--chart-1)", "Sell-With": "var(--chart-3)" };
const ALL = "__all";
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);
const shortStatus = (s: string) => s.replace(/^Existing - /, "");

export function useDellLeverage() {
  const { email, ready } = useAuth();
  return useQuery<DellLeverageData>({ queryKey: ["dell-leverage"], queryFn: () => fetchDellLeverageFn(), enabled: ready && !!email, staleTime: 5 * 60_000 });
}

function Stat({ label, value, sub, onClick, active, dot, dim }: { label: string; value: string; sub?: string; onClick?: () => void; active?: boolean; dot?: string; dim?: boolean }) {
  const body = <CardContent className="p-4">
    <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">{dot && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: dot }} />}{label}</p>
    <p className="font-display text-2xl font-semibold tabular-nums text-foreground mt-1">{value}</p>
    {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
  </CardContent>;
  return <Card className={cn("border-border", active && "ring-2 ring-primary", dim && "opacity-50", onClick && "cursor-pointer transition-shadow hover:shadow-md")} onClick={onClick}>{body}</Card>;
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-lg border border-border px-3 py-2">
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="font-display text-lg font-semibold tabular-nums text-foreground leading-tight">{value}</p>
    {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
  </div>;
}

function Section({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return <Card className={cn("border-border", className)}><CardContent className="p-5">
    <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
    {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    <div className="mt-4">{children}</div>
  </CardContent></Card>;
}

/** Stage bars, Sell-In and Sell-With stacked. Earliest stage on top. Also used on the hub tile. */
export function DellFunnel({ rows, selected, onStage, compact = false }: { rows: DellRow[]; selected?: DellStage | null; onStage?: (s: DellStage) => void; compact?: boolean }) {
  const counts = stageCounts(rows).filter((c) => (PIPELINE_STAGES as DellStage[]).includes(c.stage));
  const max = Math.max(1, ...counts.map((c) => c.total));
  return <div className={cn("w-full", compact ? "space-y-1.5" : "space-y-2")}>
    {counts.map((c) => (
      <button key={c.stage} type="button" disabled={!onStage} onClick={() => onStage?.(c.stage)}
        className={cn("grid w-full items-center gap-3 rounded-md px-1.5 py-1 text-left", compact ? "grid-cols-[8.5rem_1fr_2rem]" : "grid-cols-[11rem_1fr_2.5rem]", onStage && "hover:bg-muted/50", selected === c.stage && "bg-muted")}>
        <span className={cn("truncate text-foreground", compact ? "text-[11px]" : "text-xs")}>{c.stage}</span>
        <span className={cn("flex overflow-hidden rounded-sm bg-muted/60", compact ? "h-3" : "h-5")}>
          {DELL_MOTIONS.map((m) => c[m] > 0 && <span key={m} title={`${m}: ${c[m]}`} style={{ width: `${(c[m] / max) * 100}%`, background: MOTION_COLOR[m] }} />)}
        </span>
        <span className={cn("text-right tabular-nums text-foreground", compact ? "text-[11px]" : "text-sm font-medium")}>{c.total}</span>
      </button>
    ))}
  </div>;
}

export function MotionLegend({ small = false }: { small?: boolean }) {
  return <div className={cn("flex items-center gap-4 text-muted-foreground", small ? "text-[10px]" : "text-xs")}>
    {DELL_MOTIONS.map((m) => <span key={m} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: MOTION_COLOR[m] }} />{m}</span>)}
  </div>;
}

/** Ring colour for a company circle: one motion's colour, or split when it holds both. */
const motionRing = (motions: DellMotion[]) => motions.length > 1
  ? `linear-gradient(90deg, ${MOTION_COLOR["Sell-In"]} 50%, ${MOTION_COLOR["Sell-With"]} 50%)`
  : MOTION_COLOR[motions[0] ?? "Sell-In"];

/** Round company logo with its motion ring (split ring = both motions). */
function RingLogo({ company, website, motions, size = "md", count }: { company: string; website?: string; motions: DellMotion[]; size?: "sm" | "md" | "lg"; count?: number }) {
  return <span className="relative inline-flex shrink-0 rounded-full p-[2px]" style={{ background: motionRing(motions) }}>
    <span className="block rounded-full bg-card p-px"><PortcoLogo name={company} website={website} size={size} fill /></span>
    {!!count && count > 1 && <span className="absolute -right-1.5 -top-1 rounded-full bg-foreground px-1 text-[9px] font-semibold leading-4 text-background">{count}</span>}
  </span>;
}

const STAGE_SUB: Partial<Record<DellStage, string>> = { Existing: "Live with Dell" };

/** The page's main navigation: status tiles over the company logos at each status. */
function CompanyBoard({ rows, websites, stage, company, onStage, onCompany }: {
  rows: DellRow[]; websites: Record<string, string>; stage: DellStage | null; company: string | null;
  onStage: (s: DellStage) => void; onCompany: (c: string) => void;
}) {
  const board = companyStageBoard(rows);
  const summary = summarizeDell(rows);
  return <div className="grid min-w-0 flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${board.length}, minmax(9.5rem, 1fr))` }}>
    {board.map((col) => {
      const on = stage === col.stage;
      const sub = col.stage === "Engaged / Stalled" && summary.stalledShare != null ? `${Math.round(summary.stalledShare * 100)}% of engaged` : STAGE_SUB[col.stage];
      return <div key={col.stage} className={cn("flex min-w-0 flex-col rounded-lg border transition-opacity", on ? "border-primary bg-muted/40" : "border-border", stage && !on && "opacity-50")}>
        <button type="button" onClick={() => onStage(col.stage)} aria-pressed={on}
          className={cn("rounded-t-lg border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/60", on && "bg-muted")}>
          <span className="block text-[11px] uppercase leading-tight tracking-wide text-muted-foreground">{col.stage}</span>
          <span className="mt-0.5 flex items-baseline gap-2">
            <span className="font-display text-2xl font-semibold tabular-nums text-foreground">{col.companies.length}</span>
            <span className="text-[11px] text-muted-foreground">{col.companies.length === 1 ? "company" : "companies"} · {col.workstreams} ws</span>
          </span>
          {sub && <span className="block text-[11px] text-muted-foreground">{sub}</span>}
        </button>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] gap-x-1 gap-y-2 p-2">
          {col.companies.map((c) => (
            <button key={c.company} type="button" onClick={() => onCompany(c.company)}
              title={`${c.company} · ${c.motions.join(" + ")} · ${c.workstreams} workstream${c.workstreams === 1 ? "" : "s"}`}
              className={cn("flex min-w-0 flex-col items-center gap-1 rounded-md p-1 hover:bg-muted/60", company === c.company && "bg-muted ring-1 ring-primary", company && company !== c.company && "opacity-40")}>
              <RingLogo company={c.company} website={websites[c.company]} motions={c.motions} count={c.workstreams} />
              <span className="w-full truncate text-center text-[10px] leading-tight text-foreground">{c.company}</span>
            </button>
          ))}
          {!col.companies.length && <p className="col-span-full px-1 py-2 text-[11px] text-muted-foreground">None yet</p>}
        </div>
      </div>;
    })}
  </div>;
}

const MOVE_LABEL: Record<MovementKind, string> = { advanced: "Advanced", slipped: "Slipped", new: "New", closed: "Closed" };
const MOVE_TONE: Record<MovementKind, string> = {
  advanced: "bg-good text-good-foreground", slipped: "bg-hot text-hot-foreground", new: "bg-cold text-cold-foreground", closed: "bg-muted text-muted-foreground",
};

// ─── Engagement notes (V.I.C. drafts, saved only when approved) ─────

type Drafts = { get: (gid: string) => string | undefined; loading: (gid: string) => boolean; redraft: (gid: string) => void; error: string };

/** Drafts for every workstream in a pop-up that has no saved notes yet (one V.I.C. call per pop-up). */
function useNoteDrafts(workstreams: DellWorkstream[]): Drafts {
  const ids = useMemo(() => [...new Set(workstreams.filter((w) => !w.engagementNotes).map((w) => w.workstreamId))].sort().slice(0, 40), [workstreams]);
  const q = useQuery({
    queryKey: ["dell-note-drafts", ids.join(",")],
    queryFn: () => draftDellNotesFn({ data: { gids: ids } }),
    enabled: ids.length > 0, staleTime: Infinity, gcTime: 30 * 60_000, retry: false,
  });
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  return {
    get: (gid) => extra[gid] ?? q.data?.drafts[gid],
    loading: (gid) => busy.has(gid) || (q.isFetching && ids.includes(gid)),
    error: q.data?.error || (q.isError ? "V.I.C. couldn't draft notes right now." : ""),
    redraft: (gid) => {
      setBusy((b) => new Set(b).add(gid));
      void draftDellNotesFn({ data: { gids: [gid] } })
        .then((r) => { if (r.drafts[gid]) setExtra((e) => ({ ...e, [gid]: r.drafts[gid]! })); else toast.error(r.error || "V.I.C. had nothing to suggest for this workstream."); })
        .catch(() => toast.error("V.I.C. couldn't draft a note right now."))
        .finally(() => setBusy((b) => { const n = new Set(b); n.delete(gid); return n; }));
    },
  };
}

function NotesBox({ ws, drafts, onSaved }: { ws: DellWorkstream; drafts: Drafts; onSaved: () => void }) {
  const [saved, setSaved] = useState(ws.engagementNotes);
  const draft = drafts.get(ws.workstreamId);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setSaved(ws.engagementNotes), [ws.engagementNotes]);
  const showDraft = !saved && !editing && !!draft;
  // A fresh V.I.C. draft (or redraft) opens in the edit box so it can be changed before saving.
  useEffect(() => { if (draft && (editing || !saved)) setText(draft); }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (value: string) => {
    setSaving(true);
    try {
      const r = await updateWorkstreamFn({ data: { gid: ws.workstreamId, changes: [{ gid: DELL_NOTES_FIELD, type: "text", original: saved, value: value.trim() }] } });
      if (!r.ok) { toast.error(r.error); return; }
      setSaved(value.trim()); setEditing(false); toast.success(value.trim() ? "Engagement notes saved" : "Engagement notes cleared"); onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save the notes."); } finally { setSaving(false); }
  };

  if (editing || showDraft) return <div className="mt-2 space-y-1.5">
    {showDraft && <p className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground"><Sparkles className="h-3 w-3" />V.I.C. draft — not saved yet</p>}
    <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="text-xs" aria-label={`Engagement notes for ${ws.name}`} />
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" className="h-7 text-xs" disabled={saving || (!text.trim() && !saved)} onClick={() => void save(text)}>{saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Save</Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={saving || drafts.loading(ws.workstreamId)} onClick={() => drafts.redraft(ws.workstreamId)}>
        {drafts.loading(ws.workstreamId) ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}Redraft</Button>
      {editing && <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>}
    </div>
  </div>;

  return <div className="mt-2">
    {saved ? <p className="whitespace-pre-line text-xs text-foreground">{saved}</p>
      : drafts.loading(ws.workstreamId) ? <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />V.I.C. is drafting notes…</p>
      : <p className="text-[11px] text-muted-foreground">No engagement notes yet.</p>}
    <button type="button" onClick={() => { setText(saved); setEditing(true); }} className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
      <Pencil className="h-3 w-3" />{saved ? "Edit notes" : "Write notes"}</button>
  </div>;
}

function MotionStatus({ ws }: { ws: DellWorkstream }) {
  return <span className="flex flex-wrap gap-x-3 gap-y-0.5">
    {ws.motions.map((m) => <span key={m.motion} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: MOTION_COLOR[m.motion] }} />{m.motion}: <span className="text-foreground">{m.statuses.join(", ") || "Not set"}</span>
    </span>)}
  </span>;
}

function People({ people, empty = "No Dell stakeholders named yet." }: { people: StakeholderPerson[]; empty?: string }) {
  if (!people.length) return <p className="text-[11px] text-hot-foreground">{empty}</p>;
  return <span className="flex flex-wrap gap-1">{people.map((p) => (
    <span key={`${p.linked}:${p.name}`} title={p.title || undefined} className={cn("rounded-full border px-2 py-0.5 text-[11px]", p.linked ? "border-border bg-muted text-foreground" : "border-dashed border-muted-foreground/50 text-muted-foreground")}>
      {p.name}{p.title && <span className="text-muted-foreground"> · {p.title}</span>}
    </span>
  ))}</span>;
}

function PanelShell({ title, sub, logo, onClose, children }: { title: string; sub?: string; logo?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return <Card className="border-primary/40 shadow-md"><CardContent className="p-5">
    <div className="flex items-start gap-3">
      {logo}
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
    </div>
    <div className="mt-4">{children}</div>
  </CardContent></Card>;
}

/** Status pop-up: every company at the status, where it is, its Dell people and engagement notes. */
function StagePanel({ rows, stage, websites, onCompany, onClose, onSaved }: { rows: DellRow[]; stage: DellStage; websites: Record<string, string>; onCompany: (c: string) => void; onClose: () => void; onSaved: () => void }) {
  const list = useMemo(() => companiesAtStage(rows, stage), [rows, stage]);
  const drafts = useNoteDrafts(useMemo(() => list.flatMap((c) => c.workstreams), [list]));
  return <PanelShell title={stage} sub={`${list.length} ${list.length === 1 ? "company" : "companies"} · notes are Dell-facing, drafted by V.I.C. and saved only when you click Save`} onClose={onClose}>
    {drafts.error && <p className="mb-3 text-xs text-muted-foreground">{drafts.error}</p>}
    {list.length ? <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {list.map((c) => <div key={c.company} className="rounded-lg border border-border p-3">
        <button type="button" onClick={() => onCompany(c.company)} className="flex w-full items-center gap-2.5 text-left hover:underline">
          <RingLogo company={c.company} website={websites[c.company]} motions={DELL_MOTIONS.filter((m) => c.workstreams.some((w) => w.motions.some((x) => x.motion === m)))} size="sm" />
          <span className="text-sm font-semibold text-foreground">{c.company}</span>
        </button>
        <div className="mt-2"><People people={c.people} /></div>
        <ul className="mt-2 divide-y divide-border">
          {c.workstreams.map((w) => <li key={w.workstreamId} className="py-2">
            <p className="text-xs font-medium text-foreground">{w.name}<span className="font-normal text-muted-foreground"> · {w.bu}</span></p>
            <MotionStatus ws={w} />
            <NotesBox ws={w} drafts={drafts} onSaved={onSaved} />
          </li>)}
        </ul>
      </div>)}
    </div> : <p className="text-xs text-muted-foreground">No companies at this status with the current filters.</p>}
  </PanelShell>;
}

/** Company pop-up: Dell relationships by BU, movement since last QBR, stakeholders and workstreams. */
function CompanyPanel({ rows, company, website, domain, moves, since, onOpen, onClose, onSaved }: {
  rows: DellRow[]; company: string; website?: string; domain: string; moves: Movement[]; since: string;
  onOpen: (gid: string) => void; onClose: () => void; onSaved: () => void;
}) {
  const mine = useMemo(() => rows.filter((r) => r.company === company), [rows, company]);
  const relationships = useMemo(() => companyRelationships(mine, company), [mine, company]);
  const workstreams = useMemo(() => workstreamsOf(mine), [mine]);
  const people = useMemo(() => peopleOf(mine), [mine]);
  const drafts = useNoteDrafts(workstreams);
  const motions = DELL_MOTIONS.filter((m) => mine.some((r) => r.motion === m));
  const myMoves = moves.filter((m) => m.company === company);
  return <PanelShell title={company} onClose={onClose}
    sub={`${domain} · ${workstreams.length} Dell workstream${workstreams.length === 1 ? "" : "s"} · ${motions.join(" + ") || "No Dell motion"}`}
    logo={<RingLogo company={company} website={website} motions={motions} size="lg" />}>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dell relationships</h3>
        <ul className="mt-2 space-y-2">
          {relationships.map((r) => <li key={r.bu} className="rounded-md border border-border p-2">
            <p className="text-xs font-semibold text-foreground">{r.bu}</p>
            {r.workstreams.map((w) => <div key={w.workstreamId} className="mt-1">
              <p className="truncate text-[11px] text-foreground">{w.name}</p>
              <MotionStatus ws={w} />
            </div>)}
          </li>)}
        </ul>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Movement since {since}</h3>
        {myMoves.length ? <ul className="mt-2 space-y-1.5">
          {myMoves.map((m) => <li key={`${m.workstreamId}:${m.motion}`} className="text-xs">
            <span className={cn("mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold", MOVE_TONE[m.kind])}>{MOVE_LABEL[m.kind]}</span>
            <span className="text-foreground">{m.name}</span>
            <span className="block text-[11px] text-muted-foreground">{m.motion} · {m.kind === "new" ? m.to : `${m.from} → ${m.kind === "closed" && m.to === "Not set" ? "Cleared" : m.to}`} · {m.at}</span>
          </li>)}
        </ul> : <p className="mt-2 text-xs text-muted-foreground">No Dell status changes in this window.</p>}
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dell stakeholders</h3>
        {people.length ? <ul className="mt-2 space-y-1.5">
          {people.map((p) => <li key={`${p.linked}:${p.name}`} className="text-xs">
            <span className={cn("rounded-full border px-2 py-0.5", p.linked ? "border-border bg-muted text-foreground" : "border-dashed border-muted-foreground/50 text-muted-foreground")}>{p.name}</span>
            <span className="ml-1.5 text-[11px] text-muted-foreground">{p.title ? `${p.title} · ` : ""}{p.workstreams.map((w) => w.name).join(", ")}</span>
          </li>)}
        </ul> : <p className="mt-2 text-xs text-hot-foreground">No Dell stakeholders named yet.</p>}
      </div>
    </div>
    <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workstreams</h3>
    {drafts.error && <p className="mt-1 text-xs text-muted-foreground">{drafts.error}</p>}
    <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
      {workstreams.map((w) => <div key={w.workstreamId} className="rounded-lg border border-border p-3">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{w.name}{w.completed && <span className="ml-1.5 text-[10px] text-muted-foreground">(completed)</span>}</p>
          <button type="button" onClick={() => onOpen(w.workstreamId)} className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><ExternalLink className="h-3 w-3" />Open</button>
        </div>
        <p className="text-[11px] text-muted-foreground">{w.bu}{w.products.length ? ` · ${w.products.map((p) => p.replace(/^Dell /, "")).join(", ")}` : ""}</p>
        <MotionStatus ws={w} />
        <div className="mt-1.5"><People people={peopleOf(mine.filter((r) => r.workstreamId === w.workstreamId))} /></div>
        <NotesBox ws={w} drafts={drafts} onSaved={onSaved} />
      </div>)}
    </div>
  </PanelShell>;
}

export function DellLeverageDashboard() {
  const q = useDellLeverage();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<DellFilter>(DEFAULT_DELL_FILTER);
  const [since, setSince] = useState(() => isoDaysAgo(90));
  const [moveKind, setMoveKind] = useState<MovementKind | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<DellFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const toggle = <K extends keyof DellFilter>(k: K, v: DellFilter[K]) => setFilter((f) => ({ ...f, [k]: f[k] === v ? DEFAULT_DELL_FILTER[k] : v }));
  // Status and company are the two ways into a pop-up; picking one replaces the other.
  const pickStage = (st: DellStage) => setFilter((f) => ({ ...f, company: null, stage: f.stage === st && !f.company ? null : st }));
  const pickCompany = (c: string) => setFilter((f) => ({ ...f, stage: null, company: f.company === c ? null : c }));
  const refresh = () => void qc.invalidateQueries({ queryKey: ["dell-leverage"] });

  const all = useMemo(() => q.data?.rows ?? [], [q.data]);
  const rows = useMemo(() => filterDellRows(all, filter), [all, filter]);
  const boardRows = useMemo(() => filterDellRows(all, filter, ["stage", "company"]), [all, filter]);
  const motionRows = useMemo(() => filterDellRows(all, filter, ["motion"]), [all, filter]);
  const heatRows = useMemo(() => filterDellRows(all, filter, ["bu", "stage"]), [all, filter]);
  const summary = useMemo(() => summarizeDell(rows), [rows]);
  const heat = useMemo(() => buHeatmap(heatRows), [heatRows]);
  const outcomes = useMemo(() => existingOutcomes(rows), [rows]);
  const products = useMemo(() => productCounts(rows), [rows]);
  const people = useMemo(() => stakeholderMap(rows), [rows]);
  const moves = useMemo(() => movementInWindow(q.data?.changes ?? [], all, since, todayIso()), [q.data, all, since]);
  const visibleIds = useMemo(() => new Set(rows.map((r) => `${r.workstreamId}:${r.motion}`)), [rows]);
  const shownMoves = moves.filter((m) => visibleIds.has(`${m.workstreamId}:${m.motion}`));
  const boardIds = useMemo(() => new Set(boardRows.map((r) => `${r.workstreamId}:${r.motion}`)), [boardRows]);
  const tableRows = moveKind ? rows.filter((r) => shownMoves.some((m) => m.kind === moveKind && m.workstreamId === r.workstreamId && m.motion === r.motion)) : rows;
  const buOptions = useMemo(() => [...new Set(all.map((r) => r.bu))].sort((a, b) => (a === NO_BU ? 1 : b === NO_BU ? -1 : a.localeCompare(b))), [all]);
  const domainOptions = useMemo(() => [...new Set(all.map((r) => r.domain))].sort(), [all]);
  const filtered = JSON.stringify(filter) !== JSON.stringify(DEFAULT_DELL_FILTER) || !!moveKind;
  const panelKey = filter.company ? `c:${filter.company}` : filter.stage ? `s:${filter.stage}` : "";

  useEffect(() => { if (panelKey) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [panelKey]);

  if (!q.data && !q.isError) return <p className="flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading Dell workstreams…</p>;
  if (!q.data || q.data.error) return <Card className="border-border"><CardContent className="p-8 text-center text-sm text-muted-foreground">Dell workstream data is unavailable right now. Try again in a minute.</CardContent></Card>;
  if (!all.length) return <Card className="border-border"><CardContent className="p-8 text-center text-sm text-muted-foreground">No workstreams have a Sell-In or Sell With Dell Status yet.</CardContent></Card>;

  const maxHeat = Math.max(1, ...heat.flatMap((h) => ALL_STAGES.map((s) => h.cells[s])));
  const maxProduct = Math.max(1, ...products.map((p) => p.count));
  const maxOutcome = Math.max(1, ...outcomes.sellWith.map((o) => o.count), ...outcomes.sellIn.map((o) => o.count));
  const moveCounts = (k: MovementKind) => shownMoves.filter((m) => m.kind === k).length;
  const websites = q.data.websites ?? {};
  const boardSummary = summarizeDell(boardRows);

  return <div className="space-y-5">
    {/* Top row: motion tiles | company status board (main navigation) | filters */}
    <Card className="border-border"><CardContent className="p-4">
      <div className="flex flex-col gap-4 2xl:flex-row">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 2xl:w-48 2xl:shrink-0 2xl:grid-cols-1 2xl:content-start">
          {DELL_MOTIONS.map((m) => {
            const mine = motionRows.filter((r) => r.motion === m);
            const engaged = mine.filter((r) => r.stage === "Engaged / Progressing" || r.stage === "Engaged / Stalled").length;
            const live = mine.filter((r) => r.stage === "Existing").length;
            return <Stat key={m} label={m} dot={MOTION_COLOR[m]} value={String(new Set(mine.map((r) => r.workstreamId)).size)} sub={`${engaged} engaged · ${live} live`}
              onClick={() => set({ motion: filter.motion === m ? "Both" : m })} active={filter.motion === m} dim={filter.motion !== "Both" && filter.motion !== m} />;
          })}
          <MiniStat label="Active workstreams" value={String(boardSummary.active)} sub={boardSummary.workstreams !== boardSummary.active ? `+ ${boardSummary.workstreams - boardSummary.active} completed` : undefined} />
          <MiniStat label="Companies" value={String(boardSummary.companies)} sub={`${boardSummary.stakeholderReach} Dell people engaged`} />
          <MiniStat label="Stakeholder coverage" value={pct(boardSummary.coverage.covered, boardSummary.coverage.total)}
            sub={`Sell-In ${pct(boardSummary.coverageByMotion["Sell-In"].covered, boardSummary.coverageByMotion["Sell-In"].total)} · Sell-With ${pct(boardSummary.coverageByMotion["Sell-With"].covered, boardSummary.coverageByMotion["Sell-With"].total)}`} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-foreground">Companies by Dell status</h2>
            <span className="text-xs text-muted-foreground">Click a status for its summary, or a company for its relationships.</span>
          </div>
          <div className="overflow-x-auto pb-1">
            <CompanyBoard rows={boardRows} websites={websites} stage={filter.company ? null : filter.stage} company={filter.company} onStage={pickStage} onCompany={pickCompany} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <MotionLegend />
            <span className="text-xs text-muted-foreground">Split ring = both · number = workstreams at that status</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 2xl:w-52 2xl:shrink-0 2xl:flex-col 2xl:items-stretch">
          <Select value={filter.bu ?? ALL} onValueChange={(v) => set({ bu: v === ALL ? null : v })}>
            <SelectTrigger className="h-8 w-44 text-xs 2xl:w-full"><SelectValue placeholder="Dell BU" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Dell BUs</SelectItem>{buOptions.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filter.domain ?? ALL} onValueChange={(v) => set({ domain: v === ALL ? null : v })}>
            <SelectTrigger className="h-8 w-36 text-xs 2xl:w-full"><SelectValue placeholder="Domain" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All domains</SelectItem>{domainOptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filter.stage ?? ALL} onValueChange={(v) => v === ALL ? set({ stage: null }) : pickStage(v as DellStage)}>
            <SelectTrigger className="h-8 w-48 text-xs 2xl:w-full"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All statuses</SelectItem>{ALL_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          {filter.company && <button type="button" onClick={() => set({ company: null })} className="inline-flex h-8 items-center justify-between gap-1.5 rounded-full border border-primary bg-primary px-3 text-xs text-primary-foreground"><span className="truncate">{filter.company}</span><X className="h-3 w-3 shrink-0" /></button>}
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={filter.includeCompleted} onCheckedChange={(v) => set({ includeCompleted: v })} />Include completed</label>
          {filtered && <Button variant="ghost" size="sm" className="h-8 justify-start text-xs" onClick={() => { setFilter(DEFAULT_DELL_FILTER); setMoveKind(null); }}><X className="h-3.5 w-3.5 mr-1" />Clear filters</Button>}
        </div>
      </div>
      {!q.data.stakeholdersLinked && <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" />Network people couldn't be read, so stakeholder names aren't linked and coverage reads low.</p>}
    </CardContent></Card>

    {/* Pop-up for the selected status or company */}
    <div ref={panelRef} className="scroll-mt-4">
      {filter.company ? <CompanyPanel key={panelKey} rows={boardRows} company={filter.company} website={websites[filter.company]} domain={boardRows.find((r) => r.company === filter.company)?.domain || "Other"}
          moves={moves.filter((m) => boardIds.has(`${m.workstreamId}:${m.motion}`))} since={since} onOpen={setOpenId} onClose={() => set({ company: null })} onSaved={refresh} />
        : filter.stage ? <StagePanel key={panelKey} rows={boardRows} stage={filter.stage} websites={websites} onCompany={pickCompany} onClose={() => set({ stage: null })} onSaved={refresh} />
        : null}
    </div>

    {/* BU heatmap */}
    <Section title="Dell business units" sub="Workstreams per Dell BU and stage. Click a BU or a cell to filter.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-xs">
          <thead><tr className="text-muted-foreground">
            <th className="py-1.5 pr-3 text-left font-medium">Dell BU</th>
            {ALL_STAGES.map((s) => <th key={s} className="px-1 py-1.5 text-center font-medium">{s}</th>)}
            <th className="px-2 py-1.5 text-right font-medium">Total</th>
            <th className="pl-2 py-1.5 text-right font-medium">Companies</th>
          </tr></thead>
          <tbody>
            {heat.map((h) => <tr key={h.bu} className={cn("border-t border-border", filter.bu === h.bu && "bg-muted/50")}>
              <td className="py-1 pr-3"><button type="button" onClick={() => toggle("bu", h.bu)} className="font-medium text-foreground hover:underline">{h.bu}</button></td>
              {ALL_STAGES.map((s) => {
                const n = h.cells[s];
                const on = filter.bu === h.bu && filter.stage === s;
                return <td key={s} className="p-0.5">
                  <button type="button" disabled={!n} onClick={() => on ? set({ bu: null, stage: null }) : set({ bu: h.bu, stage: s })}
                    className={cn("h-8 w-full rounded tabular-nums", n ? "text-foreground hover:ring-1 hover:ring-primary" : "text-muted-foreground/40", on && "ring-2 ring-primary")}
                    style={n ? { background: `color-mix(in oklab, var(--chart-1) ${12 + (n / maxHeat) * 55}%, transparent)` } : undefined}>{n || "·"}</button>
                </td>;
              })}
              <td className="px-2 text-right tabular-nums font-medium text-foreground">{h.total}</td>
              <td className="pl-2 text-right tabular-nums text-muted-foreground">{h.companies}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Section>

    {/* Outcomes + products */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {([["Live with Dell — Sell-With", outcomes.sellWith, "Sell-With"], ["Sell-In account health", outcomes.sellIn, "Sell-In"]] as const).map(([title, list, motion]) => (
        <Section key={title} title={title} sub={motion === "Sell-With" ? "How companies already go to market with Dell." : "Where Dell is already a customer."}>
          <div className="space-y-2">
            {list.map((o) => <div key={o.outcome} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
              <span className="text-xs text-foreground">{shortStatus(o.outcome)}</span>
              <span className="text-xs tabular-nums font-medium text-foreground">{o.count}</span>
              <span className="col-span-2 h-1.5 rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${(o.count / maxOutcome) * 100}%`, background: MOTION_COLOR[motion] }} /></span>
            </div>)}
          </div>
        </Section>
      ))}
      <Section title="Dell products aligned" sub="Workstreams naming each Dell product.">
        {products.length ? <div className="space-y-2">
          {products.map((p) => <div key={p.product} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
            <span className="truncate text-xs text-foreground">{p.product.replace(/^Dell /, "")}</span>
            <span className="text-xs tabular-nums font-medium text-foreground">{p.count}</span>
            <span className="col-span-2 h-1.5 rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(p.count / maxProduct) * 100}%` }} /></span>
          </div>)}
        </div> : <p className="text-xs text-muted-foreground">No products aligned on these workstreams yet.</p>}
      </Section>
    </div>

    {/* Movement */}
    <Section title="Movement since last QBR" sub="Status changes recorded in the PortCo Change Log. Click a count to list those workstreams below.">
      {q.data.movementAvailable ? <>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Since
            <Input type="date" value={since} max={todayIso()} onChange={(e) => e.target.value && setSince(e.target.value)} className="h-8 w-40 text-xs" />
          </label>
          {(["advanced", "slipped", "new", "closed"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setMoveKind(moveKind === k ? null : k)}
              className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium", MOVE_TONE[k], moveKind === k && "ring-2 ring-primary")}>
              {MOVE_LABEL[k]} <span className="tabular-nums">{moveCounts(k)}</span>
            </button>
          ))}
        </div>
        {shownMoves.length ? <ul className="mt-3 divide-y divide-border">
          {shownMoves.filter((m) => !moveKind || m.kind === moveKind).slice(0, 12).map((m: Movement) => (
            <li key={`${m.workstreamId}:${m.motion}`}>
              <button type="button" onClick={() => setOpenId(m.workstreamId)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-left text-xs hover:bg-muted/40">
                <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", MOVE_TONE[m.kind])}>{MOVE_LABEL[m.kind]}</span>
                <span className="font-medium text-foreground">{m.company}</span>
                <span className="text-muted-foreground">{m.name}</span>
                <span className="text-muted-foreground">· {m.motion}</span>
                <span className="ml-auto text-muted-foreground">{m.kind === "new" ? m.to : `${m.from} → ${m.kind === "closed" && m.to === "Not set" ? "Cleared" : m.to}`} · {m.at}</span>
              </button>
            </li>
          ))}
        </ul> : <p className="mt-3 text-xs text-muted-foreground">No Dell status changes since {since}.</p>}
      </> : <p className="text-xs text-muted-foreground">The PortCo Change Log is unavailable right now, so movement can't be shown.</p>}
    </Section>

    {/* Stakeholder map */}
    <Section title="Dell stakeholders" sub="Dell people named on each BU's workstreams. Dashed names aren't linked to a Network person yet.">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {people.map((b) => <div key={b.bu} className="rounded-lg border border-border p-3">
          <div className="flex items-baseline justify-between gap-2">
            <button type="button" onClick={() => toggle("bu", b.bu)} className="text-sm font-semibold text-foreground hover:underline">{b.bu}</button>
            <span className="text-[11px] text-muted-foreground">{b.workstreams} workstream{b.workstreams === 1 ? "" : "s"}</span>
          </div>
          {b.people.length ? <ul className="mt-2 space-y-1">
            {b.people.map((p) => <li key={`${p.linked}:${p.name}`} className="flex items-baseline gap-2 text-xs">
              <span className={cn("shrink-0 rounded-full border px-2 py-0.5", p.linked ? "border-border bg-muted text-foreground" : "border-dashed border-muted-foreground/50 text-muted-foreground")}>{p.name}</span>
              <span className="min-w-0 truncate text-muted-foreground" title={p.workstreams.map((w) => `${w.company} — ${w.name}`).join("\n")}>
                {p.title ? `${p.title} · ` : ""}{[...new Set(p.workstreams.map((w) => w.company))].join(", ")}
              </span>
            </li>)}
          </ul> : <p className="mt-2 text-xs text-muted-foreground">No stakeholders named yet.</p>}
          {b.gaps > 0 && <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-hot-foreground">
            <UserRoundX className="h-3 w-3" />{b.gaps} without a linked stakeholder
          </p>}
        </div>)}
      </div>
    </Section>

    {/* Table */}
    <Section title={`Workstreams · ${tableRows.length}`} sub="Click a row to open it in the workstream editor.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead><tr className="text-left text-muted-foreground">
            {["Company", "Workstream", "Motion", "Dell BU", "Status", "Dell stakeholders", "Products aligned", "Last updated"].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {tableRows.map((r) => <tr key={r.id} onClick={() => setOpenId(r.workstreamId)} className="cursor-pointer border-t border-border align-top hover:bg-muted/40">
              <td className="py-2 pr-3 font-medium text-foreground">{r.company}</td>
              <td className="py-2 pr-3 text-foreground">{r.name}{r.completed && <span className="ml-1.5 text-[10px] text-muted-foreground">(completed)</span>}</td>
              <td className="py-2 pr-3 whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: MOTION_COLOR[r.motion] }} />{r.motion}</span></td>
              <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{r.bu}</td>
              <td className="py-2 pr-3 text-foreground">{r.statuses.length ? r.statuses.join(", ") : <span className="text-muted-foreground">Not set</span>}</td>
              <td className="py-2 pr-3">
                {r.stakeholders.length ? <span className="flex flex-wrap gap-1">{r.stakeholders.map((s) => (
                  <span key={s.name} className={cn("rounded-full border px-1.5 py-0.5 text-[11px]", s.status === "linked" ? "border-border bg-muted text-foreground" : "border-dashed border-muted-foreground/50 text-muted-foreground")}>{s.name}</span>
                ))}</span> : <span className="text-hot-foreground">None</span>}
                {r.stakeholders.length > 0 && !hasLinkedStakeholder(r) && <span className="mt-0.5 block text-[10px] text-hot-foreground">Not linked</span>}
              </td>
              <td className="py-2 pr-3 text-muted-foreground">{r.products.map((p) => p.replace(/^Dell /, "")).join(", ") || "—"}</td>
              <td className="py-2 pr-3 tabular-nums text-muted-foreground">{r.updatedAt || "—"}</td>
            </tr>)}
          </tbody>
        </table>
        {!tableRows.length && <p className="py-6 text-center text-xs text-muted-foreground">No workstreams match these filters.</p>}
      </div>
    </Section>

    <WorkstreamEditorSheet gid={openId} onClose={() => setOpenId(null)} onSaved={refresh} />
  </div>;
}

/** The existing workstream editor in a side panel (loads the full workstream only when opened). */
function WorkstreamEditorSheet({ gid, onClose, onSaved }: { gid: string | null; onClose: () => void; onSaved: () => void }) {
  return <Sheet open={!!gid} onOpenChange={(o) => !o && onClose()}>
    <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
      {gid && <EditorBody gid={gid} onSaved={onSaved} />}
    </SheetContent>
  </Sheet>;
}

function EditorBody({ gid, onSaved }: { gid: string; onSaved: () => void }) {
  const { workstreams, loading } = useWorkstreams();
  const w = workstreams.find((x) => x.gid === gid);
  return <>
    <SheetHeader>
      <SheetTitle className="font-display">{w ? w.name || w.rawName : "Workstream"}</SheetTitle>
      <SheetDescription>{w ? `${w.company} · ${w.segment}` : ""}</SheetDescription>
    </SheetHeader>
    <p className="mt-3 flex items-start gap-1.5 rounded-md border border-warm-foreground/30 bg-warm px-2.5 py-2 text-[11px] text-warm-foreground">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />The editor shows internal fields such as priorities. Close it before sharing your screen.
    </p>
    <div className="mt-4">
      {w ? <WorkstreamDetail key={w.gid} w={w} onSaved={onSaved} />
        : loading ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…</p>
        : <p className="text-xs text-muted-foreground">This workstream couldn't be loaded. Refresh and try again.</p>}
    </div>
  </>;
}

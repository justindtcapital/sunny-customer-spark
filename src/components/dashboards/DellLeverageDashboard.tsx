// Dell Leverage Dashboard: a QBR view of the Sell-In and Sell-With workstreams, written from Dell's
// side. Rows come from fetchDellLeverageFn, which only returns Dell-facing fields (no DTC
// priorities, ROI ratings, owners or internal notes), so the page is safe to share on screen.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, Loader2, Pencil, RefreshCw, Sparkles, UserRoundX, X } from "lucide-react";
import { PortcoLogo } from "@/components/portfolio/PortcoLogo";
import { draftDellNotesFn, fetchDellLeverageFn, type DellLeverageData } from "@/utils/dell-leverage.functions";
import { updateWorkstreamFn } from "@/utils/asana.functions";
import { useAuth } from "@/lib/auth-context";
import {
  ALL_STAGES, DEFAULT_DELL_FILTER, DELL_MOTIONS, DELL_ASKS_FIELD, DELL_NOTES_FIELD, NO_BU, PIPELINE_STAGES, companyStageBoard, engagementList, formatAsks, parseAsks,
  existingOutcomes, filterDellRows, movementInWindow, peopleOf, productCounts, stageCounts, stakeholderMap, summarizeDell, trackIndex,
  type DellFilter, type DellMotion, type DellRow, type DellStage, type DellWorkstream, type Movement, type MovementKind, type StakeholderPerson,
} from "@/lib/dell-leverage";
import { useWorkstreams } from "@/lib/use-workstreams";
import { WorkstreamDetail } from "@/components/portfolio/WorkstreamsPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const MOTION_COLOR: Record<DellMotion, string> = { "Sell-In": "var(--chart-1)", "Sell-With": "var(--chart-3)" };
const ALL = "__all";
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);
const shortStatus = (s: string) => s.replace(/^Existing - /, "");
const TRACK_LABELS = ["Interested", "Working", "Stalled", "Progressing", "Existing"];

export function useDellLeverage() {
  const { email, ready } = useAuth();
  return useQuery<DellLeverageData>({ queryKey: ["dell-leverage"], queryFn: () => fetchDellLeverageFn(), enabled: ready && !!email, staleTime: 5 * 60_000 });
}

function Section({ title, sub, children, className = "", right }: { title: string; sub?: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return <Card className={cn("border-border", className)}><CardContent className="p-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
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

/** The page's main navigation: one full-width column per status, each a same-height tile over its company logos. */
function CompanyBoard({ rows, websites, stage, company, onStage, onCompany }: {
  rows: DellRow[]; websites: Record<string, string>; stage: DellStage | null; company: string | null;
  onStage: (s: DellStage) => void; onCompany: (c: string) => void;
}) {
  const board = companyStageBoard(rows);
  const summary = summarizeDell(rows);
  return <div className="grid min-w-[56rem] gap-3" style={{ gridTemplateColumns: `repeat(${board.length}, minmax(0, 1fr))` }}>
    {board.map((col) => {
      const on = stage === col.stage;
      const sub = col.stage === "Engaged / Stalled" && summary.stalledShare != null ? `${Math.round(summary.stalledShare * 100)}% of engaged` : STAGE_SUB[col.stage];
      return <div key={col.stage} className={cn("flex min-w-0 flex-col rounded-lg border transition-opacity", on ? "border-primary bg-muted/40" : "border-border", stage && !on && "opacity-50")}>
        <button type="button" onClick={() => onStage(col.stage)} aria-pressed={on} title={col.stage}
          className={cn("flex h-[5.25rem] flex-col justify-between rounded-t-lg border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/60", on && "bg-muted")}>
          <span className="block truncate text-[11px] uppercase leading-tight tracking-wide text-muted-foreground">{col.stage}</span>
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="font-display text-2xl font-semibold leading-none tabular-nums text-foreground">{col.companies.length}</span>
            <span className="truncate text-[11px] text-muted-foreground">{col.companies.length === 1 ? "company" : "companies"} · {col.workstreams} ws</span>
          </span>
          <span className="block truncate text-[11px] leading-tight text-muted-foreground">{sub ?? "\u00a0"}</span>
        </button>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] content-start gap-x-1 gap-y-2 p-2">
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

type Drafts = {
  get: (gid: string) => string | undefined; asks: (gid: string) => string[] | undefined;
  loading: (gid: string) => boolean; redraft: (gid: string) => void; error: string;
};

/**
 * V.I.C. drafts (notes + suggested asks) for listed workstreams missing either, ten per request.
 * Each workstream is drafted once per visit, however the list is filtered; drafts are never saved here.
 */
function useNoteDrafts(workstreams: DellWorkstream[], enabled: boolean): Drafts {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [asks, setAsks] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const tried = useRef(new Set<string>());
  const run = useCallback((ids: string[]) => {
    setBusy((b) => { const n = new Set(b); ids.forEach((i) => n.add(i)); return n; });
    return draftDellNotesFn({ data: { gids: ids } })
      .then((r) => { setDrafts((d) => ({ ...d, ...r.drafts })); setAsks((d) => ({ ...d, ...r.asks })); if (r.error) setError(r.error); return r; })
      .catch(() => { setError("V.I.C. couldn't draft notes right now."); return null; })
      .finally(() => setBusy((b) => { const n = new Set(b); ids.forEach((i) => n.delete(i)); return n; }));
  }, []);
  const wanted = useMemo(() => [...new Set(workstreams.filter((w) => !w.engagementNotes || !w.asks.length).map((w) => w.workstreamId))].sort().join("\n"), [workstreams]);
  useEffect(() => {
    if (!enabled || !wanted) return;
    const ids = wanted.split("\n").filter((id) => !tried.current.has(id));
    if (!ids.length) return;
    ids.forEach((id) => tried.current.add(id));
    for (let i = 0; i < ids.length; i += 10) void run(ids.slice(i, i + 10));
  }, [wanted, enabled, run]);
  return {
    get: (gid) => drafts[gid],
    asks: (gid) => asks[gid],
    loading: (gid) => busy.has(gid),
    error,
    redraft: (gid) => { void run([gid]).then((r) => { if (r && !r.drafts[gid] && !r.asks[gid]) toast.error(r.error || "V.I.C. had nothing to suggest for this workstream."); }); },
  };
}

type BoxKind = "notes" | "asks";
const BOX: Record<BoxKind, { field: string; noun: string; empty: string; drafting: string; saved: string; cleared: string; placeholder: string; draftLabel: string }> = {
  notes: { field: DELL_NOTES_FIELD, noun: "Engagement notes", empty: "No engagement notes yet.", drafting: "V.I.C. is drafting notes…", saved: "Engagement notes saved", cleared: "Engagement notes cleared", placeholder: "Where it stands, then Next steps: …", draftLabel: "V.I.C. draft — not saved" },
  asks: { field: DELL_ASKS_FIELD, noun: "Asks", empty: "No asks yet.", drafting: "V.I.C. is suggesting asks…", saved: "Asks saved", cleared: "Asks cleared", placeholder: "One ask per line, e.g. Introduction to the ISG storage lead", draftLabel: "V.I.C. suggestions — not saved" },
};

/** Bullet list of asks. */
function AskList({ items, muted }: { items: string[]; muted?: boolean }) {
  return <ul className={cn("list-disc space-y-0.5 pl-4 text-xs", muted ? "text-muted-foreground" : "text-foreground")}>{items.map((a) => <li key={a}>{a}</li>)}</ul>;
}

/** One Dell-facing text field on a workstream (notes or asks): shows the saved value, else V.I.C.'s draft; saves only on click. */
function DellTextBox({ ws, kind, drafts, onSaved }: { ws: DellWorkstream; kind: BoxKind; drafts: Drafts; onSaved: () => void }) {
  const cfg = BOX[kind];
  const stored = kind === "notes" ? ws.engagementNotes : formatAsks(ws.asks);
  const [saved, setSaved] = useState(stored);
  const suggested = kind === "notes" ? drafts.get(ws.workstreamId) : drafts.asks(ws.workstreamId);
  const draft = Array.isArray(suggested) ? formatAsks(suggested) : suggested;
  const loading = drafts.loading(ws.workstreamId);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setSaved(stored), [stored]);
  // A redraft while editing replaces the text in the edit box.
  useEffect(() => { if (draft && editing) setText(draft); }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const toEdit = (v: string) => kind === "asks" ? parseAsks(v).join("\n") : v;
  const fromEdit = (v: string) => kind === "asks" ? formatAsks(v.split("\n")) : v.trim();
  const show = (v: string, muted?: boolean) => kind === "asks" ? <AskList items={parseAsks(v)} muted={muted} />
    : <p className={cn("whitespace-pre-line text-xs", muted ? "text-muted-foreground" : "text-foreground")}>{v}</p>;

  const save = async (raw: string) => {
    const value = fromEdit(raw);
    setSaving(true);
    try {
      const r = await updateWorkstreamFn({ data: { gid: ws.workstreamId, changes: [{ gid: cfg.field, type: "text", original: saved, value }] } });
      if (!r.ok) { toast.error(r.error); return; }
      setSaved(value); setEditing(false); toast.success(value ? cfg.saved : cfg.cleared); onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save."); } finally { setSaving(false); }
  };
  const redraftBtn = <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={saving || loading} onClick={() => drafts.redraft(ws.workstreamId)}>
    {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}{draft || saved ? (kind === "asks" ? "Suggest again" : "Redraft") : (kind === "asks" ? "Suggest with V.I.C." : "Draft with V.I.C.")}</Button>;

  if (editing) return <div className="space-y-1.5">
    <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="text-xs" placeholder={cfg.placeholder} aria-label={`${cfg.noun} for ${ws.name}`} />
    <div className="flex flex-wrap items-center gap-1">
      <Button size="sm" className="h-6 px-2 text-[11px]" disabled={saving || (!text.trim() && !saved)} onClick={() => void save(text)}>{saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Save</Button>
      {redraftBtn}
      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
    </div>
  </div>;

  if (saved) return <div>
    {show(saved)}
    <button type="button" onClick={() => { setText(toEdit(saved)); setEditing(true); }} className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" />Edit</button>
  </div>;

  if (draft) return <div>
    {show(draft, true)}
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <span className="mr-1 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground"><Sparkles className="h-3 w-3" />{cfg.draftLabel}</span>
      <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={saving} onClick={() => void save(draft)}>{saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Save</Button>
      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={saving} onClick={() => { setText(toEdit(draft)); setEditing(true); }}><Pencil className="mr-1 h-3 w-3" />Edit</Button>
      {redraftBtn}
    </div>
  </div>;

  if (loading) return <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{cfg.drafting}</p>;
  return <div className="flex flex-wrap items-center gap-1">
    <span className="mr-1 text-[11px] text-muted-foreground">{cfg.empty}</span>
    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => { setText(""); setEditing(true); }}><Pencil className="mr-1 h-3 w-3" />Write</Button>
    {redraftBtn}
  </div>;
}

function People({ people, empty = "No Dell stakeholders named yet." }: { people: StakeholderPerson[]; empty?: string }) {
  if (!people.length) return <p className="text-[11px] text-hot-foreground">{empty}</p>;
  return <span className="flex flex-wrap gap-1">{people.map((p) => (
    <span key={`${p.linked}:${p.name}`} title={p.title || undefined} className={cn("rounded-full border px-2 py-0.5 text-[11px]", p.linked ? "border-border bg-muted text-foreground" : "border-dashed border-muted-foreground/50 text-muted-foreground")}>
      {p.name}{p.title && <span className="text-muted-foreground"> · {p.title}</span>}
    </span>
  ))}</span>;
}

/** Gantt-style track: five steps from Interested to Existing, filled up to where this motion stands. */
function StageTrack({ motion, stage, statuses }: { motion: DellMotion; stage: DellStage; statuses: string[] }) {
  const at = trackIndex(stage);
  return <div className="min-w-0">
    <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground" title={statuses.join(", ")}>
      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: MOTION_COLOR[motion] }} />{motion} · <span className="truncate text-foreground">{stage === "Not set" ? "Not set" : stage}</span>
    </p>
    <div className="mt-1 flex gap-0.5" aria-label={`${motion}: ${stage}`}>
      {PIPELINE_STAGES.map((s, i) => <span key={s} className={cn("h-2 flex-1 rounded-sm", at < 0 || i > at ? "bg-muted" : "")}
        style={at >= 0 && i <= at ? { background: MOTION_COLOR[motion], opacity: i === at ? 1 : 0.45 } : undefined} />)}
    </div>
  </div>;
}

/** The workstream list under the board: company on the left, then engagement, where it stands, Dell people and notes. */
function EngagementList({ rows, websites, drafts, company, onCompany, onOpen, onSaved }: {
  rows: DellRow[]; websites: Record<string, string>; drafts: Drafts; company: string | null;
  onCompany: (c: string) => void; onOpen: (gid: string) => void; onSaved: () => void;
}) {
  const groups = useMemo(() => engagementList(rows), [rows]);
  if (!groups.length) return <p className="py-6 text-center text-xs text-muted-foreground">No workstreams match these filters.</p>;
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[1280px] table-fixed text-xs">
      <colgroup><col className="w-[13rem]" /><col className="w-[17rem]" /><col className="w-[14rem]" /><col className="w-[15rem]" /><col className="w-[24rem]" /><col /></colgroup>
      <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
        <th className="py-2 pr-3 font-medium">Company</th>
        <th className="py-2 pr-3 font-medium">Engagement</th>
        <th className="py-2 pr-3 font-medium">
          Where it stands
          <span className="mt-0.5 flex justify-between text-[9px] normal-case tracking-normal">{TRACK_LABELS.map((l) => <span key={l}>{l}</span>)}</span>
        </th>
        <th className="py-2 pr-3 font-medium">Key Dell stakeholders</th>
        <th className="py-2 pr-4 font-medium">Current state &amp; next steps</th>
        <th className="py-2 font-medium">Asks of Dell</th>
      </tr></thead>
      <tbody>
        {groups.flatMap((g) => g.workstreams.map((w, i) => (
          <tr key={w.workstreamId} className={cn("align-top", i === 0 ? "border-t border-border" : "border-t border-dashed border-border/60")}>
            <td className="py-3 pr-3">
              {i === 0 && <button type="button" onClick={() => onCompany(g.company)} className={cn("flex w-full min-w-0 items-center gap-2 rounded-md text-left hover:underline", company === g.company && "font-semibold")}>
                <RingLogo company={g.company} website={websites[g.company]} motions={DELL_MOTIONS.filter((m) => g.workstreams.some((x) => x.motions.some((y) => y.motion === m)))} size="sm" />
                <span className="truncate text-sm font-medium text-foreground">{g.company}</span>
              </button>}
            </td>
            <td className="py-3 pr-3">
              <button type="button" onClick={() => onOpen(w.workstreamId)} className="group inline-flex max-w-full items-start gap-1 text-left text-sm font-medium text-foreground hover:underline">
                <span className="min-w-0">{w.name}</span><ExternalLink className="mt-1 h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </button>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{w.bu}{w.products.length ? ` · ${w.products.map((p) => p.replace(/^Dell /, "")).join(", ")}` : ""}{w.completed ? " · completed" : ""}</p>
            </td>
            <td className="space-y-2 py-3 pr-3">{w.motions.map((m) => <StageTrack key={m.motion} motion={m.motion} stage={m.stage} statuses={m.statuses} />)}</td>
            <td className="py-3 pr-3"><People people={peopleOf(rows.filter((r) => r.workstreamId === w.workstreamId))} empty="None named yet" /></td>
            <td className="py-3 pr-4"><DellTextBox ws={w} kind="notes" drafts={drafts} onSaved={onSaved} /></td>
            <td className="py-3"><DellTextBox ws={w} kind="asks" drafts={drafts} onSaved={onSaved} /></td>
          </tr>
        )))}
      </tbody>
    </table>
  </div>;
}

export function DellLeverageDashboard() {
  const q = useDellLeverage();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<DellFilter>(DEFAULT_DELL_FILTER);
  const [since, setSince] = useState(() => isoDaysAgo(90));
  const [moveKind, setMoveKind] = useState<MovementKind | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<DellFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const toggle = <K extends keyof DellFilter>(k: K, v: DellFilter[K]) => setFilter((f) => ({ ...f, [k]: f[k] === v ? DEFAULT_DELL_FILTER[k] : v }));
  // A status or a company narrows the list; picking one replaces the other.
  const pickStage = (st: DellStage) => setFilter((f) => ({ ...f, company: null, stage: f.stage === st && !f.company ? null : st }));
  const pickCompany = (c: string) => setFilter((f) => ({ ...f, stage: null, company: f.company === c ? null : c }));
  const refresh = () => void qc.invalidateQueries({ queryKey: ["dell-leverage"] });

  const all = useMemo(() => q.data?.rows ?? [], [q.data]);
  const rows = useMemo(() => filterDellRows(all, filter), [all, filter]);
  const boardRows = useMemo(() => filterDellRows(all, filter, ["stage", "company"]), [all, filter]);
  const motionRows = useMemo(() => filterDellRows(all, filter, ["motion", "stage", "company"]), [all, filter]);
  const outcomes = useMemo(() => existingOutcomes(rows), [rows]);
  const products = useMemo(() => productCounts(rows), [rows]);
  const people = useMemo(() => stakeholderMap(rows), [rows]);
  const moves = useMemo(() => movementInWindow(q.data?.changes ?? [], all, since, todayIso()), [q.data, all, since]);
  const visibleIds = useMemo(() => new Set(rows.map((r) => `${r.workstreamId}:${r.motion}`)), [rows]);
  const shownMoves = moves.filter((m) => visibleIds.has(`${m.workstreamId}:${m.motion}`));
  const listRows = useMemo(() => moveKind ? rows.filter((r) => shownMoves.some((m) => m.kind === moveKind && m.workstreamId === r.workstreamId && m.motion === r.motion)) : rows, [rows, moveKind, shownMoves]);
  const listWorkstreams = useMemo(() => engagementList(listRows).flatMap((g) => g.workstreams), [listRows]);
  const drafts = useNoteDrafts(listWorkstreams, !!q.data && !q.data.error);
  const buOptions = useMemo(() => [...new Set(all.map((r) => r.bu))].sort((a, b) => (a === NO_BU ? 1 : b === NO_BU ? -1 : a.localeCompare(b))), [all]);
  const filtered = JSON.stringify(filter) !== JSON.stringify(DEFAULT_DELL_FILTER) || !!moveKind;
  const listKey = `${filter.motion}|${filter.stage}|${filter.company}|${moveKind}`;
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (filter.stage || filter.company) listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [listKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = <div className="space-y-1">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Dell Leverage Dashboard</h1>
      {!!all.length && <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Motion">
        {DELL_MOTIONS.map((m) => {
          const n = new Set(motionRows.filter((r) => r.motion === m).map((r) => r.workstreamId)).size;
          const on = filter.motion === m;
          return <button key={m} type="button" aria-pressed={on} onClick={() => set({ motion: on ? "Both" : m })}
            className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted",
              filter.motion !== "Both" && !on && "opacity-50")}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: MOTION_COLOR[m] }} />{m}
            <span className="tabular-nums">{n}</span><span className={on ? "text-primary-foreground/80" : "text-muted-foreground"}>workstream{n === 1 ? "" : "s"}</span>
          </button>;
        })}
      </div>}
    </div>
    <p className="text-sm text-muted-foreground">Where each Sell-In and Sell-With workstream stands with Dell.</p>
  </div>;

  if (!q.data && !q.isError) return <div className="space-y-4">{header}<p className="flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading Dell workstreams…</p></div>;
  if (!q.data || q.data.error) return <div className="space-y-4">{header}<Card className="border-border"><CardContent className="p-8 text-center text-sm text-muted-foreground">Dell workstream data is unavailable right now. Try again in a minute.</CardContent></Card></div>;
  if (!all.length) return <div className="space-y-4">{header}<Card className="border-border"><CardContent className="p-8 text-center text-sm text-muted-foreground">No workstreams have a Sell-In or Sell With Dell Status yet.</CardContent></Card></div>;

  const maxProduct = Math.max(1, ...products.map((p) => p.count));
  const maxOutcome = Math.max(1, ...outcomes.sellWith.map((o) => o.count), ...outcomes.sellIn.map((o) => o.count));
  const moveCounts = (k: MovementKind) => shownMoves.filter((m) => m.kind === k).length;
  const websites = q.data.websites ?? {};
  const chips = [
    filter.stage && { label: filter.stage, clear: () => set({ stage: null }) },
    filter.company && { label: filter.company, clear: () => set({ company: null }) },
    moveKind && { label: MOVE_LABEL[moveKind], clear: () => setMoveKind(null) },
  ].filter(Boolean) as Array<{ label: string; clear: () => void }>;

  return <div className="space-y-5">
    {header}

    {/* Company status board: the page's navigation, full width */}
    <Card className="border-border"><CardContent className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h2 className="font-display text-base font-semibold text-foreground">Companies by Dell status</h2>
          <MotionLegend />
          <span className="text-xs text-muted-foreground">Split ring = both · number = workstreams at that status</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filtered && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilter(DEFAULT_DELL_FILTER); setMoveKind(null); }}><X className="mr-1 h-3.5 w-3.5" />Clear filters</Button>}
          <Select value={filter.bu ?? ALL} onValueChange={(v) => set({ bu: v === ALL ? null : v })}>
            <SelectTrigger className="h-8 w-48 text-xs" aria-label="Dell business unit"><SelectValue placeholder="Dell BU" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Dell BUs</SelectItem>{buOptions.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="overflow-x-auto pb-1">
        <CompanyBoard rows={boardRows} websites={websites} stage={filter.company ? null : filter.stage} company={filter.company} onStage={pickStage} onCompany={pickCompany} />
      </div>
      {!q.data.stakeholdersLinked && <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" />Network people couldn't be read, so stakeholder names aren't linked.</p>}
    </CardContent></Card>

    {/* Workstream list, narrowed by anything clicked above */}
    <div ref={listRef} className="scroll-mt-4">
      <Section title={`Workstreams · ${listWorkstreams.length}`}
        sub="Click a status, a company or Sell-In / Sell-With above to narrow the list. Notes and asks are Dell-facing: V.I.C. drafts them and nothing is saved until you click Save."
        right={chips.length ? <div className="flex flex-wrap items-center gap-1.5">{chips.map((c) => (
          <button key={c.label} type="button" onClick={c.clear} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-primary bg-primary px-3 text-xs text-primary-foreground"><span className="max-w-[14rem] truncate">{c.label}</span><X className="h-3 w-3 shrink-0" /></button>
        ))}</div> : undefined}>
        {drafts.error && <p className="mb-2 text-xs text-muted-foreground">{drafts.error}</p>}
        <EngagementList rows={listRows} websites={websites} drafts={drafts} company={filter.company} onCompany={pickCompany} onOpen={setOpenId} onSaved={refresh} />
      </Section>
    </div>

    {/* Movement */}
    <Section title="Movement since last QBR" sub="Status changes recorded in the PortCo Change Log. Click a count to filter the workstream list above.">
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

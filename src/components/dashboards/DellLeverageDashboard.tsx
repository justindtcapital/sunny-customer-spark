// Dell Leverage Dashboard: a QBR view of the Sell-In and Sell-With workstreams, written from Dell's
// side. Rows come from fetchDellLeverageFn, which only returns Dell-facing fields (no DTC
// priorities, ROI ratings, owners or notes), so the page is safe to share on screen.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, UserRoundX, X } from "lucide-react";
import { fetchDellLeverageFn, type DellLeverageData } from "@/utils/dell-leverage.functions";
import { useAuth } from "@/lib/auth-context";
import {
  ALL_STAGES, DEFAULT_DELL_FILTER, DELL_MOTIONS, NO_BU, PIPELINE_STAGES, buHeatmap, existingOutcomes, filterDellRows, hasLinkedStakeholder,
  movementInWindow, productCounts, stageCounts, stakeholderMap, summarizeDell,
  type DellFilter, type DellMotion, type DellRow, type DellStage, type Movement, type MovementKind,
} from "@/lib/dell-leverage";
import { useWorkstreams } from "@/lib/use-workstreams";
import { WorkstreamDetail } from "@/components/portfolio/WorkstreamsPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function Stat({ label, value, sub, onClick, active }: { label: string; value: string; sub?: string; onClick?: () => void; active?: boolean }) {
  const body = <CardContent className="p-4">
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="font-display text-2xl font-semibold tabular-nums text-foreground mt-1">{value}</p>
    {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
  </CardContent>;
  return <Card className={cn("border-border", active && "ring-2 ring-primary", onClick && "cursor-pointer transition-shadow hover:shadow-md")} onClick={onClick}>{body}</Card>;
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

const MOVE_LABEL: Record<MovementKind, string> = { advanced: "Advanced", slipped: "Slipped", new: "New", closed: "Closed" };
const MOVE_TONE: Record<MovementKind, string> = {
  advanced: "bg-good text-good-foreground", slipped: "bg-hot text-hot-foreground", new: "bg-cold text-cold-foreground", closed: "bg-muted text-muted-foreground",
};

export function DellLeverageDashboard() {
  const q = useDellLeverage();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<DellFilter>(DEFAULT_DELL_FILTER);
  const [since, setSince] = useState(() => isoDaysAgo(90));
  const [moveKind, setMoveKind] = useState<MovementKind | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const set = (patch: Partial<DellFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const toggle = <K extends keyof DellFilter>(k: K, v: DellFilter[K]) => setFilter((f) => ({ ...f, [k]: f[k] === v ? DEFAULT_DELL_FILTER[k] : v }));

  const all = useMemo(() => q.data?.rows ?? [], [q.data]);
  const rows = useMemo(() => filterDellRows(all, filter), [all, filter]);
  const funnelRows = useMemo(() => filterDellRows(all, filter, ["stage"]), [all, filter]);
  const heatRows = useMemo(() => filterDellRows(all, filter, ["bu", "stage"]), [all, filter]);
  const summary = useMemo(() => summarizeDell(rows), [rows]);
  const heat = useMemo(() => buHeatmap(heatRows), [heatRows]);
  const outcomes = useMemo(() => existingOutcomes(rows), [rows]);
  const products = useMemo(() => productCounts(rows), [rows]);
  const people = useMemo(() => stakeholderMap(rows), [rows]);
  const moves = useMemo(() => movementInWindow(q.data?.changes ?? [], all, since, todayIso()), [q.data, all, since]);
  const visibleIds = useMemo(() => new Set(rows.map((r) => `${r.workstreamId}:${r.motion}`)), [rows]);
  const shownMoves = moves.filter((m) => visibleIds.has(`${m.workstreamId}:${m.motion}`));
  const tableRows = moveKind ? rows.filter((r) => shownMoves.some((m) => m.kind === moveKind && m.workstreamId === r.workstreamId && m.motion === r.motion)) : rows;
  const buOptions = useMemo(() => [...new Set(all.map((r) => r.bu))].sort((a, b) => (a === NO_BU ? 1 : b === NO_BU ? -1 : a.localeCompare(b))), [all]);
  const domainOptions = useMemo(() => [...new Set(all.map((r) => r.domain))].sort(), [all]);
  const filtered = JSON.stringify(filter) !== JSON.stringify(DEFAULT_DELL_FILTER) || !!moveKind;

  if (!q.data && !q.isError) return <p className="flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading Dell workstreams…</p>;
  if (!q.data || q.data.error) return <Card className="border-border"><CardContent className="p-8 text-center text-sm text-muted-foreground">Dell workstream data is unavailable right now. Try again in a minute.</CardContent></Card>;
  if (!all.length) return <Card className="border-border"><CardContent className="p-8 text-center text-sm text-muted-foreground">No workstreams have a Sell-In or Sell With Dell Status yet.</CardContent></Card>;

  const maxHeat = Math.max(1, ...heat.flatMap((h) => ALL_STAGES.map((s) => h.cells[s])));
  const maxProduct = Math.max(1, ...products.map((p) => p.count));
  const maxOutcome = Math.max(1, ...outcomes.sellWith.map((o) => o.count), ...outcomes.sellIn.map((o) => o.count));
  const moveCounts = (k: MovementKind) => shownMoves.filter((m) => m.kind === k).length;

  return <div className="space-y-5">
    {/* Filters */}
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-border bg-card p-0.5">
        {(["Both", ...DELL_MOTIONS] as const).map((m) => (
          <button key={m} type="button" onClick={() => set({ motion: m })}
            className={cn("rounded px-3 py-1 text-xs font-medium", filter.motion === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{m}</button>
        ))}
      </div>
      <Select value={filter.bu ?? ALL} onValueChange={(v) => set({ bu: v === ALL ? null : v })}>
        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Dell BU" /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>All Dell BUs</SelectItem>{buOptions.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={filter.domain ?? ALL} onValueChange={(v) => set({ domain: v === ALL ? null : v })}>
        <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Domain" /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>All domains</SelectItem>{domainOptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={filter.stage ?? ALL} onValueChange={(v) => set({ stage: v === ALL ? null : (v as DellStage) })}>
        <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>All statuses</SelectItem>{ALL_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
      </Select>
      <button type="button" onClick={() => toggle("missingStakeholders", true)}
        className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs", filter.missingStakeholders ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
        <UserRoundX className="h-3.5 w-3.5" />Missing stakeholders
      </button>
      <label className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={filter.includeCompleted} onCheckedChange={(v) => set({ includeCompleted: v })} />Include completed</label>
      {filtered && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilter(DEFAULT_DELL_FILTER); setMoveKind(null); }}><X className="h-3.5 w-3.5 mr-1" />Clear filters</Button>}
    </div>

    {/* KPIs */}
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <Stat label="Active Dell workstreams" value={String(summary.active)} sub={`${summary.byMotion["Sell-In"]} Sell-In · ${summary.byMotion["Sell-With"]} Sell-With${summary.workstreams !== summary.active ? ` · ${summary.workstreams - summary.active} completed` : ""}`} />
      <Stat label="Engaged & progressing" value={String(summary.progressing)} onClick={() => toggle("stage", "Engaged / Progressing")} active={filter.stage === "Engaged / Progressing"} />
      <Stat label="Stalled" value={String(summary.stalled)} sub={summary.stalledShare == null ? "No engaged workstreams" : `${Math.round(summary.stalledShare * 100)}% of engaged`} onClick={() => toggle("stage", "Engaged / Stalled")} active={filter.stage === "Engaged / Stalled"} />
      <Stat label="Live with Dell" value={String(summary.existing)} sub="Existing outcomes" onClick={() => toggle("stage", "Existing")} active={filter.stage === "Existing"} />
      <Stat label="Companies" value={String(summary.companies)} sub={`${summary.stakeholderReach} Dell people engaged`} />
      <Stat label="Stakeholder coverage" value={pct(summary.coverage.covered, summary.coverage.total)}
        sub={`Sell-In ${pct(summary.coverageByMotion["Sell-In"].covered, summary.coverageByMotion["Sell-In"].total)} · Sell-With ${pct(summary.coverageByMotion["Sell-With"].covered, summary.coverageByMotion["Sell-With"].total)}`}
        onClick={() => toggle("missingStakeholders", true)} active={filter.missingStakeholders} />
    </div>
    {!q.data.stakeholdersLinked && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" />Network people couldn't be read, so stakeholder names aren't linked and coverage reads low.</p>}

    {/* Funnel + motion split */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Section title="Pipeline" sub="From first interest to live with Dell. Click a stage to filter." className="lg:col-span-2">
        <DellFunnel rows={funnelRows} selected={filter.stage} onStage={(s) => toggle("stage", s)} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <MotionLegend />
          <span className="text-xs text-muted-foreground">
            {stageCounts(funnelRows).filter((c) => c.stage === "Not Moving Forward" || c.stage === "Not set").map((c) => (
              <button key={c.stage} type="button" onClick={() => toggle("stage", c.stage)} className={cn("ml-3 hover:text-foreground", filter.stage === c.stage && "font-semibold text-foreground")}>{c.stage}: {c.total}</button>
            ))}
          </span>
        </div>
      </Section>
      <Section title="Sell-In vs Sell-With" sub="Selling to Dell as a customer, and selling with Dell to its customers.">
        <div className="grid grid-cols-2 gap-3">
          {DELL_MOTIONS.map((m) => {
            const mine = funnelRows.filter((r) => r.motion === m);
            const live = mine.filter((r) => r.stage === "Existing").length;
            const engaged = mine.filter((r) => r.stage === "Engaged / Progressing" || r.stage === "Engaged / Stalled").length;
            return <button key={m} type="button" onClick={() => set({ motion: filter.motion === m ? "Both" : m })}
              className={cn("rounded-lg border p-3 text-left hover:shadow-sm", filter.motion === m ? "border-primary" : "border-border")}>
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: MOTION_COLOR[m] }} />{m}</span>
              <span className="mt-2 block font-display text-3xl font-semibold tabular-nums text-foreground">{new Set(mine.map((r) => r.workstreamId)).size}</span>
              <span className="block text-[11px] text-muted-foreground">{engaged} engaged · {live} live</span>
            </button>;
          })}
        </div>
      </Section>
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
          {b.gaps > 0 && <button type="button" onClick={() => set({ bu: b.bu, missingStakeholders: true })} className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-hot-foreground hover:underline">
            <UserRoundX className="h-3 w-3" />{b.gaps} without a linked stakeholder
          </button>}
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

    <WorkstreamEditorSheet gid={openId} onClose={() => setOpenId(null)} onSaved={() => void qc.invalidateQueries({ queryKey: ["dell-leverage"] })} />
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

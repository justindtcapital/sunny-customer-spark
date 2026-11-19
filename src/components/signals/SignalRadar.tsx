import { useMemo } from "react";
import { Factory, LayoutGrid, Newspaper, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { FeedCard } from "@/lib/signal-feed";
import { DATE_WINDOWS, DEFAULT_DAYS, type SignalsSearch } from "@/lib/signals-page";
import { radarColumns, radarCounts, RINGS, type RadarKeys, type RadarView, type Ring } from "@/lib/signal-radar";

const RING_STYLE: Record<Ring, { fill: string; text: string; band: string }> = {
  Market: { fill: "fill-ring-market", text: "fill-ring-market-foreground", band: "bg-ring-market/60 text-ring-market-foreground" },
  Network: { fill: "fill-ring-network", text: "fill-ring-network-foreground", band: "bg-ring-network/30 text-foreground" },
  PortCo: { fill: "fill-ring-portco", text: "fill-ring-portco-foreground", band: "bg-ring-portco/20 text-foreground" },
};
const R = 300;
const RADII: Record<Ring, [number, number]> = { Market: [200, 300], Network: [100, 200], PortCo: [0, 100] };

function ringPath(r1: number, r2: number) {
  const outer = `M ${R - r2} ${R} A ${r2} ${r2} 0 0 1 ${R} ${R - r2}`;
  return r1 === 0 ? `${outer} L ${R} ${R} Z` : `${outer} L ${R} ${R - r1} A ${r1} ${r1} 0 0 0 ${R - r1} ${R} Z`;
}

/** By Source / By Industry / By Domain switch (mirrors the Network pyramid switch). */
export function SignalRadarSwitch({ view, onChange }: { view: RadarView; onChange: (v: RadarView) => void }) {
  const opts: { v: RadarView; label: string; Icon: typeof LayoutGrid }[] = [
    { v: "source", label: "By Source", Icon: Newspaper },
    { v: "industry", label: "By Industry", Icon: Factory },
    { v: "domain", label: "By Domain", Icon: LayoutGrid },
  ];
  return <div className="inline-flex rounded-md border p-1" aria-label="Signals view">
    {opts.map(({ v, label, Icon }) => <Button key={v} size="sm" variant={view === v ? "default" : "ghost"} aria-pressed={view === v} className="h-7 gap-1.5 px-2.5" onClick={() => onChange(v)}><Icon className="size-3.5" />{label}</Button>)}
  </div>;
}

export function SignalRadar({ cards, keys, search, onChange, query, onQuery, portcos }: {
  cards: FeedCard[]; keys: RadarKeys; search: SignalsSearch; onChange: (p: Partial<SignalsSearch>) => void;
  query: string; onQuery: (q: string) => void; portcos: string[];
}) {
  const view = (search.view as RadarView) || "domain";
  const cols = radarColumns(view);
  const { cells, rings } = useMemo(() => radarCounts(cards, view, keys), [cards, view, keys]);
  const max = Math.max(1, ...cells.values());
  const days = search.days ?? DEFAULT_DAYS;
  const pickRing = (r: Ring) => onChange(search.ring === r && !search.col ? { ring: undefined, col: undefined } : { ring: r, col: undefined });
  const pickCell = (r: Ring, c: string) => onChange(search.ring === r && search.col === c ? { ring: undefined, col: undefined } : { ring: r, col: c, view });
  const active = !!(search.ring || search.col || search.pc?.length || query || search.days !== undefined);

  return <section className="mb-4 rounded-xl border border-border bg-card p-4">
    <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
      <SignalRadarSwitch view={view} onChange={(v) => onChange({ view: v === "domain" ? undefined : v, col: undefined })} />
    </div>

    <div className="flex gap-0 overflow-x-auto">
      <svg viewBox="0 0 300 300" className="h-[150px] w-[150px] shrink-0 sm:h-[216px] sm:w-[216px]" role="group" aria-label="Signal rings">
        {RINGS.map((r) => {
          const [r1, r2] = RADII[r]; const mid = r1 ? (r1 + r2) / 2 : 62;
          const a = ((r1 ? 225 : 238) * Math.PI) / 180;
          const sel = search.ring === r;
          return <g key={r} className="cursor-pointer" onClick={() => pickRing(r)} role="button" aria-pressed={sel} aria-label={`${r} signals`}>
            <path d={ringPath(r1, r2)} className={cn(RING_STYLE[r].fill, "stroke-ring-line transition-opacity", search.ring && !sel && "opacity-50")} strokeWidth={sel ? 5 : 3} />
            <text x={R + Math.cos(a) * mid} y={R + Math.sin(a) * mid} textAnchor="middle" className={cn(RING_STYLE[r].text, r1 ? "text-[26px] font-medium" : "text-[21px] font-medium")}>{r}</text>
            <text x={R + Math.cos(a) * mid} y={R + Math.sin(a) * mid + 26} textAnchor="middle" className={cn(RING_STYLE[r].text, "text-[18px] opacity-80")}>{rings.get(r) || 0}</text>
          </g>;
        })}
      </svg>

      <div className="min-w-[420px] flex-1">
        <div className="grid h-[150px] grid-rows-3 sm:h-[216px]" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
          {RINGS.map((r) => cols.map((c) => {
            const n = cells.get(`${r}|${c}`) || 0;
            const sel = search.ring === r && search.col === c;
            const dim = (search.ring && search.ring !== r) || (search.col && search.col !== c);
            return <button key={`${r}-${c}`} type="button" onClick={() => pickCell(r, c)} aria-pressed={sel} aria-label={`${r} · ${c}: ${n}`}
              className={cn("relative flex flex-col items-center justify-center border-r border-border/40 transition", RING_STYLE[r].band, sel && "ring-2 ring-inset ring-primary", dim && !sel && "opacity-50", "hover:brightness-95")}>
              {r === "Market" && <span className="absolute top-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{c}</span>}
              <span className={cn("tabular-nums", n ? "text-lg font-semibold" : "text-sm text-muted-foreground")}>{n}</span>
              {n > 0 && <span className="mt-0.5 h-1 rounded-full bg-current opacity-40" style={{ width: `${Math.max(8, (n / max) * 70)}%` }} />}
            </button>;
          }))}
        </div>
      </div>
    </div>

    <div className="mt-3 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search signals" placeholder="Search signals…" value={query} onChange={(e) => onQuery(e.target.value)} className="h-8 pl-8" />
      </div>
      <div className="flex flex-wrap gap-1">
        {[...DATE_WINDOWS, { value: "all" as const, label: "All time" }].map((w) => (
          <button key={String(w.value)} type="button" onClick={() => onChange({ days: w.value === DEFAULT_DAYS ? undefined : w.value })}
            className={cn("rounded-full border px-2.5 py-0.5 text-xs", days === w.value ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent")}>{w.label}</button>
        ))}
      </div>
      <Select value={search.pc?.[0] ?? "__all"} onValueChange={(v) => onChange({ pc: v === "__all" ? undefined : [v] })}>
        <SelectTrigger className="h-8 w-[180px] text-xs" aria-label="PortCo"><SelectValue placeholder="All PortCos" /></SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="__all">All PortCos</SelectItem>
          {portcos.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        </SelectContent>
      </Select>
      {active && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { onQuery(""); onChange({ ring: undefined, col: undefined, pc: undefined, seg: undefined, ind: undefined, src: undefined, q: undefined, days: undefined }); }}><X className="h-3 w-3" /> Clear</Button>}
    </div>
  </section>;
}

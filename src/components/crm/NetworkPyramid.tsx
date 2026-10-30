import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { ChevronUp, Loader2, Maximize2, X, Users, Globe2, LayoutGrid, ChartNoAxesCombined, Pencil, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useFilters } from "@/lib/filter-context";
import type { Contact } from "@/lib/types";
import { isMyContact, ownerMatches, type TeamProfile } from "@/lib/user-ownership";
import { fetchNetworkPyramid, saveNetworkTargets } from "@/utils/sheets.functions";
import {
  dotBreakdown, marketFor, movementKpis, primaryDomainFor, MARKETS, PRIMARY_DOMAINS, PYRAMID_TIERS, WINDOWS,
  type PyramidTier, type WindowKey,
} from "@/lib/network-pyramid";

export interface PyramidSelection { tier: PyramidTier; view: "domain" | "geo" | "tier"; column: string }
type View = "kpis" | "domain" | "geo";

export function contactMatchesPyramid(c: Contact, sel: PyramidSelection): boolean {
  if (c.portco || c.temperature !== sel.tier) return false;
  if (sel.view === "tier") return true;
  const col = sel.view === "domain" ? primaryDomainFor(c.primaryArea, c.areasOfInterest) : marketFor(c.location);
  return col === sel.column;
}

const tierTone: Record<PyramidTier, string> = {
  Council: "text-council-foreground", Hot: "text-hot-foreground", Warm: "text-warm-foreground",
  Cold: "text-cold-foreground", Prospect: "text-muted-foreground",
};

function Dots({ n }: { n: number }) {
  return <div className="flex h-4 items-center gap-1" aria-hidden="true">
    {dotBreakdown(n).flatMap(({ size, count }) => Array.from({ length: Math.min(count, 4) }, (_, i) =>
      <span key={`${size}-${i}`} className={cn("shrink-0 rounded-full bg-current opacity-55", size === 50 ? "size-2.5" : size === 10 ? "size-1.5" : size === 5 ? "size-1" : "size-0.5")} />
    )).slice(0, 10)}
  </div>;
}

function MiniPyramid() {
  return <svg viewBox="0 0 50 40" className="h-6 w-7 shrink-0" aria-hidden="true">
    {PYRAMID_TIERS.map((t, i) => {
      const y = i * 8, w0 = (i / 5) * 50, w1 = ((i + 1) / 5) * 50;
      return <polygon key={t} className={cn("fill-current", tierTone[t])} points={`${25 - w0 / 2},${y + 0.6} ${25 + w0 / 2},${y + 0.6} ${25 + w1 / 2},${y + 7.4} ${25 - w1 / 2},${y + 7.4}`} />;
    })}
  </svg>;
}

function TierChart({ counts, active, onTier }: { counts: Record<PyramidTier, number | null>; active: PyramidTier | null; onTier: (t: PyramidTier) => void }) {
  return <div className="network-tier-chart" aria-label="Relationship tiers">
    <svg viewBox="0 0 240 250" className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={PYRAMID_TIERS.map(t => `${t === "Prospect" ? "Prospects" : t} ${counts[t] ?? "pending"}`).join(", ")}>
      {PYRAMID_TIERS.map((tier, i) => {
        const top = i * 50 + 1.5, bottom = (i + 1) * 50 - 1.5;
        const topWidth = i * 48, bottomWidth = (i + 1) * 48;
        const label = tier === "Prospect" ? "Prospects" : tier;
        const n = counts[tier];
        const apex = i === 0;
        // Left edge x at the label baseline (edge slopes 24 units per band).
        const labelY = bottom - 4;
        const leftAtLabel = 120 - topWidth / 2 - ((labelY - top) / (bottom - top)) * 24;
        return <g key={tier} role="button" tabIndex={0} aria-label={`Show everyone in ${label}`} aria-pressed={active === tier}
          onClick={() => onTier(tier)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTier(tier); } }}
          className={cn("network-tier cursor-pointer outline-none", tierTone[tier], active && active !== tier && "opacity-45")}>
          <title>{tier === "Prospect" ? "Open the Prospecting page" : `Show everyone in ${label}`}</title>
          <polygon className="fill-current" points={`${120-topWidth/2},${top} ${120+topWidth/2},${top} ${120+bottomWidth/2},${bottom} ${120-bottomWidth/2},${bottom}`} />
          <text x={120} y={apex ? top + 30 : (top + bottom) / 2 + 4} textAnchor="middle" className="fill-background font-semibold tabular-nums" style={{ fontSize: apex ? 12 : 18 }}>{n?.toLocaleString() ?? "—"}</text>
          <text x={leftAtLabel + (apex ? 3 : 6)} y={labelY} textAnchor="start" className="fill-background font-medium uppercase" style={{ fontSize: apex ? 6 : 7.5, letterSpacing: apex ? 0.2 : 0.8 }}>{label}</text>
        </g>;
      })}
    </svg>
  </div>;
}

export function NetworkPyramid({
  contacts, profile, ownedGids, selection, onSelect, expanded, onExpandedChange: setExpanded, embedded = false,
}: {
  /** Homepage tile: contacts arrive already scoped to "mine"; header controls are hidden. */
  embedded?: boolean;
  ownedGids?: Set<string>;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  contacts: Contact[];
  profile: TeamProfile | null;
  selection: PyramidSelection | null;
  onSelect: (s: PyramidSelection | null) => void;
}) {
  const [view, setView] = useState<View>("domain");
  const navigate = useNavigate();
  // Scope is shared with the sidebar's "My contacts / Everyone" switch so both always agree.
  const { filters, setFilters } = useFilters();
  const scope: "mine" | "ours" = filters.ownershipScope === "everyone" ? "ours" : "mine";
  const setScope = (s: "mine" | "ours") => setFilters({ ...filters, ownershipScope: s === "mine" ? "mine" : "everyone" });
  const owned = useMemo(() => ownedGids || new Set<string>(), [ownedGids]);
  const [win, setWin] = useState<WindowKey>("30d");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const save = useServerFn(saveNetworkTargets);
  const pyramidQuery = useQuery({ queryKey: ["network-pyramid"], queryFn: () => fetchNetworkPyramid(), enabled: expanded, staleTime: 5 * 60_000 });
  const data = pyramidQuery.data;

  const mine = embedded || scope === "mine";
  const people = useMemo(() => {
    const net = contacts.filter((c) => embedded || !mine || (!!profile && isMyContact(c, owned, profile))).map((c) => ({
      email: c.email, tier: c.temperature as PyramidTier, domain: primaryDomainFor(c.primaryArea, c.areasOfInterest), market: marketFor(c.location), dateAdded: c.dateAdded,
    }));
    const pros = (data?.prospects || []).filter((p) => !mine || (!!profile && ownerMatches(p.prime, profile))).map((p) => ({
      email: p.email, tier: "Prospect" as PyramidTier, domain: primaryDomainFor("", p.areas), market: marketFor(p.location), dateAdded: p.dateAdded,
    }));
    return [...net, ...pros];
  }, [contacts, data, mine, profile, owned, embedded]);
  const sidebarCount = Object.entries(filters).filter(([k, v]) => !["search", "ownershipScope", "dateField"].includes(k) && (Array.isArray(v) ? v.length > 0 : typeof v === "boolean" ? v : typeof v === "string" ? !!v : false)).length;

  const counts = useMemo(() => {
    const out = Object.fromEntries(PYRAMID_TIERS.map((t) => [t, 0])) as Record<PyramidTier, number | null>;
    for (const p of people) out[p.tier] = (out[p.tier] || 0) + 1;
    if (!data) out.Prospect = null;
    return out;
  }, [people, data]);

  const networkCount = PYRAMID_TIERS.reduce((total, tier) => tier === "Prospect" ? total : total + (counts[tier] ?? 0), 0);

  const kpis = useMemo(() => {
    const emails = new Set(people.map((p) => p.email.toLowerCase()).filter(Boolean));
    const moves = (data?.movements || []).filter((m) => !mine || emails.has(m.email.toLowerCase()));
    return movementKpis(moves, people, WINDOWS[win]);
  }, [people, data, mine, win]);

  const columns = view === "domain" ? [...PRIMARY_DOMAINS] : view === "geo" ? [...MARKETS] : [];
  const cellCount = (tier: PyramidTier, col: string) =>
    people.filter((p) => p.tier === tier && (view === "domain" ? p.domain : p.market) === col).length;

  if (!expanded) {
    return (
      <Button variant="outline" onClick={() => setExpanded(true)} className="h-9 gap-2 px-3" title="Open the Network Pyramid">
        <MiniPyramid />
        <span className="text-xs">Network overview</span>
        <Maximize2 className="size-3.5 text-muted-foreground" />
      </Button>
    );
  }

  const saveTargets = async () => {
    const targets = Object.fromEntries(PYRAMID_TIERS.map((t) => [t, Number(draft[t] ?? data?.targets[t] ?? 0) || 0]));
    try {
      await save({ data: { targets } });
      await queryClient.invalidateQueries({ queryKey: ["network-pyramid"] });
      setEditing(false);
      toast.success("Targets saved");
    } catch { toast.error("Couldn't save targets"); }
  };

  const kpiCols = ["Target", "Current", "Gap", "Added", "Removed", "Promoted in", "Demoted out"];
  const changeCols = ["+ In", "− Out", "Net 30 days"];
  const displayCols = embedded ? changeCols : view === "kpis" ? kpiCols : columns;

  return (
    <section className={cn("network-overview min-w-0", embedded ? "network-overview-embedded" : "mb-6 border-y py-5")} aria-label="Network Pyramid">
      {!embedded && <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">Network overview</h2>
            {pyramidQuery.isFetching && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{scope === "mine" ? "My contacts" : "Everyone at DTC"} · {networkCount.toLocaleString()} network relationships · {counts.Prospect === null ? "prospects pending" : `${counts.Prospect.toLocaleString()} prospects in pipeline`}{sidebarCount > 0 && ` · ${sidebarCount} sidebar filter${sidebarCount > 1 ? "s" : ""} also narrow the list below`}</p>
        </div>
        <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={() => setExpanded(false)} title="Collapse" aria-label="Collapse Network overview"><ChevronUp /></Button>
        <div className="network-view-controls col-span-2 flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-md bg-muted p-1" aria-label="Network view">
            {(["domain", "geo", "kpis"] as View[]).map(v => {
              const Icon = v === "domain" ? LayoutGrid : v === "geo" ? Globe2 : ChartNoAxesCombined;
              return <Button key={v} size="sm" variant="ghost" aria-pressed={view === v} className={cn("h-7 gap-1.5 px-2.5", view === v && "bg-card text-primary hover:bg-card")} onClick={() => setView(v)}><Icon className="size-3.5" />{v === "kpis" ? "KPIs" : v === "domain" ? "Domain" : "Geo"}</Button>;
            })}
          </div>
          <div className="inline-flex rounded-md border p-1" aria-label="Network scope">
            {(["mine", "ours"] as const).map(s => <Button key={s} size="sm" variant={scope === s ? "default" : "ghost"} className="h-7 gap-1.5 px-2.5" disabled={s === "mine" && !profile} aria-pressed={scope === s} onClick={() => setScope(s)}><Users className="size-3.5" />{s === "mine" ? "My contacts" : "Everyone"}</Button>)}
          </div>
        </div>
      </header>}
      {data?.error && <p role="alert" className="mt-3 text-xs text-destructive">{data.error}</p>}
      {view === "kpis" && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <div className="flex items-center gap-1">
          {(Object.keys(WINDOWS) as WindowKey[]).map(w => <Button key={w} size="sm" variant={win === w ? "secondary" : "ghost"} aria-pressed={win === w} className="h-7 px-2" onClick={() => setWin(w)}>{w === "30d" ? "30 days" : w === "6m" ? "6 months" : "12 months"}</Button>)}
        </div>
        <div className="flex items-center gap-1">{editing ? <><Button size="sm" className="h-7" onClick={saveTargets}><Check />Save targets</Button><Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(false)}>Cancel</Button></> : <Button size="sm" variant="outline" className="h-7" disabled={!data} onClick={() => { setDraft({}); setEditing(true); }}><Pencil />Edit targets</Button>}</div>
      </div>}
      <div className={cn("network-overview-body", !embedded && "mt-5")}>
        <TierChart counts={counts} active={selection?.view === "tier" ? selection.tier : null} onTier={(t) => {
          if (t === "Prospect") { navigate({ to: "/targeting" }); return; }
          onSelect(selection?.view === "tier" && selection.tier === t ? null : { tier: t, view: "tier", column: "" });
        }} />
        <div className={cn("network-breakdown min-w-0", view === "geo" && !embedded ? "network-breakdown-geo" : embedded ? "network-breakdown-change" : view === "kpis" ? "network-breakdown-kpis" : "network-breakdown-domain")}>
          <div className="network-column-headings">{displayCols.map(col => <div key={col} className="min-w-0 px-1 text-center text-[11px] font-medium leading-tight text-muted-foreground">{col}</div>)}</div>
          {PYRAMID_TIERS.map(tier => {
            const n = counts[tier], k = kpis[tier], target = data?.targets[tier];
            const values = [target ?? "—", n ?? "—", target !== undefined && n !== null ? Math.max(0, target - n) : "—", k.added, k.removed, k.promotedIn, k.demotedOut];
            return <div key={tier} className={cn("network-data-row", tierTone[tier])}>
              <div className="network-mobile-tier text-xs font-semibold">{tier === "Prospect" ? "Prospects" : tier}<span className="ml-auto tabular-nums text-foreground">{n?.toLocaleString() ?? "—"}</span></div>
              {displayCols.map((col, j) => {
                if (embedded) {
                  const inn = k.added + k.promotedIn, out = k.removed + k.demotedOut, v = [inn, out, inn - out][j];
                  const txt = j === 0 ? `+${v}` : j === 1 ? `−${v}` : v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0";
                  return <div key={col} className="network-metric min-w-0 px-1"><span className={cn("text-sm font-semibold tabular-nums", v ? "text-foreground" : "text-muted-foreground/50")}>{txt}</span></div>;
                }
                if (view === "kpis") return <div key={col} className="network-metric min-w-0 px-1">
                  <span className="network-mobile-label text-[11px] text-muted-foreground">{col}</span>
                  {editing && j === 0 ? <Input aria-label={`${tier} target`} type="number" min={0} className="h-7 min-w-0 px-1 text-center text-xs" value={draft[tier] ?? String(target ?? "")} onChange={e => setDraft(d => ({...d, [tier]: e.target.value}))} /> : <span className="text-sm font-semibold tabular-nums text-foreground">{typeof values[j] === "number" ? values[j].toLocaleString() : values[j]}</span>}
                </div>;
                const c = cellCount(tier, col);
                const active = selection?.tier === tier && selection.column === col && selection.view === view;
                const clickable = tier !== "Prospect" && c > 0;
                return <Button key={col} variant="ghost" disabled={!clickable} aria-label={`Show ${tier} · ${col}: ${c}`} aria-pressed={!!active} onClick={() => onSelect(active ? null : { tier, view: view as "domain" | "geo", column: col })} title={tier === "Prospect" ? "Prospects are listed on the Prospecting page" : `Show ${tier} · ${col}`} className={cn("network-cell min-w-0 rounded-sm px-1 text-current disabled:opacity-100", active && "bg-accent ring-1 ring-primary ring-inset")}>
                  <span className="network-mobile-label text-[11px] font-normal text-muted-foreground">{col}</span>
                  <span className={cn("text-base font-semibold tabular-nums", c ? "text-foreground" : "text-muted-foreground/50")}>{c.toLocaleString()}</span>
                  <span className="network-cell-dots"><Dots n={c} /></span>
                </Button>;
              })}
            </div>;
          })}
        </div>
      </div>
      {selection && <div className="mt-4 flex min-w-0 items-center gap-2 border-t pt-3 text-xs">
        <span className="min-w-0 text-primary">{selection.view === "tier" ? `Everyone in ${selection.tier}` : `${selection.tier} · ${selection.column}`}</span>
        <Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={() => onSelect(null)}><X className="size-3" />Clear</Button>
      </div>}
    </section>
  );
}

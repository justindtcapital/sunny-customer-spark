import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronUp, Loader2, Maximize2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Contact } from "@/lib/types";
import { ownerMatches, type TeamProfile } from "@/lib/user-ownership";
import { fetchNetworkPyramid, saveNetworkTargets } from "@/utils/sheets.functions";
import {
  dotBreakdown, marketFor, movementKpis, primaryDomainFor, MARKETS, PRIMARY_DOMAINS, PYRAMID_TIERS, WINDOWS,
  type PyramidTier, type WindowKey,
} from "@/lib/network-pyramid";

export interface PyramidSelection { tier: PyramidTier; view: "domain" | "geo"; column: string }
type View = "kpis" | "domain" | "geo";

export function contactMatchesPyramid(c: Contact, sel: PyramidSelection): boolean {
  if (c.temperature !== sel.tier) return false;
  const col = sel.view === "domain" ? primaryDomainFor(c.primaryArea, c.areasOfInterest) : marketFor(c.location);
  return col === sel.column;
}

function Dots({ n, className }: { n: number; className?: string }) {
  const px = { 50: 18, 10: 10, 5: 7, 1: 4 } as const;
  return (
    <div className={cn("flex flex-wrap items-center gap-0.5", className)}>
      {dotBreakdown(n).flatMap(({ size, count }) =>
        Array.from({ length: Math.min(count, 12) }, (_, i) => (
          <span key={`${size}-${i}`} className="rounded-full bg-pyramid-dot ring-1 ring-pyramid-foreground/40" style={{ width: px[size], height: px[size] }} />
        )),
      )}
    </div>
  );
}

function MiniPyramid({ counts }: { counts: Record<PyramidTier, number | null> }) {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 50 40" className="h-7 w-9" aria-hidden>
        {PYRAMID_TIERS.map((t, i) => {
          const y = i * 8, w0 = (i / 5) * 50, w1 = ((i + 1) / 5) * 50;
          return <polygon key={t} className="fill-pyramid" points={`${25 - w0 / 2},${y + 0.6} ${25 + w0 / 2},${y + 0.6} ${25 + w1 / 2},${y + 7.4} ${25 - w1 / 2},${y + 7.4}`} />;
        })}
      </svg>
      <div className="flex gap-2 text-[11px] leading-tight">
        {PYRAMID_TIERS.map((t) => (
          <div key={t} className="text-center">
            <div className="font-semibold text-foreground">{counts[t] ?? "–"}</div>
            <div className="text-muted-foreground">{t === "Prospect" ? "Prosp." : t}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NetworkPyramid({
  contacts, profile, selection, onSelect, expanded, onExpandedChange: setExpanded,
}: {
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  contacts: Contact[];
  profile: TeamProfile | null;
  selection: PyramidSelection | null;
  onSelect: (s: PyramidSelection | null) => void;
}) {
  const [view, setView] = useState<View>("domain");
  const [scope, setScope] = useState<"mine" | "ours">("ours");
  const [win, setWin] = useState<WindowKey>("30d");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const save = useServerFn(saveNetworkTargets);
  const pyramidQuery = useQuery({ queryKey: ["network-pyramid"], queryFn: () => fetchNetworkPyramid(), enabled: expanded, staleTime: 5 * 60_000 });
  const data = pyramidQuery.data;

  const mine = scope === "mine" && profile;
  const people = useMemo(() => {
    const net = contacts.filter((c) => !mine || ownerMatches(c.prime, profile!)).map((c) => ({
      email: c.email, tier: c.temperature as PyramidTier, domain: primaryDomainFor(c.primaryArea, c.areasOfInterest), market: marketFor(c.location), dateAdded: c.dateAdded,
    }));
    const pros = (data?.prospects || []).filter((p) => !mine || ownerMatches(p.prime, profile!)).map((p) => ({
      email: p.email, tier: "Prospect" as PyramidTier, domain: primaryDomainFor("", p.areas), market: marketFor(p.location), dateAdded: p.dateAdded,
    }));
    return [...net, ...pros];
  }, [contacts, data, mine, profile]);

  const counts = useMemo(() => {
    const out = Object.fromEntries(PYRAMID_TIERS.map((t) => [t, 0])) as Record<PyramidTier, number | null>;
    for (const p of people) out[p.tier] = (out[p.tier] || 0) + 1;
    if (!data) out.Prospect = null;
    return out;
  }, [people, data]);

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
      <button type="button" onClick={() => setExpanded(true)} className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 hover:bg-accent" title="Open the Network Pyramid">
        <MiniPyramid counts={counts} />
        <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
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
  const ROW_H = 76;

  return (
    <section className="mb-6 rounded-lg border bg-card p-4" aria-label="Network Pyramid">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Network Pyramid</h2>
          {pyramidQuery.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {data?.error && <span className="text-xs text-destructive">{data.error}</span>}
        </div>
        <div className="flex items-center gap-1">
          {(["kpis", "domain", "geo"] as View[]).map((v) => (
            <Button key={v} size="sm" variant={view === v ? "default" : "outline"} className="h-7 text-xs" onClick={() => setView(v)}>
              {v === "kpis" ? "KPIs" : v === "domain" ? "Domain" : "Geo"}
            </Button>
          ))}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setExpanded(false)} title="Collapse"><ChevronUp className="h-4 w-4" /></Button>
        </div>
      </div>

      {view === "kpis" && (
        <div className="mb-2 flex items-center gap-1 text-xs">
          <span className="mr-1 text-muted-foreground">Movement window:</span>
          {(Object.keys(WINDOWS) as WindowKey[]).map((w) => (
            <Button key={w} size="sm" variant={win === w ? "secondary" : "ghost"} className="h-6 px-2 text-xs" onClick={() => setWin(w)}>
              {w === "30d" ? "30 days" : w === "6m" ? "6 months" : "12 months"}
            </Button>
          ))}
          <div className="ml-auto">
            {editing
              ? <><Button size="sm" className="h-6 text-xs" onClick={saveTargets}>Save targets</Button><Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditing(false)}>Cancel</Button></>
              : <Button size="sm" variant="outline" className="h-6 text-xs" disabled={!data} onClick={() => { setDraft({}); setEditing(true); }}>Edit targets</Button>}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="grid min-w-[760px]" style={{ gridTemplateColumns: `300px repeat(${view === "kpis" ? kpiCols.length : columns.length}, minmax(84px, 1fr))` }}>
          <div />
          {(view === "kpis" ? kpiCols : columns).map((c) => (
            <div key={c} className="border-l border-background bg-pyramid-grid px-2 py-1.5 text-center text-xs font-medium text-foreground">{c}</div>
          ))}
          {PYRAMID_TIERS.map((tier, i) => {
            const w0 = (i / 5) * 100, w1 = ((i + 1) / 5) * 100;
            const clip = `polygon(${50 - w0 / 2}% 0, ${50 + w0 / 2}% 0, ${50 + w1 / 2}% 100%, ${50 - w1 / 2}% 100%)`;
            const n = counts[tier];
            const k = kpis[tier];
            const target = data?.targets[tier];
            return (
              <div key={tier} className="contents">
                <div className="relative mt-1" style={{ height: ROW_H }}>
                  <div className="absolute inset-0 bg-pyramid" style={{ clipPath: clip }} />
                  <div className="relative flex h-full flex-col items-center justify-center text-pyramid-foreground">
                    {i > 0 && n !== null && <Dots n={n} className="max-w-[60%] justify-center" />}
                    <div className="text-lg font-bold leading-tight text-pyramid-figure">{n ?? (tier === "Prospect" ? "…" : 0)}</div>
                    <div className={cn("text-[11px]", i === 0 && "mt-6")}>{tier === "Prospect" ? "Prospects" : tier}</div>
                  </div>
                </div>
                {view === "kpis"
                  ? [
                      editing
                        ? <Input key="t" type="number" min={0} className="h-7 text-xs" value={draft[tier] ?? String(target ?? "")} onChange={(e) => setDraft((d) => ({ ...d, [tier]: e.target.value }))} />
                        : target ?? "—",
                      n ?? "…",
                      target !== undefined && n !== null ? Math.max(0, target - n) : "—",
                      k.added, k.removed, k.promotedIn, k.demotedOut,
                    ].map((v, j) => (
                      <div key={j} className="mt-1 flex items-center justify-center border-l border-background bg-pyramid-grid/60 px-2 text-sm font-semibold text-foreground">{v}</div>
                    ))
                  : columns.map((col) => {
                      const c = cellCount(tier, col);
                      const active = selection && selection.tier === tier && selection.column === col && selection.view === view;
                      const clickable = tier !== "Prospect" && c > 0;
                      return (
                        <button
                          key={col}
                          type="button"
                          disabled={!clickable}
                          onClick={() => onSelect(active ? null : { tier, view: view as "domain" | "geo", column: col })}
                          title={tier === "Prospect" ? "Prospects are listed on the Prospecting page" : `Show ${tier} · ${col}`}
                          className={cn(
                            "mt-1 flex flex-col justify-between border-l border-background bg-pyramid-grid/60 p-1.5 text-left",
                            clickable && "hover:bg-pyramid-grid",
                            active && "ring-2 ring-primary ring-inset",
                          )}
                        >
                          <Dots n={c} />
                          <span className="self-end text-sm font-semibold text-foreground">{c || ""}</span>
                        </button>
                      );
                    })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {view === "kpis" ? "Promotions and demotions are counted from the movement log; additions also use each person's date added." : "Click a cell to filter the list below. Prospects aren't filterable here."}
        </p>
        <div className="flex gap-1">
          <Button size="sm" variant={scope === "mine" ? "default" : "outline"} className="h-7 text-xs" disabled={!profile} onClick={() => setScope("mine")}>My Network</Button>
          <Button size="sm" variant={scope === "ours" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setScope("ours")}>Our Network</Button>
        </div>
      </div>
      {selection && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="rounded-full bg-accent px-2 py-0.5 text-accent-foreground">Showing {selection.tier} · {selection.column}</span>
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => onSelect(null)}><X className="mr-1 h-3 w-3" />Clear</Button>
        </div>
      )}
    </section>
  );
}

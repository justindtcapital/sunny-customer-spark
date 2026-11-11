import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { fetchAsanaPortcoData } from "@/utils/asana.functions";
import { fetchContacts, fetchTargets } from "@/utils/sheets.functions";
import { TierChart } from "@/components/crm/NetworkPyramid";
import { PYRAMID_TIERS, type PyramidTier } from "@/lib/network-pyramid";
import { buildMatrixPoints } from "@/lib/portco-matrix";
import { PortcoMatrix } from "@/components/dashboard/PortcoMatrix";
import { MonthlyEventBars, plannerDashboardQuery } from "@/components/dashboards/EventsDashboard";
import { EVENT_TYPES, monthlyByType } from "@/lib/events-dashboard";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/dashboards/")({
  head: () => ({
    meta: [
      { title: "Dashboards — VenturePulse" },
      { name: "description", content: "PortCo, Events and Network dashboards for the DTC team." },
      { property: "og:title", content: "Dashboards — VenturePulse" },
      { property: "og:description", content: "PortCo, Events and Network dashboards for the DTC team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardsHub,
});

function Tile({ to, title, sub, children }: { to: "/dashboards/portco" | "/dashboards/events" | "/dashboards/network"; title: string; sub: string; children: ReactNode }) {
  return (
    <Link to={to} className="group block">
      <Card className="border-border h-full transition-shadow group-hover:shadow-md">
        <CardContent className="p-5 flex flex-col h-full">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
          </div>
          <div className="mt-4 flex-1 flex items-center pointer-events-none select-none">{children}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

const Unavailable = ({ text }: { text: string }) => <p className="w-full text-center text-xs text-muted-foreground py-10">{text}</p>;

function DashboardsHub() {
  const { data: asana, isLoading: asanaLoading } = useQuery({ queryKey: ["asana-portco-data"], queryFn: () => fetchAsanaPortcoData(), staleTime: 60_000 });
  const { data: planner, isLoading: plannerLoading } = useQuery(plannerDashboardQuery);
  const { data: contacts, isLoading: contactsLoading } = useQuery({ queryKey: ["dashboards-contacts"], queryFn: () => fetchContacts(), staleTime: 5 * 60_000 });
  const points = useMemo(() => (asana ? buildMatrixPoints(asana.fieldsByCompanyName ?? {}, asana.namesByCompanyName ?? {}, {}, {}) : []), [asana]);
  const year = new Date().getFullYear();
  const rows = useMemo(() => monthlyByType(planner?.events ?? [], year), [planner, year]);
  const { data: targets } = useQuery({ queryKey: ["dashboards-targets"], queryFn: () => fetchTargets().catch(() => []), staleTime: 5 * 60_000 });
  const tierCounts = useMemo(() => {
    const counts = Object.fromEntries(PYRAMID_TIERS.map((t) => [t, 0])) as Record<PyramidTier, number | null>;
    for (const c of contacts ?? []) if (c.temperature in counts) counts[c.temperature as PyramidTier] = (counts[c.temperature as PyramidTier] || 0) + 1;
    counts.Prospect = targets ? targets.length : null;
    return counts;
  }, [contacts, targets]);
  const usedTypes = EVENT_TYPES.filter((t) => rows.some((r) => (r[t.name] as number) > 0));

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">Dashboards</h1>
        <p className="text-sm text-muted-foreground mt-1">Pick a dashboard to open it.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Tile to="/dashboards/portco" title="PortCo Dashboard" sub="Maturity, ownership and investment">
          {points.length ? (
            <div className="w-full max-h-64 overflow-hidden"><PortcoMatrix points={points} investor="" sector="" priority="" selectedKey={null} onSelect={() => {}} hideUnscored /></div>
          ) : <Unavailable text={asanaLoading ? "Loading…" : "PortCo data unavailable"} />}
        </Tile>
        <Tile to="/dashboards/events" title="Events Dashboard" sub={`Event intensity by month, ${year}`}>
          {planner && !planner.error ? <div className="w-full">
            <MonthlyEventBars rows={rows} month={null} compact />
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {usedTypes.map((t) => (
                <span key={t.name} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="h-2 w-2 rounded-sm" style={{ background: `var(--planner-${t.color})` }} />{t.name}
                </span>
              ))}
            </div>
          </div>
            : <Unavailable text={plannerLoading ? "Loading…" : "Event data unavailable"} />}
        </Tile>
        <Tile to="/dashboards/network" title="Network Dashboard" sub="Pyramid, outreach and campaigns">
          {contacts?.length ? (
            <div className="w-full [&_.network-tier-chart]:mx-auto [&_.network-tier-chart]:h-52 [&_.network-tier-chart]:pt-0">
              <TierChart counts={tierCounts} active={null} onTier={() => {}} />
            </div>
          ) : <Unavailable text={contactsLoading ? "Loading…" : "Network data unavailable"} />}
        </Tile>
      </div>
    </div>
  );
}

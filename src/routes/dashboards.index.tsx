import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { fetchAsanaPortcoData } from "@/utils/asana.functions";
import { fetchContacts } from "@/utils/sheets.functions";
import { buildMatrixPoints } from "@/lib/portco-matrix";
import { PortcoMatrix } from "@/components/dashboard/PortcoMatrix";
import { MonthlyEventBars, plannerDashboardQuery } from "@/components/dashboards/EventsDashboard";
import { monthlyByType } from "@/lib/events-dashboard";
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
  const tiers = useMemo(() => {
    const counts: Record<string, number> = { Council: 0, Hot: 0, Warm: 0, Cold: 0 };
    for (const c of contacts ?? []) if (c.temperature in counts) counts[c.temperature] += 1;
    return Object.entries(counts);
  }, [contacts]);
  const maxTier = Math.max(1, ...tiers.map(([, n]) => n));

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">Dashboards</h1>
        <p className="text-sm text-muted-foreground mt-1">Pick a dashboard to open it.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Tile to="/dashboards/portco" title="PortCo Dashboard" sub="Maturity, ownership and investment">
          {points.length ? (
            <div className="w-full"><PortcoMatrix points={points} investor="" sector="" priority="" selectedKey={null} onSelect={() => {}} /></div>
          ) : <Unavailable text={asanaLoading ? "Loading…" : "PortCo data unavailable"} />}
        </Tile>
        <Tile to="/dashboards/events" title="Events Dashboard" sub={`Event intensity by month, ${year}`}>
          {planner && !planner.error ? <div className="w-full"><MonthlyEventBars rows={rows} month={null} compact /></div>
            : <Unavailable text={plannerLoading ? "Loading…" : "Event data unavailable"} />}
        </Tile>
        <Tile to="/dashboards/network" title="Network Dashboard" sub="Pyramid, outreach and campaigns">
          {contacts?.length ? (
            <div className="w-full space-y-1.5">
              {tiers.map(([tier, n], i) => (
                <div key={tier} className="mx-auto flex items-center justify-center rounded-sm bg-primary/15 text-[11px] text-foreground py-1"
                  style={{ width: `${30 + i * 22}%`, opacity: 0.6 + (0.4 * n) / maxTier }}>
                  {tier} · {n}
                </div>
              ))}
            </div>
          ) : <Unavailable text={contactsLoading ? "Loading…" : "Network data unavailable"} />}
        </Tile>
      </div>
    </div>
  );
}

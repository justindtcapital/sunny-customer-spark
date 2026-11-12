import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { fetchAsanaPortcoData } from "@/utils/asana.functions";
import { fetchContacts, fetchTargets } from "@/utils/sheets.functions";
import { TierChart } from "@/components/crm/NetworkPyramid";
import { PYRAMID_TIERS, type PyramidTier } from "@/lib/network-pyramid";
import { buildMatrixPoints } from "@/lib/portco-matrix";
import { OwnershipMatrix } from "@/components/dashboard/OwnershipMatrix";
import { fetchPortfolioCompanies } from "@/utils/sheets.functions";
import { portCoKey } from "@/lib/portco-canonical";
import { matchSheetToAsanaKeys } from "@/lib/portco-names";
import { MonthlyEventBars, BroadLegend, plannerDashboardQuery } from "@/components/dashboards/EventsDashboard";
import { monthlyByBroad } from "@/lib/events-dashboard";
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

function Tile({ to, title, sub, children, className = "" }: { to: "/dashboards/portco" | "/dashboards/events" | "/dashboards/network"; title: string; sub: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={`group block ${className}`}>
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
  const { data: companies } = useQuery({ queryKey: ["dashboards-companies"], queryFn: () => fetchPortfolioCompanies().catch(() => []), staleTime: 5 * 60_000 });
  const points = useMemo(() => {
    if (!asana) return [];
    const fields = asana.fieldsByCompanyName ?? {};
    const names = asana.namesByCompanyName ?? {};
    // Same website matching as the PortCo page, so the tile shows real logos.
    const list = (companies ?? []).filter((p) => (p.name || "").trim());
    const toAsana = matchSheetToAsanaKeys(list.map((p) => p.name), Object.keys(fields), (k) => names[k] || k);
    const websites: Record<string, string> = {};
    for (const p of list) for (const k of [portCoKey(p.name || ""), toAsana.get(p.name) || ""]) if (k && p.website && !websites[k]) websites[k] = p.website;
    return buildMatrixPoints(fields, names, websites, {});
  }, [asana, companies]);
  const year = new Date().getFullYear();
  const rows = useMemo(() => monthlyByBroad(planner?.events ?? [], year, new Date().toISOString().slice(0, 10)), [planner, year]);
  const { data: targets } = useQuery({ queryKey: ["dashboards-targets"], queryFn: () => fetchTargets().catch(() => []), staleTime: 5 * 60_000 });
  const tierCounts = useMemo(() => {
    const counts = Object.fromEntries(PYRAMID_TIERS.map((t) => [t, 0])) as Record<PyramidTier, number | null>;
    for (const c of contacts ?? []) if (c.temperature in counts) counts[c.temperature as PyramidTier] = (counts[c.temperature as PyramidTier] || 0) + 1;
    counts.Prospect = targets ? targets.length : null;
    return counts;
  }, [contacts, targets]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">Dashboards</h1>
        <p className="text-sm text-muted-foreground mt-1">Pick a dashboard to open it.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Tile to="/dashboards/portco" title="PortCo Dashboard" sub="Ownership and investment" className="lg:col-span-2 lg:row-span-2">
          {points.length ? (
            <div className="w-full"><OwnershipMatrix points={points.filter((p) => p.investment != null && p.ownership != null)} selectedKey={null} onSelect={() => {}} compact /></div>
          ) : <Unavailable text={asanaLoading ? "Loading…" : "PortCo data unavailable"} />}
        </Tile>
        <Tile to="/dashboards/events" title="Events Dashboard" sub={`Event intensity by month, ${year}`}>
          {planner && !planner.error ? <div className="w-full">
            <MonthlyEventBars rows={rows} month={null} compact />
            <BroadLegend rows={rows} small />
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

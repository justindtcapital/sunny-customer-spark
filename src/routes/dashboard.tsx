import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Contact, PortfolioCompany, PortfolioEvent } from "@/lib/types";
import { fetchContacts, fetchPortfolioCompanies } from "@/utils/sheets.functions";
import {
  fetchAsanaPortcoData,
  refreshAsanaCacheFn,
} from "@/utils/asana.functions";
import {
  buildMatrixPoints,
  cleanPriority,
  matrixInvestors,
  matrixPriorities,
  matrixSectors,
} from "@/lib/portco-matrix";
import { PortcoMatrix } from "@/components/dashboard/PortcoMatrix";
import { MatrixStatsPanel } from "@/components/dashboard/MatrixStatsPanel";
import { ActivityCharts } from "@/components/dashboard/ActivityCharts";
import { WorkstreamSummary } from "@/components/dashboard/WorkstreamSummary";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { computeScopeActivity } from "@/lib/dashboard-activity";

import { portCoKey } from "@/lib/portco-canonical";
import { PortfolioDetail } from "@/components/portfolio/PortfolioDetail";
import { extractDomain } from "@/lib/domain-utils";
import { normalizeFocusArea } from "@/lib/focus-area-utils";
import { matchSheetToAsanaKeys } from "@/lib/portco-names";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

const EMPTY_FIELDS: Record<string, Record<string, string>> = {};
const EMPTY_NAMES: Record<string, string> = {};
const EMPTY_EVENTS: Record<string, PortfolioEvent[]> = {};

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — VenturePulse" },
      { name: "description", content: "PortCo prioritization by sales and GTM maturity" },
      { property: "og:title", content: "Dashboard — VenturePulse" },
      {
        property: "og:description",
        content: "PortCo prioritization by sales and GTM maturity",
      },
    ],
  }),
  loader: async () => {
    const withTimeout = <T,>(p: Promise<T>, fallback: T, ms = 5000): Promise<T> =>
      Promise.race([
        p.catch(() => fallback),
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
      ]);

    // Asana is fetched on the client (see useQuery below) so a slow Asana call
    // can never hang the server render and abort the request.
    const [contacts, portfolio] = await Promise.all([
      withTimeout<Contact[]>(fetchContacts(), []),
      withTimeout<PortfolioCompany[]>(fetchPortfolioCompanies(), []),
    ]);

    return { contacts, companies: portfolio || [] };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { contacts, companies } = Route.useLoaderData();
  const fetchAsana = useServerFn(fetchAsanaPortcoData);
  const { data: asana } = useQuery({
    queryKey: ["asana-portco-data"],
    queryFn: () => fetchAsana(),
    staleTime: 60_000,
  });

  const asanaFieldsByPortco = asana?.fieldsByCompanyName ?? EMPTY_FIELDS;
  const portcoNames = asana?.namesByCompanyName ?? EMPTY_NAMES;
  const eventsByPortco = (asana?.eventsByCompanyName ?? EMPTY_EVENTS) as Record<
    string,
    PortfolioEvent[]
  >;

  // Asana keys and sheet names disagree ("VAST" vs "VAST Data"), so match fuzzily
  // before attaching websites / domains — otherwise logos fall back to a guess.
  const { websiteByPortco, sectorByPortco } = useMemo(() => {
    const sheetList = (companies || []).filter((p) => (p.name || "").trim());
    const sheetToAsana = matchSheetToAsanaKeys(
      sheetList.map((p) => p.name),
      Object.keys(asanaFieldsByPortco),
      (k) => portcoNames[k] || k,
    );
    const websites: Record<string, string> = {};
    const sectors: Record<string, string> = {};
    for (const p of sheetList) {
      const dom = p.domain || normalizeFocusArea(p.sector);
      for (const key of [portCoKey(p.name || ""), sheetToAsana.get(p.name) || ""]) {
        if (!key) continue;
        if (p.website && !websites[key]) websites[key] = p.website;
        if (dom && !sectors[key]) sectors[key] = dom;
      }
    }
    return { websiteByPortco: websites, sectorByPortco: sectors };
  }, [companies, asanaFieldsByPortco, portcoNames]);
  const [investor, setInvestor] = useState("");
  const [sector, setSector] = useState("");
  const [priority, setPriority] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const refreshAsana = useServerFn(refreshAsanaCacheFn);

  const detailCompany = useMemo(
    () => (detailKey ? companies.find((c) => portCoKey(c.name || "") === detailKey) : undefined),
    [detailKey, companies],
  );
  const detailContacts = useMemo(() => {
    const d = detailCompany ? extractDomain(detailCompany.website) : "";
    if (!d) return [];
    return contacts.filter((c) => extractDomain(c.email) === d);
  }, [detailCompany, contacts]);
  const detailIntros = useMemo(() => {
    const name = (detailCompany?.name || "").trim().toLowerCase();
    if (!name) return [];
    return contacts.filter((c) =>
      (c.portCoIntros || []).some((p) => p.trim().toLowerCase() === name),
    );
  }, [detailCompany, contacts]);

  const points = useMemo(
    () =>
      buildMatrixPoints(asanaFieldsByPortco, portcoNames, websiteByPortco, sectorByPortco),
    [asanaFieldsByPortco, portcoNames, websiteByPortco, sectorByPortco],
  );
  const investors = useMemo(() => matrixInvestors(points), [points]);
  const sectors = useMemo(() => matrixSectors(points), [points]);
  const priorities = useMemo(() => matrixPriorities(points), [points]);
  const inFilter = (p: (typeof points)[number]) =>
    (!investor || p.investor === investor) &&
    (!sector || p.sectors.includes(sector)) &&
    (!priority || cleanPriority(p.priority) === priority);

  const selected = selectedKey ? points.find((p) => p.key === selectedKey) : undefined;
  const filtered = points.filter(inFilter);
  const scope = selected ? [selected] : filtered;
  const scopeKind = selected ? "company" : investor || sector || priority ? "investor" : "all";
  const scopeLabel = selected
    ? selected.name
    : [investor, sector, priority].filter(Boolean).join(" · ") || "Entire portfolio";

  const activity = useMemo(
    () => computeScopeActivity(new Set(scope.map((p) => p.key)), contacts, eventsByPortco),
    [scope, contacts, eventsByPortco],
  );
  const scopeKeys = useMemo(() => scope.map((p) => p.key), [scope]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Where each portfolio company sits on sales and go-to-market maturity, sized by
            investment. Click a company for its own numbers.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            try {
              await refreshAsana();
              await queryClient.invalidateQueries({ queryKey: ["asana-portco-data"] });
              await router.invalidate();
            } finally {
              setRefreshing(false);
            }
          }}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh Asana data"}
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h2 className="font-display text-sm font-semibold text-foreground">
                PortCo Prioritization: Sales Maturity / GTM Maturity / Investment
              </h2>
              <div className="flex items-center gap-2 shrink-0">
                <Select
                  value={investor || "all"}
                  onValueChange={(v) => {
                    setInvestor(v === "all" ? "" : v);
                    setSelectedKey(null);
                  }}
                >
                  <SelectTrigger className="h-8 w-36 text-xs bg-card">
                    <SelectValue placeholder="All investors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All investors</SelectItem>
                    {investors.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={sector || "all"}
                  onValueChange={(v) => {
                    setSector(v === "all" ? "" : v);
                    setSelectedKey(null);
                  }}
                >
                  <SelectTrigger className="h-8 w-36 text-xs bg-card">
                    <SelectValue placeholder="All domains" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All domains</SelectItem>
                    {sectors.map((sc) => (
                      <SelectItem key={sc} value={sc}>
                        {sc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={priority || "all"}
                  onValueChange={(v) => {
                    setPriority(v === "all" ? "" : v);
                    setSelectedKey(null);
                  }}
                >
                  <SelectTrigger className="h-8 w-36 text-xs bg-card">
                    <SelectValue placeholder="All priorities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All priorities</SelectItem>
                    {priorities.map((pr) => (
                      <SelectItem key={pr} value={pr}>
                        {pr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {points.length === 0 ? (
              <p className="text-sm text-muted-foreground py-16 text-center">
                No portfolio companies came back from Asana.
              </p>
            ) : (
              <PortcoMatrix
                points={points}
                investor={investor}
                sector={sector}
                priority={priority}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
              />
            )}
          </CardContent>
        </Card>

        <MatrixStatsPanel
          scope={scope}
          scopeLabel={scopeLabel}
          scopeKind={scopeKind}
          contacts={contacts}
          eventsByPortco={eventsByPortco}
          onOpenCompany={setDetailKey}
        />
      </div>

      <ActivityCharts monthly={activity.monthly} scopeLabel={scopeLabel} />

      {scopeKind === "company" && (
        <>
          <WorkstreamSummary keys={scopeKeys} scopeLabel={scopeLabel} showCompany={false} />
          <ActivityFeed
            keys={scopeKeys}
            scopeLabel={scopeLabel}
            showCompany={false}
            allScope={false}
          />
        </>
      )}

      <PortfolioDetail
        company={detailCompany ?? null}
        open={!!detailCompany}
        onOpenChange={(o) => {
          if (!o) setDetailKey(null);
        }}
        crmContacts={detailContacts}
        crmIntros={detailIntros}
      />
    </div>
  );
}


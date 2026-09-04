import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { Contact, PortfolioCompany, PortfolioEvent } from "@/lib/types";
import { fetchContacts, fetchPortfolioCompanies } from "@/utils/sheets.functions";
import { fetchAsanaPortcoData, type AsanaPortcoData } from "@/utils/asana.functions";
import { buildMatrixPoints, matrixInvestors, matrixSectors } from "@/lib/portco-matrix";
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
    const withTimeout = <T,>(p: Promise<T>, fallback: T, ms = 8000): Promise<T> =>
      Promise.race([
        p.catch(() => fallback),
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
      ]);

    const [contacts, asana, portfolio] = await Promise.all([
      withTimeout<Contact[]>(fetchContacts(), []),
      withTimeout<AsanaPortcoData>(fetchAsanaPortcoData(), {
        fieldsByCompanyName: {},
        namesByCompanyName: {},
        eventsByCompanyName: {},
      }),
      withTimeout<PortfolioCompany[]>(fetchPortfolioCompanies(), []),
    ]);


    // Asana keys and sheet names disagree ("VAST" vs "VAST Data"), so match fuzzily
    // before attaching websites / domains — otherwise logos fall back to a guess.
    const sheetList = (portfolio || []).filter((p) => (p.name || "").trim());
    const asanaKeys = Object.keys(asana.fieldsByCompanyName || {});
    const sheetToAsana = matchSheetToAsanaKeys(
      sheetList.map((p) => p.name),
      asanaKeys,
      (k) => asana.namesByCompanyName[k] || k,
    );

    const websiteByPortco: Record<string, string> = {};
    const sectorByPortco: Record<string, string> = {};
    for (const p of sheetList) {
      const dom = p.domain || normalizeFocusArea(p.sector);
      for (const key of [portCoKey(p.name || ""), sheetToAsana.get(p.name) || ""]) {
        if (!key) continue;
        if (p.website && !websiteByPortco[key]) websiteByPortco[key] = p.website;
        if (dom && !sectorByPortco[key]) sectorByPortco[key] = dom;
      }
    }

    return {
      contacts,
      asanaFieldsByPortco: asana.fieldsByCompanyName,
      portcoNames: asana.namesByCompanyName,
      eventsByPortco: asana.eventsByCompanyName as Record<string, PortfolioEvent[]>,
      websiteByPortco,
      sectorByPortco,
      companies: portfolio || [],
    };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const {
    contacts,
    asanaFieldsByPortco,
    portcoNames,
    eventsByPortco,
    websiteByPortco,
    sectorByPortco,
    companies,
  } = Route.useLoaderData();
  const [investor, setInvestor] = useState("");
  const [sector, setSector] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);

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
  const inFilter = (p: (typeof points)[number]) =>
    (!investor || p.investor === investor) && (!sector || p.sectors.includes(sector));

  const selected = selectedKey ? points.find((p) => p.key === selectedKey) : undefined;
  const filtered = points.filter(inFilter);
  const scope = selected ? [selected] : filtered;
  const scopeKind = selected ? "company" : investor || sector ? "investor" : "all";
  const scopeLabel = selected
    ? selected.name
    : [investor, sector].filter(Boolean).join(" · ") || "Entire portfolio";

  const activity = useMemo(
    () => computeScopeActivity(new Set(scope.map((p) => p.key)), contacts, eventsByPortco),
    [scope, contacts, eventsByPortco],
  );
  const scopeKeys = useMemo(() => scope.map((p) => p.key), [scope]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Where each portfolio company sits on sales and go-to-market maturity, sized by
          investment. Click a company for its own numbers.
        </p>
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
                  <SelectTrigger className="h-8 w-44 text-xs bg-card">
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
                  <SelectTrigger className="h-8 w-44 text-xs bg-card">
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


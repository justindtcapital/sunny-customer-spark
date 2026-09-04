import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { Contact, PortfolioCompany, PortfolioEvent } from "@/lib/types";
import { fetchContacts, fetchPortfolioCompanies } from "@/utils/sheets.functions";
import { fetchAsanaPortcoData, type AsanaPortcoData } from "@/utils/asana.functions";
import { buildMatrixPoints, matrixInvestors } from "@/lib/portco-matrix";
import { PortcoMatrix } from "@/components/dashboard/PortcoMatrix";
import { MatrixStatsPanel } from "@/components/dashboard/MatrixStatsPanel";
import { ActivityCharts } from "@/components/dashboard/ActivityCharts";
import { WorkstreamSummary } from "@/components/dashboard/WorkstreamSummary";
import { computeScopeActivity } from "@/lib/dashboard-activity";

import { portCoKey } from "@/lib/portco-canonical";
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


    const websiteByPortco: Record<string, string> = {};
    for (const p of portfolio || []) {
      const key = portCoKey(p.name || "");
      if (key && p.website) websiteByPortco[key] = p.website;
    }

    return {
      contacts,
      asanaFieldsByPortco: asana.fieldsByCompanyName,
      portcoNames: asana.namesByCompanyName,
      eventsByPortco: asana.eventsByCompanyName as Record<string, PortfolioEvent[]>,
      websiteByPortco,
    };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { contacts, asanaFieldsByPortco, portcoNames, eventsByPortco, websiteByPortco } =
    Route.useLoaderData();
  const [investor, setInvestor] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const points = useMemo(
    () => buildMatrixPoints(asanaFieldsByPortco, portcoNames, websiteByPortco),
    [asanaFieldsByPortco, portcoNames, websiteByPortco],
  );
  const investors = useMemo(() => matrixInvestors(points), [points]);

  const selected = selectedKey ? points.find((p) => p.key === selectedKey) : undefined;
  const scope = selected
    ? [selected]
    : investor
      ? points.filter((p) => p.investor === investor)
      : points;
  const scopeKind = selected ? "company" : investor ? "investor" : "all";
  const scopeLabel = selected ? selected.name : investor || "Entire portfolio";

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
          <CardContent className="p-4 relative">
            <div className="absolute right-4 top-4 z-10 w-52">
              <Select
                value={investor || "all"}
                onValueChange={(v) => {
                  setInvestor(v === "all" ? "" : v);
                  setSelectedKey(null);
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-card">
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
            </div>
            {points.length === 0 ? (
              <p className="text-sm text-muted-foreground py-16 text-center">
                No portfolio companies came back from Asana.
              </p>
            ) : (
              <PortcoMatrix
                points={points}
                investor={investor}
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
        />
      </div>

      <ActivityCharts monthly={activity.monthly} scopeLabel={scopeLabel} />

      {scopeKind !== "all" && (
        <WorkstreamSummary
          keys={scopeKeys}
          scopeLabel={scopeLabel}
          showCompany={scopeKind === "investor"}
        />
      )}
    </div>
  );
}


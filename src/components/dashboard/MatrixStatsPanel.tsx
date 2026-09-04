import { useMemo } from "react";
import type { Contact, PortfolioEvent } from "@/lib/types";
import type { MatrixPoint } from "@/lib/portco-matrix";
import { computeScopeActivity, type Windowed } from "@/lib/dashboard-activity";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  /** Companies in the current scope (all / investor / one company). */
  scope: MatrixPoint[];
  scopeLabel: string;
  scopeKind: "all" | "investor" | "company";
  contacts: Contact[];
  eventsByPortco: Record<string, PortfolioEvent[]>;
}


function money(m: number): string {
  if (m >= 1000) return `$${(m / 1000).toFixed(1)}B`;
  return `$${m.toFixed(m >= 10 ? 0 : 1)}M`;
}
function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-semibold tabular-nums text-foreground leading-tight mt-0.5">
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function TrailingRow({ label, w }: { label: string; w: Windowed }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-baseline">
      <span className="text-xs text-muted-foreground truncate">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground w-10 text-right">
        {w.t90}
      </span>
      <span className="text-sm font-semibold tabular-nums text-foreground w-10 text-right">
        {w.ttm}
      </span>
      <span className="text-sm tabular-nums text-muted-foreground w-10 text-right">
        {w.all}
      </span>
    </div>
  );
}

export function MatrixStatsPanel({
  scope,
  scopeLabel,
  scopeKind,
  contacts,
  eventsByPortco,
}: Props) {
  const stats = useMemo(() => {
    const keys = new Set(scope.map((p) => p.key));

    const invested = scope.reduce((s, p) => s + (p.investment ?? 0), 0);
    const owns = scope.map((p) => p.ownership).filter((v): v is number => v !== null);
    const avgOwn = owns.length ? owns.reduce((a, b) => a + b, 0) / owns.length : null;

    const salesScores = scope.map((p) => p.sales).filter((v): v is number => v !== null);
    const gtmScores = scope.map((p) => p.gtm).filter((v): v is number => v !== null);
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

    const activity = computeScopeActivity(keys, contacts, eventsByPortco);

    return {
      companies: scope.length,
      invested,
      avgOwn,
      activity,
      avgSales: avg(salesScores),
      avgGtm: avg(gtmScores),
    };
  }, [scope, contacts, eventsByPortco]);

  const single = scopeKind === "company" ? scope[0] : undefined;
  const a = stats.activity;

  return (
    <Card className="border-border h-full">
      <CardContent className="p-5 space-y-5">
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            {scopeKind === "all"
              ? "All portfolio companies"
              : scopeKind === "investor"
                ? "Lead investor"
                : "Portfolio company"}
          </p>
          <h2 className="font-display text-lg font-semibold text-foreground mt-0.5">
            {scopeLabel}
          </h2>
        </div>

        {/* Investment block */}
        <div className="grid grid-cols-2 gap-4 pb-4 border-b border-border">
          <Stat label="Invested" value={money(stats.invested)} />
          <Stat
            label={scopeKind === "company" ? "Ownership" : "Avg ownership"}
            value={stats.avgOwn === null ? "—" : pct(stats.avgOwn)}
          />
          {scopeKind !== "company" && (
            <Stat label="Companies" value={String(stats.companies)} />
          )}
          <Stat
            label="Avg maturity"
            value={
              stats.avgSales === null && stats.avgGtm === null
                ? "—"
                : `${stats.avgSales?.toFixed(1) ?? "—"} / ${stats.avgGtm?.toFixed(1) ?? "—"}`
            }
            sub="sales / GTM"
          />
        </div>

        {/* Relationship block — trailing windows */}
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Activity
            </span>
            {["90d", "12mo", "All"].map((h) => (
              <span
                key={h}
                className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground w-10 text-right"
              >
                {h}
              </span>
            ))}
          </div>
          <TrailingRow label="Introductions" w={a.introductions} />
          <TrailingRow label="Connections" w={a.connections} />
          <TrailingRow label="Interactions" w={a.interactions} />
          <TrailingRow label="Events" w={a.events} />
        </div>

        {single && (
          <div className="pt-4 border-t border-border space-y-2">
            {[
              ["Lead investor", single.investor],
              ["Stage", single.stage],
              ["DTC priority", single.priority],
              ["Sales maturity", single.salesLabel],
              ["GTM maturity", single.gtmLabel],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="text-foreground text-right font-medium">{value || "—"}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


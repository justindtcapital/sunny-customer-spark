import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import type { MonthlyPoint } from "@/lib/dashboard-activity";

interface Props {
  monthly: MonthlyPoint[];
  scopeLabel: string;
}

const SERIES: { key: keyof MonthlyPoint; label: string; color: string }[] = [
  { key: "introductions", label: "Introductions", color: "oklch(0.62 0.14 300)" },
  { key: "connections", label: "New connections", color: "oklch(0.68 0.15 128)" },
  { key: "interactions", label: "Interactions", color: "oklch(0.65 0.15 250)" },
  { key: "events", label: "Events", color: "oklch(0.7 0.16 60)" },
];

function MiniChart({
  data,
  dataKey,
  label,
  color,
}: {
  data: MonthlyPoint[];
  dataKey: string;
  label: string;
  color: string;
}) {
  const total = useMemo(
    () => data.reduce((s, d) => s + ((d[dataKey as keyof MonthlyPoint] as number) || 0), 0),
    [data, dataKey],
  );

  return (
    <Card className="border-border">
      <CardContent className="p-3">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            {label}
          </p>
          <p className="text-sm font-semibold tabular-nums text-foreground">{total}</p>
        </div>
        <div className="h-[110px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 2, left: -22, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                interval={1}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={34}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
              />
              <Bar dataKey={dataKey} radius={[3, 3, 0, 0]} fill={color}>
                {data.map((d) => (
                  <Cell key={d.month} fill={color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function ActivityCharts({ monthly, scopeLabel }: Props) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-sm font-semibold text-foreground">
          Activity — last 12 months
        </h2>
        <p className="text-xs text-muted-foreground">{scopeLabel}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {SERIES.map((s) => (
          <MiniChart
            key={s.key}
            data={monthly}
            dataKey={String(s.key)}
            label={s.label}
            color={s.color}
          />
        ))}
      </div>
    </section>
  );
}

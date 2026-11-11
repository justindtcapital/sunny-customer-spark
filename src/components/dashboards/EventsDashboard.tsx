import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Maximize2 } from "lucide-react";
import { fetchPlannerFn } from "@/utils/event-planner.functions";
import { EVENT_TYPES, MONTH_LABELS, eventBreakdowns, eventYears, eventsInScope, monthlyByType, type Bar as BarRow } from "@/lib/events-dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const plannerDashboardQuery = { queryKey: ["home-planner"], queryFn: () => fetchPlannerFn(), staleTime: 5 * 60_000 };

const typeColor = (name: string) => `var(--planner-${EVENT_TYPES.find((t) => t.name === name)?.color ?? "slate"})`;

/** 12-month stacked bars by event type; clicking a month selects it. */
export function MonthlyEventBars({ rows, month, onMonth, compact = false }: {
  rows: ReturnType<typeof monthlyByType>; month: number | null; onMonth?: (m: number | null) => void; compact?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={compact ? 120 : 260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: compact ? -30 : -10, bottom: 0 }}
        onClick={(s) => { if (!onMonth || s?.activeTooltipIndex == null) return; const i = Number(s.activeTooltipIndex); onMonth(month === i ? null : i); }}>
        {!compact && <CartesianGrid vertical={false} stroke="var(--border)" />}
        <XAxis dataKey="month" tick={{ fontSize: compact ? 9 : 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: compact ? 9 : 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} hide={compact} />
        {!compact && <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />}
        {EVENT_TYPES.map((t) => (
          <Bar key={t.name} dataKey={t.name} stackId="m" fill={typeColor(t.name)} className={onMonth ? "cursor-pointer" : undefined}>
            {rows.map((r) => <Cell key={r.month} fillOpacity={month == null || month === r.index ? 1 : 0.25} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function BreakdownCard({ title, bars, colorFor, onExpand, limit = 8 }: {
  title: string; bars: BarRow[]; colorFor?: (label: string) => string; onExpand: () => void; limit?: number;
}) {
  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-sm font-semibold text-foreground">{title}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onExpand} aria-label={`Expand ${title}`}>
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <BarList bars={bars.slice(0, limit)} colorFor={colorFor} />
        {bars.length > limit && <p className="text-[11px] text-muted-foreground mt-2">+{bars.length - limit} more — expand to see all</p>}
      </CardContent>
    </Card>
  );
}

function BarList({ bars, colorFor }: { bars: BarRow[]; colorFor?: (label: string) => string }) {
  if (!bars.length) return <p className="text-xs text-muted-foreground py-6 text-center">No events in this period.</p>;
  const max = Math.max(...bars.map((b) => b.value));
  return (
    <ul className="space-y-1.5">
      {bars.map((b) => (
        <li key={b.label} className="grid grid-cols-[minmax(0,10rem)_1fr_2rem] items-center gap-2 text-xs">
          <span className="truncate text-foreground" title={b.label}>{b.label}</span>
          <span className="h-2.5 rounded-sm bg-muted overflow-hidden">
            <span className="block h-full rounded-sm" style={{ width: `${(b.value / max) * 100}%`, background: colorFor?.(b.label) ?? "var(--primary)" }} />
          </span>
          <span className="text-right tabular-nums text-muted-foreground">{b.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function EventsDashboard() {
  const { data, isLoading } = useQuery(plannerDashboardQuery);
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const events = data?.events ?? [];
  const rows = useMemo(() => monthlyByType(events, year), [events, year]);
  const scoped = useMemo(() => eventsInScope(events, year, month), [events, year, month]);
  const b = useMemo(() => eventBreakdowns(scoped, data?.attendees ?? []), [scoped, data?.attendees]);
  const years = useMemo(() => eventYears(events, thisYear), [events, thisYear]);
  const cards: { id: string; title: string; bars: BarRow[]; colorFor?: (l: string) => string }[] = [
    { id: "attendees", title: "Attendees per event", bars: b.attendeesPerEvent },
    { id: "portco", title: "Events per PortCo", bars: b.perPortco },
    { id: "domain", title: "Events per domain", bars: b.perDomain },
    { id: "city", title: "Events per city", bars: b.perCity },
    { id: "type", title: "Events per type", bars: b.perType, colorFor: typeColor },
  ];
  const open = cards.find((c) => c.id === expanded);
  const usedTypes = EVENT_TYPES.filter((t) => rows.some((r) => (r[t.name] as number) > 0));

  if (data?.error) return <p className="text-sm text-muted-foreground">Event data is unavailable right now.</p>;
  return (
    <div className="space-y-5">
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-foreground">Events by month</h2>
              <p className="text-xs text-muted-foreground">
                {isLoading ? "Loading…" : `${scoped.length} events · ${month == null ? `all of ${year}` : `${MONTH_LABELS[month]} ${year}`} — click a month to focus the charts below`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {month != null && <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setMonth(null)}>Whole year</Button>}
              <Select value={String(year)} onValueChange={(v) => { setYear(Number(v)); setMonth(null); }}>
                <SelectTrigger className="h-8 w-24 text-xs bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <MonthlyEventBars rows={rows} month={month} onMonth={setMonth} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {usedTypes.map((t) => (
              <span key={t.name} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: typeColor(t.name) }} />{t.name}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((c) => <BreakdownCard key={c.id} title={c.title} bars={c.bars} colorFor={c.colorFor} onExpand={() => setExpanded(c.id)} />)}
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setExpanded(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{open?.title} · {month == null ? year : `${MONTH_LABELS[month]} ${year}`}</DialogTitle></DialogHeader>
          {open && <BarList bars={open.bars} colorFor={open.colorFor} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

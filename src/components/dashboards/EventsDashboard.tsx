import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Maximize2 } from "lucide-react";
import { fetchPlannerFn } from "@/utils/event-planner.functions";
import { EVENT_TYPES, eventTypesFor, MONTH_LABELS, eventBreakdowns, eventYears, eventsInScope, monthlyByType, type Bar as BarRow } from "@/lib/events-dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VicChartBuilder } from "@/components/dashboards/VicCharts";
import { eventChartRecords } from "@/lib/events-dashboard";
import { PLANNER_STATUSES, type PlannerStatus } from "@/lib/event-planner";
import { Checkbox } from "@/components/ui/checkbox";

/** Event Planner statuses as the dashboard names them (Potential reads "Planned"). */
const STATUS_LABEL: Record<PlannerStatus, string> = { Confirmed: "Confirmed", Potential: "Planned", Declined: "Declined" };

export const plannerDashboardQuery = { queryKey: ["home-planner"], queryFn: () => fetchPlannerFn(), staleTime: 5 * 60_000 };

const typeColor = (name: string, types = EVENT_TYPES) => `var(--planner-${types.find((t) => t.name === name)?.color ?? "slate"})`;

/** 12-month stacked bars by event type; clicking a month selects it. */
export function MonthlyEventBars({ rows, month, onMonth, compact = false, types = EVENT_TYPES }: {
  rows: ReturnType<typeof monthlyByType>; month: number | null; onMonth?: (m: number | null) => void; compact?: boolean; types?: typeof EVENT_TYPES;
}) {
  return (
    <ResponsiveContainer width="100%" height={compact ? 120 : 260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: compact ? -30 : -10, bottom: 0 }}
        onClick={(s) => { if (!onMonth || s?.activeTooltipIndex == null) return; const i = Number(s.activeTooltipIndex); onMonth(month === i ? null : i); }}>
        {!compact && <CartesianGrid vertical={false} stroke="var(--border)" />}
        <XAxis dataKey="month" tick={{ fontSize: compact ? 9 : 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: compact ? 9 : 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} hide={compact} />
        {!compact && <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />}
        {types.map((t) => (
          <Bar key={t.name} dataKey={t.name} stackId="m" fill={typeColor(t.name, types)} className={onMonth ? "cursor-pointer" : undefined}>
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
  const [statuses, setStatuses] = useState<PlannerStatus[]>(PLANNER_STATUSES);
  const toggleStatus = (st: PlannerStatus) => setStatuses((cur) => (cur.includes(st) ? cur.filter((x) => x !== st) : [...cur, st]));
  const events = useMemo(() => (data?.events ?? []).filter((e) => statuses.includes(e.status)), [data?.events, statuses]);
  const types = useMemo(() => eventTypesFor(data?.partnerCategories ?? []), [data?.partnerCategories]);
  const colorOf = (name: string) => typeColor(name, types);
  const rows = useMemo(() => monthlyByType(events, year, types), [events, year, types]);
  const scoped = useMemo(() => eventsInScope(events, year, month), [events, year, month]);
  const b = useMemo(() => eventBreakdowns(scoped, data?.attendees ?? [], types), [scoped, data?.attendees, types]);
  const years = useMemo(() => eventYears(events, thisYear), [events, thisYear]);
  const cards: { id: string; title: string; bars: BarRow[]; colorFor?: (l: string) => string }[] = [
    { id: "attendees", title: "Attendees per event", bars: b.attendeesPerEvent },
    { id: "portco", title: "Events per PortCo", bars: b.perPortco },
    { id: "domain", title: "Events per domain", bars: b.perDomain },
    { id: "city", title: "Events per city", bars: b.perCity },
    { id: "type", title: "Events per type", bars: b.perType, colorFor: colorOf },
  ];
  const open = cards.find((c) => c.id === expanded);
  const chartRecords = useMemo(() => ({ events: eventChartRecords(events, data?.attendees ?? [], types) }), [events, data?.attendees, types]);
  const usedTypes = types.filter((t) => rows.some((r) => (r[t.name] as number) > 0));

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
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3" aria-label="Event status">
                {PLANNER_STATUSES.map((st) => (
                  <label key={st} className="inline-flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                    <Checkbox checked={statuses.includes(st)} onCheckedChange={() => toggleStatus(st)} aria-label={`Show ${STATUS_LABEL[st]} events`} />
                    {STATUS_LABEL[st]}
                  </label>
                ))}
              </div>
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
      <VicChartBuilder dashboard="events" records={chartRecords} loading={isLoading}
        colorFor={(s) => (types.some((t) => t.name === s) ? colorOf(s) : undefined)} />
    </div>
  );
}

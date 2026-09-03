import { useMemo, useState } from "react";
import type { Contact, PortfolioCompany, PortfolioEvent } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ArrowLeft, Calendar, GitBranch, Landmark, Loader2, Users } from "lucide-react";
import { useAsanaActivities } from "@/lib/use-activities";
import { useWorkstreams } from "@/lib/use-workstreams";
import { matchActivitiesToCompany } from "@/lib/activity-match";
import { WorkstreamGroups } from "@/components/portfolio/WorkstreamsPanel";

export interface InvestorPortcoInput {
  key: string;
  name: string;
  events: PortfolioEvent[];
}

/** Asana field names worth surfacing on an investor's company row. */
const DETAIL_FIELDS = [
  "Ownership",
  "DTC Ownership",
  "Investment",
  "DTC Investment",
  "Company Stage",
  "DTC Priority",
  "Lead Investor",
  "Valuation",
];

function fieldValue(fields: Record<string, string> | undefined, label: string): string {
  if (!fields) return "";
  for (const [k, v] of Object.entries(fields)) {
    if (k.trim().toLowerCase() === label.toLowerCase()) return v;
  }
  return "";
}

function monthKeyOf(date?: string): string {
  const ms = Date.parse(date || "");
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export function InvestorDashboard({
  investor,
  portcos,
  contacts,
  portfolioCompanies,
  asanaFieldsByPortco,
  onBack,
  onContactClick,
}: {
  investor: string;
  portcos: InvestorPortcoInput[];
  contacts: Contact[];
  portfolioCompanies: PortfolioCompany[];
  /** Asana custom fields keyed by canonical portfolio-company key. */
  asanaFieldsByPortco?: Record<string, Record<string, string>>;
  onBack: () => void;
  onContactClick?: (c: Contact) => void;
}) {
  const { activities, loading: activitiesLoading } = useAsanaActivities();
  const { workstreams, loading: workstreamsLoading } = useWorkstreams();
  const [logCompany, setLogCompany] = useState<string>("all");

  const portcoKeys = useMemo(() => new Set(portcos.map((p) => p.key)), [portcos]);
  const portcoNames = useMemo(() => portcos.map((p) => p.name), [portcos]);

  const sheetByKey = useMemo(() => {
    const m = new Map<string, PortfolioCompany>();
    for (const p of portfolioCompanies) m.set((p.name || "").trim().toLowerCase(), p);
    return m;
  }, [portfolioCompanies]);

  // Introductions: contacts tied to any of this investor's portfolio companies.
  const intros = useMemo(() => {
    const rows: { contact: Contact; portco: string; date: string }[] = [];
    for (const c of contacts) {
      for (const eng of c.portCoEngagements || []) {
        const k = (eng.portco || "").trim().toLowerCase();
        if (portcoKeys.has(k)) rows.push({ contact: c, portco: eng.portco, date: eng.date || "" });
      }
      const seen = new Set((c.portCoEngagements || []).map((e) => (e.portco || "").toLowerCase()));
      for (const name of c.portCoIntros || []) {
        const k = name.trim().toLowerCase();
        if (portcoKeys.has(k) && !seen.has(k)) rows.push({ contact: c, portco: name, date: "" });
      }
    }
    return rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [contacts, portcoKeys]);

  const introsByPortco = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of intros) {
      const k = r.portco.trim().toLowerCase();
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [intros]);

  const investorActivities = useMemo(() => {
    const seen = new Set<string>();
    const rows: { activity: (typeof activities)[number]; portco: string }[] = [];
    for (const p of portcos) {
      for (const a of matchActivitiesToCompany(activities, p.name)) {
        const id = `${a.gid}:${p.key}`;
        if (seen.has(id)) continue;
        seen.add(id);
        rows.push({ activity: a, portco: p.name });
      }
    }
    return rows.sort((a, b) => (b.activity.date || "").localeCompare(a.activity.date || ""));
  }, [activities, portcos]);

  const events = useMemo(() => {
    const rows: { event: PortfolioEvent; portco: string }[] = [];
    for (const p of portcos) for (const e of p.events) rows.push({ event: e, portco: p.name });
    return rows.sort((a, b) => (b.event.date || "").localeCompare(a.event.date || ""));
  }, [portcos]);

  const investorWorkstreams = useMemo(
    () => workstreams.filter((w) => portcoKeys.has(w.companyKey)),
    [workstreams, portcoKeys],
  );

  const introChart = useMemo(
    () =>
      portcos
        .map((p) => ({ name: p.name, intros: introsByPortco.get(p.key) || 0 }))
        .filter((r) => r.intros > 0)
        .sort((a, b) => b.intros - a.intros)
        .slice(0, 12),
    [portcos, introsByPortco],
  );

  const activityByMonth = useMemo(() => {
    const now = new Date();
    const keys: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const counts = new Map(keys.map((k) => [k, 0]));
    for (const r of investorActivities) {
      const k = monthKeyOf(r.activity.date);
      if (counts.has(k)) counts.set(k, (counts.get(k) || 0) + 1);
    }
    return keys.map((k) => ({ month: k.slice(5), activities: counts.get(k) || 0 }));
  }, [investorActivities]);

  const filteredLog = useMemo(
    () => (logCompany === "all" ? investorActivities : investorActivities.filter((r) => r.portco === logCompany)),
    [investorActivities, logCompany],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Investor dashboard
          </p>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" /> {investor}
          </h1>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onBack}>
          <ArrowLeft className="h-3 w-3 mr-1" /> All dashboards
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat label="Portfolio cos" value={portcos.length} />
        <Stat label="Introductions" value={intros.length} />
        <Stat label="Activity" value={investorActivities.length} />
        <Stat label="Events" value={events.length} />
        <Stat label="Workstreams" value={investorWorkstreams.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/80 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Introductions by company</CardTitle>
          </CardHeader>
          <CardContent>
            {introChart.length === 0 ? (
              <p className="text-xs text-muted-foreground py-10 text-center">
                No introductions recorded for these companies yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, introChart.length * 30)}>
                <BarChart data={introChart} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="intros" fill="oklch(0.546 0.162 241)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Activity <span className="font-normal text-muted-foreground">· last 12 mo</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={activityByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="activities" fill="oklch(0.637 0.135 163)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Portfolio companies with ownership + investor detail fields */}
      <Card className="border-border/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Portfolio companies ({portcos.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {portcos.map((p) => {
            const sheet = sheetByKey.get(p.key);
            const fields = asanaFieldsByPortco?.[p.key] || sheet?.asanaFields;
            const details = DETAIL_FIELDS.map((label) => ({
              label,
              value: fieldValue(fields, label),
            })).filter((d) => d.value);
            return (
              <div key={p.key} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold truncate">{p.name}</span>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
                    <span>{introsByPortco.get(p.key) || 0} intros</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>{p.events.length} events</span>
                  </div>
                </div>
                {details.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {details.map((d) => (
                      <Badge key={d.label} variant="outline" className="text-[10px] font-normal">
                        <span className="text-muted-foreground">{d.label}:</span>
                        <span className="ml-1 text-foreground">{d.value}</span>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    No ownership detail in Asana for this company.
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Events */}
      <Card className="border-border/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-primary" /> Events ({events.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No events for these companies.</p>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
              {events.map((r) => (
                <div
                  key={`${r.event.id}-${r.portco}`}
                  className="flex items-center gap-2 text-[11px] text-muted-foreground border-b border-border/50 pb-1"
                >
                  <span className="truncate text-foreground">{r.event.name}</span>
                  <span className="truncate">· {r.portco}</span>
                  <span className="ml-auto shrink-0 tabular-nums">{r.event.date}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Introductions list */}
      <Card className="border-border/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Users className="h-4 w-4 text-primary" /> Introductions ({intros.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {intros.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No introductions recorded.</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
              {intros.slice(0, 200).map((r, i) => (
                <button
                  key={`${r.contact.id}-${r.portco}-${i}`}
                  type="button"
                  onClick={() => onContactClick?.(r.contact)}
                  className="w-full text-left flex items-center gap-2 text-[11px] rounded-md px-1.5 py-1 hover:bg-accent transition-colors"
                >
                  <span className="font-medium text-foreground truncate">{r.contact.name}</span>
                  <span className="text-muted-foreground truncate">
                    {[r.contact.title, r.contact.company].filter(Boolean).join(" · ")}
                  </span>
                  <span className="ml-auto shrink-0 text-muted-foreground">{r.portco}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground/70">{r.date}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Major workstreams from Asana */}
      <Card className="border-border/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <GitBranch className="h-4 w-4 text-primary" /> Major workstreams (
            {investorWorkstreams.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {workstreamsLoading && investorWorkstreams.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading workstreams…
            </p>
          ) : (
            <WorkstreamGroups workstreams={investorWorkstreams} showCompany />
          )}
        </CardContent>
      </Card>

      {/* Activity log, filterable by portfolio company */}
      <Card className="border-border/80 shadow-none">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold">Activity log ({filteredLog.length})</CardTitle>
          <Select value={logCompany} onValueChange={setLogCompany}>
            <SelectTrigger className="h-7 w-48 text-xs">
              <SelectValue placeholder="All companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {portcoNames.map((n) => (
                <SelectItem key={n} value={n} className="text-xs">
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {activitiesLoading && investorActivities.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading activity…
            </p>
          ) : filteredLog.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No activity recorded.</p>
          ) : (
            <div className="space-y-1.5 max-h-[32rem] overflow-y-auto pr-1">
              {filteredLog.slice(0, 300).map((r, i) => (
                <div
                  key={`${r.activity.gid}-${r.portco}-${i}`}
                  className="rounded-md border border-border px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {r.activity.track}
                    </Badge>
                    <span className="text-xs font-medium truncate">{r.activity.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {r.activity.date || "—"}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[r.portco, r.activity.owner, r.activity.status].filter(Boolean).join(" · ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

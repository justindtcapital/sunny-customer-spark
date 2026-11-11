// Network dashboard: the Network page's pyramid (with adds/removes), outreach, conversion and
// promotions by teammate (credit = contact owner), campaigns by status and owner, and V.I.C. charts.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2 } from "lucide-react";
import { fetchContacts, fetchOwnershipIndex, fetchPortfolioCompanies, fetchTargets } from "@/utils/sheets.functions";
import { fetchNetworkDashboard } from "@/utils/network-dashboard.functions";
import type { Contact, PortfolioCompany, TargetLead } from "@/lib/types";
import { classifyContacts } from "@/lib/contact-kind";
import { usePartners } from "@/lib/use-partners";
import { useAuth } from "@/lib/auth-context";
import { canonicalOwnerName, teamProfile } from "@/lib/user-ownership";
import { classifyMovement, marketFor, primaryDomainFor, tierOf } from "@/lib/network-pyramid";
import { NetworkPyramid, PyramidViewSwitch, type PyramidView } from "@/components/crm/NetworkPyramid";
import {
  CAMPAIGN_BUCKETS, DASHBOARD_OWNERS, DEFAULT_PERIOD_DAYS, PERIODS, UNASSIGNED, campaignBucket, campaignStats, creditedOwners, dayOf,
  networkDashboardStats, personKey, touchesInWindow, weekStart, weeklyOutreach, type OwnerStats, type PersonInfo, type Touch,
} from "@/lib/network-dashboard";
import type { ChartRecord } from "@/lib/dashboard-charts";
import { VicChartBuilder } from "@/components/dashboards/VicCharts";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const OWNER_COLORS: Record<string, string> = {
  "Chris Falloon": "var(--chart-1)", "Chris Hillock": "var(--chart-2)", "Julia Beech": "var(--chart-3)", "Shane Earley": "var(--chart-4)", [UNASSIGNED]: "var(--muted-foreground)",
};
const BUCKET_COLORS: Record<string, string> = { Open: "var(--chart-3)", Active: "var(--chart-1)", Closed: "var(--chart-2)" };
const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const tip = { background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 };
const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);
const periodLabel = (d: number) => (d === 365 ? "12 months" : d === 180 ? "6 months" : `${d} days`);

const contactKey = (c: { email?: string; urid?: string; id?: string; name?: string }) => personKey(c.email) || `id:${c.urid || c.id || c.name || ""}`;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <Card className="border-border"><CardContent className="p-4">
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="font-display text-2xl font-semibold tabular-nums text-foreground mt-1">{value}</p>
    {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
  </CardContent></Card>;
}

export function NetworkDashboard() {
  const [days, setDays] = useState<number>(DEFAULT_PERIOD_DAYS);
  const [view, setView] = useState<PyramidView>("kpis");
  const { email, ready } = useAuth();
  const profile = useMemo(() => teamProfile(email), [email]);
  const partners = usePartners();
  const contactsQ = useQuery({ queryKey: ["dashboards-contacts"], queryFn: () => fetchContacts(), staleTime: 5 * 60_000 });
  const targetsQ = useQuery({ queryKey: ["dashboards-targets"], queryFn: () => fetchTargets().catch((): TargetLead[] => []), staleTime: 5 * 60_000 });
  const companiesQ = useQuery({ queryKey: ["dashboards-companies"], queryFn: () => fetchPortfolioCompanies().catch((): PortfolioCompany[] => []), staleTime: 5 * 60_000 });
  const dashQ = useQuery({ queryKey: ["network-dashboard"], queryFn: () => fetchNetworkDashboard(), enabled: ready && !!email, staleTime: 5 * 60_000 });
  const ownershipQ = useQuery({ queryKey: ["ownership-index", email], queryFn: () => fetchOwnershipIndex({ data: { email: email! } }), enabled: ready && !!email, staleTime: 60_000 });
  const ownedGids = useMemo(() => new Set(ownershipQ.data?.ownedGids || []), [ownershipQ.data?.ownedGids]);

  const portcoNames = useMemo(() => (companiesQ.data || []).map((c) => c.name), [companiesQ.data]);
  const contacts = useMemo(() => classifyContacts((contactsQ.data || []) as Contact[], { portcoNames, partners }), [contactsQ.data, portcoNames, partners]);
  const prospects = targetsQ.data || [];
  const dash = dashQ.data;

  const people = useMemo(() => {
    const m = new Map<string, PersonInfo & { domain: string; market: string; type: string; company: string }>();
    for (const c of contacts) m.set(contactKey(c), { prime: c.prime, tier: tierOf(c.temperature), prospect: false, domain: primaryDomainFor(c.primaryArea, c.areasOfInterest), market: marketFor(c.location), type: c.kind || "Network", company: c.company });
    for (const t of prospects) {
      const k = contactKey(t);
      if (!m.has(k)) m.set(k, { prime: t.prime || "", tier: "Prospect", prospect: true, domain: primaryDomainFor("", [t.sector, t.title].filter(Boolean) as string[]), market: marketFor(t.location), type: t.contactType || "Network", company: t.company });
    }
    return m;
  }, [contacts, prospects]);

  const touches = useMemo((): Touch[] => {
    const out: Touch[] = [];
    for (const e of dash?.emails || []) out.push({ person: personKey(e.email), date: e.ts, source: "Email" });
    // Credit the teammate who acted: the campaign's owner for sends, the activity's owner for logged rows.
    const campaignRunner = new Map((dash?.campaigns || []).map((c) => [c.id, c.owner || c.createdBy]));
    for (const s of dash?.sends || []) out.push({ person: personKey(s.email), date: s.date, source: "Campaign", actor: campaignRunner.get(s.campaignId) });
    for (const c of contacts) for (const i of c.interactions || []) out.push({ person: contactKey(c), date: i.date, source: "Logged", actor: i.owner });
    for (const t of prospects) for (const o of t.outreach || []) out.push({ person: contactKey(t), date: o.date, source: "Prospect outreach" });
    return out;
  }, [dash, contacts, prospects]);

  const movements = dash?.movements || [];
  const stats = useMemo(() => networkDashboardStats({ people, touches, movements, days }), [people, touches, movements, days]);
  const weekly = useMemo(() => weeklyOutreach(touches, days), [touches, days]);
  const camp = useMemo(() => campaignStats(dash?.campaigns || []), [dash?.campaigns]);
  const shownRows = stats.rows.filter((r) => r.owner !== UNASSIGNED || r.outreach || r.coldBase || r.warmBase);
  const weeklyOwners = DASHBOARD_OWNERS.filter((o) => weekly.some((w) => Number(w[o]) > 0));

  // Flat rows for charts built with V.I.C. (fields match CHART_DATASETS).
  const chartRecords = useMemo(() => {
    const ownerOf = (k: string) => creditedOwners(people.get(k)?.prime);
    const outreach: ChartRecord[] = touchesInWindow(touches, 3650).map((t) => {
      const p = people.get(t.person);
      return { _date: t.date, month: t.date.slice(0, 7), week: weekStart(t.date), teammate: t.actor || UNASSIGNED, owner: ownerOf(t.person), source: t.source, tier: p?.tier || "", domain: p?.domain || "", market: p?.market || "" };
    });
    const moves: ChartRecord[] = movements.flatMap((m) => {
      const c = classifyMovement(m); const d = dayOf(m.ts);
      if (!c || !d) return [];
      const kind = c.kind[0].toUpperCase() + c.kind.slice(1);
      return [{ _date: d, month: d.slice(0, 7), owner: ownerOf(personKey(m.email)), kind, from: c.from || "(new)", to: c.to || "Removed", path: `${c.from || "(new)"} → ${c.to || "Removed"}` }];
    });
    const campaigns: ChartRecord[] = (dash?.campaigns || []).map((c) => {
      const d = dayOf(c.created);
      return { _date: d, month: d.slice(0, 7), status: campaignBucket(c.status), owner: canonicalOwnerName(c.owner || c.createdBy) || UNASSIGNED, channel: c.channel, members: c.memberCount || 0 };
    });
    const ppl: ChartRecord[] = [...people].map(([k, p]) => ({ tier: p.tier || "", owner: ownerOf(k), domain: p.domain, market: p.market, type: p.type, company: p.company }));
    return { outreach, movements: moves, campaigns, people: ppl };
  }, [touches, people, movements, dash?.campaigns]);

  const loading = contactsQ.isLoading || targetsQ.isLoading || dashQ.isLoading;
  const t = stats.total;

  return (
    <div className="space-y-5">
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-foreground">Network pyramid</h2>
              <p className="text-xs text-muted-foreground">Same pyramid as the Network page — KPIs show adds, removes and moves.</p>
            </div>
            <PyramidViewSwitch view={view} onChange={setView} />
          </div>
          {contactsQ.isLoading ? <p className="text-xs text-muted-foreground py-10 text-center">Loading…</p> :
            <NetworkPyramid contacts={contacts} profile={profile} ownedGids={ownedGids} selection={null} onSelect={() => {}} view={view} expanded onExpandedChange={() => {}} />}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold text-foreground">Outreach and conversion</h2>
          <p className="text-xs text-muted-foreground">Outreach counts sent emails, campaign sends and logged activity (one per person per day per teammate) and is credited to the teammate who did it; "Unassigned" means no teammate was recorded. Cold → Warm and Warm → Hot credit the contact's owner.</p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" />}
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="h-8 w-32 text-xs bg-card" aria-label="Period"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map((d) => <SelectItem key={d} value={String(d)}>Last {periodLabel(d)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {dash?.error && <p role="alert" className="text-xs text-destructive">{dash.error}</p>}
      {dashQ.isError && <p role="alert" className="text-xs text-destructive">Network activity is unavailable right now.</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <Stat label="Outreach" value={loading ? "…" : t.outreach.toLocaleString()} sub={`last ${periodLabel(days)}`} />
        <Stat label="People reached" value={loading ? "…" : t.reached.toLocaleString()} />
        <Stat label="Outreach → Network" value={loading ? "…" : pct(t.conversionRate)} sub={`${t.converted} of ${t.prospectsReached} prospects reached`} />
        <Stat label="Cold → Warm" value={loading ? "…" : pct(t.coldToWarmRate)} sub={`${t.coldToWarm} of ${t.coldBase} Cold`} />
        <Stat label="Warm → Hot" value={loading ? "…" : pct(t.warmToHotRate)} sub={`${t.warmToHot} of ${t.warmBase} Warm`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="border-border"><CardContent className="p-4">
          <h3 className="font-display text-sm font-semibold text-foreground mb-2">By teammate</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-muted-foreground text-left">
                <th className="py-1.5 pr-2 font-medium">Owner</th><th className="py-1.5 px-2 font-medium text-right">Outreach</th><th className="py-1.5 px-2 font-medium text-right">Reached</th>
                <th className="py-1.5 px-2 font-medium text-right">→ Network</th><th className="py-1.5 px-2 font-medium text-right">Cold → Warm</th><th className="py-1.5 pl-2 font-medium text-right">Warm → Hot</th>
              </tr></thead>
              <tbody>{shownRows.map((r: OwnerStats) => (
                <tr key={r.owner} className="border-t">
                  <td className="py-1.5 pr-2 text-foreground"><span className="inline-block h-2 w-2 rounded-full mr-1.5 align-middle" style={{ background: OWNER_COLORS[r.owner] }} />{r.owner}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{r.outreach}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{r.reached}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums" title={`${r.converted} of ${r.prospectsReached} prospects reached`}>{pct(r.conversionRate)} <span className="text-muted-foreground">({r.converted}/{r.prospectsReached})</span></td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{pct(r.coldToWarmRate)} <span className="text-muted-foreground">({r.coldToWarm}/{r.coldBase})</span></td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">{pct(r.warmToHotRate)} <span className="text-muted-foreground">({r.warmToHot}/{r.warmBase})</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </CardContent></Card>
        <Card className="border-border"><CardContent className="p-4">
          <h3 className="font-display text-sm font-semibold text-foreground mb-2">Outreach per week</h3>
          {weekly.length ? <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weekly} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="week" tick={axis} tickLine={false} axisLine={false} tickFormatter={(w: string) => w.slice(5)} />
              <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tip} labelFormatter={(w) => `Week of ${w}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {weeklyOwners.map((o) => <Bar key={o} dataKey={o} stackId="w" fill={OWNER_COLORS[o]} />)}
            </BarChart>
          </ResponsiveContainer> : <p className="text-xs text-muted-foreground py-10 text-center">{loading ? "Loading…" : "No outreach in this period."}</p>}
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
        <div className="grid grid-cols-3 xl:grid-cols-1 gap-4">
          {CAMPAIGN_BUCKETS.map((b) => <Stat key={b} label={`${b} campaigns`} value={dashQ.isLoading ? "…" : String(camp.totals[b])} sub={b === "Open" ? "draft or saved" : b === "Active" ? "actioning" : "done"} />)}
        </div>
        <Card className="border-border"><CardContent className="p-4">
          <h3 className="font-display text-sm font-semibold text-foreground mb-2">Campaigns by owner</h3>
          {(dash?.campaigns || []).length ? <ResponsiveContainer width="100%" height={240}>
            <BarChart data={camp.byOwner} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="owner" tick={axis} tickLine={false} axisLine={false} interval={0} />
              <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {CAMPAIGN_BUCKETS.map((b) => <Bar key={b} dataKey={b} stackId="c" fill={BUCKET_COLORS[b]} />)}
            </BarChart>
          </ResponsiveContainer> : <p className="text-xs text-muted-foreground py-10 text-center">{dashQ.isLoading ? "Loading…" : "No campaigns yet."}</p>}
        </CardContent></Card>
      </div>

      <VicChartBuilder dashboard="network" records={chartRecords} loading={loading}
        colorFor={(s) => OWNER_COLORS[s] ?? BUCKET_COLORS[s] ?? (s === "Council" || s === "Hot" || s === "Warm" || s === "Cold" ? `var(--${s.toLowerCase()}-foreground)` : undefined)} />
    </div>
  );
}

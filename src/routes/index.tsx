import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Suspense, useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronUp, RefreshCw, Megaphone, Clock3, Layers3 } from "lucide-react";
import { NetworkIcon, TargetingIcon, EventsIcon, PortCoIcon, DashboardIcon } from "@/components/home/WorkspaceIcons";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/lib/auth-context";
import { teamProfile } from "@/lib/user-ownership";
import { periodBounds, inPeriod, dateKey, activeWorkstream, reminderBucket, type HomeScope, type HomePeriod, type HomeReminder } from "@/lib/home-momentum";
import { workstreamBarStatus } from "@/lib/workstream-parse";
import { fetchHomeMomentum, completeHomeNoteFollowUp } from "@/utils/home.functions";
import { getBriefing, generateBriefing } from "@/utils/briefing.functions";
import { DailyBriefing } from "@/components/home/DailyBriefing";
import { CompanyLogo } from "@/components/dashboard/WorkstreamSummary";
import { toast } from "sonner";

const homeQuery = (email: string, scope: HomeScope) => queryOptions({ queryKey: ["home-momentum", email, scope], queryFn: () => fetchHomeMomentum({ data: { email, scope } }), staleTime: 60_000 });
const briefingQuery = queryOptions({ queryKey: ["home-briefing"], queryFn: () => getBriefing(), staleTime: 60_000 });

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { scope?: HomeScope; period?: HomePeriod } => ({ scope: search.scope === "team" ? "team" : "mine", period: search.period === "month" ? "month" : "week" }),
  head: () => ({ meta: [
    { title: "Home — VenturePulse Momentum" },
    { name: "description", content: "Workspace momentum, portfolio workstreams and follow-ups across VenturePulse." },
    { property: "og:title", content: "Home — VenturePulse Momentum" },
    { property: "og:description", content: "Workspace momentum, portfolio workstreams and follow-ups across VenturePulse." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: HomePage,
});

function Stat({ label, value, small = false }: { label: string; value: number | string; small?: boolean }) {
  return <div className="min-w-0"><div className={`font-display font-semibold tabular-nums leading-none text-foreground ${small ? "text-xl" : "text-3xl"}`}>{typeof value === "number" ? value.toLocaleString() : value}</div><div className="mt-2 text-[10px] font-semibold uppercase text-muted-foreground">{label}</div></div>;
}

function HomePage() {
  const { email, ready } = useAuth();
  const { scope = "mine", period = "week" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const profile = teamProfile(email);
  return <div className="mx-auto max-w-[1400px] space-y-7 p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div><h1 className="font-display text-3xl font-semibold text-foreground">Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {profile?.firstName || "there"}</h1><p className="mt-2 text-sm text-muted-foreground">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p></div>
      <div className="flex flex-wrap gap-3">
        <ToggleGroup type="single" value={scope} aria-label="Homepage scope" className="rounded-md border border-border p-1" onValueChange={(v) => { if (v === "mine" || v === "team") void navigate({ search: (prev) => ({ ...prev, scope: v }) }); }}><ToggleGroupItem value="mine" className="text-xs">Mine</ToggleGroupItem><ToggleGroupItem value="team" className="text-xs">Team</ToggleGroupItem></ToggleGroup>
        <ToggleGroup type="single" value={period} aria-label="Momentum period" className="rounded-md border border-border p-1" onValueChange={(v) => { if (v === "week" || v === "month") void navigate({ search: (prev) => ({ ...prev, period: v }) }); }}><ToggleGroupItem value="week" className="text-xs">This week</ToggleGroupItem><ToggleGroupItem value="month" className="text-xs">This month</ToggleGroupItem></ToggleGroup>
      </div>
    </header>
    {ready && email ? <Suspense fallback={<LoadingHome />}><Momentum email={email} scope={scope} period={period} /></Suspense> : <LoadingHome />}
  </div>;
}
function LoadingHome() { return <div className="space-y-5" aria-label="Loading workspace statistics"><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-36 animate-pulse rounded-lg border border-border bg-muted" />)}</div><div className="h-40 animate-pulse rounded-lg bg-muted" /></div>; }

function Momentum({ email, scope, period }: { email: string; scope: HomeScope; period: HomePeriod }) {
  const { data } = useSuspenseQuery(homeQuery(email, scope));
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const bounds = periodBounds(new Date(data.asOf), period);
  const added = (items: { dateAdded?: string }[]) => items.filter((i) => inPeriod(i.dateAdded, bounds.start, bounds.today)).length;
  const newEvents = data.events.filter((e) => inPeriod(e.createdAt, bounds.start, bounds.today)).length;
  const upcoming = data.events.filter((e) => dateKey(e.date) >= bounds.today).length;
  const currentCampaigns = data.campaigns.filter((c) => c.status !== "done");
  const newCampaigns = data.campaigns.filter((c) => inPeriod(c.created, bounds.start, bounds.today)).length;
  const initiated = data.workstreams.filter((w) => inPeriod(w.createdAt, bounds.start, bounds.today)).length;
  const active = data.workstreams.filter(activeWorkstream).length;
  const completed = data.workstreams.filter((w) => workstreamBarStatus(w) === "Completed");
  const completedPeriod = completed.filter((w) => inPeriod(w.completedAt, bounds.start, bounds.today)).length;
  const imported = [...data.notes, ...data.emails].filter((n) => inPeriod(n.importedAt, bounds.start, bounds.today)).length + data.history.filter((n) => inPeriod(n.importedAt, bounds.start, bounds.today)).length;
  const reviewed = data.history.filter((n) => inPeriod(n.review?.reviewedAt, bounds.start, bounds.today)).length;
  const value = (source: string, count: number) => data.errors.includes(source) ? "—" : count;
  const tiles = [
    { name: "Network", to: "/crm" as const, Icon: NetworkIcon, count: value("Network", data.contacts.length), label: "Contacts", a: value("Network", added(data.contacts)), al: "Added", b: data.contacts.filter((c) => c.followUpPending).length, bl: "Open follow-ups" },
    { name: "Prospecting", to: "/targeting" as const, Icon: TargetingIcon, count: value("Prospecting", data.targets.length), label: "Prospects", a: value("Prospecting", added(data.targets)), al: "Added", b: data.targets.filter((t) => t.followUp).length, bl: "Follow-ups" },
    { name: "Events", to: "/events" as const, Icon: EventsIcon, count: value("Events", upcoming), label: "Upcoming", a: value("Events", newEvents), al: "New", b: data.events.filter((e) => inPeriod(e.date, bounds.start, bounds.today)).length, bl: "Held in period" },
    { name: "PortCo", to: "/portfolio" as const, Icon: PortCoIcon, count: value("PortCo", data.companies.length), label: "Companies", a: value("Workstreams", active), al: "Active streams", b: initiated, bl: "New streams" },
    { name: "Campaigns", to: "/campaigns" as const, Icon: Megaphone, count: value("Campaigns", currentCampaigns.length), label: "Active campaigns", a: value("Campaigns", newCampaigns), al: "New", b: currentCampaigns.reduce((n, c) => n + (c.memberCount || 0), 0), bl: "Memberships" },
    { name: "Notes & Activity", to: "/dashboard" as const, Icon: DashboardIcon, count: data.errors.includes("Notes") || data.errors.includes("Email review") ? "—" : data.notes.length + data.emails.length, label: "To review", a: value("Notes", data.notes.length), al: "Notes", b: value("Email review", data.emails.length), bl: "Emails" },
  ];
  const statusCounts = new Map<string, number>();
  const logoCounts = new Map<string, number>();
  for (const w of data.workstreams) { const s = workstreamBarStatus(w); statusCounts.set(s, (statusCounts.get(s) || 0) + 1); logoCounts.set(w.company, (logoCounts.get(w.company) || 0) + 1); }
  return <>
    {data.errors.length > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-destructive pl-3 text-xs text-muted-foreground"><span>Some statistics are unavailable: {data.errors.join(", ")}</span><Button variant="ghost" size="sm" onClick={() => void client.invalidateQueries({ queryKey: ["home-momentum", email, scope] })}>Retry</Button></div>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((t) => <Button key={t.name} asChild variant="outline" className="group h-auto min-h-40 items-stretch justify-start whitespace-normal rounded-lg bg-card p-4 text-left"><Link to={t.to}><div className="w-full"><div className="mb-5 flex items-center gap-2"><t.Icon className="h-5 w-5 text-primary" /><span className="font-display text-sm font-semibold">{t.name}</span><ArrowRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></div><div className="flex items-start justify-between gap-5"><Stat label={t.label} value={t.count} /><div className="ml-auto grid grid-cols-2 gap-5 text-right"><Stat small label={t.al} value={t.a} /><Stat small label={t.bl} value={t.b} /></div></div></div></Link></Button>)}
    </div>
    <section className="space-y-5 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-display text-base font-semibold"><Layers3 className="h-4 w-4 text-primary" />Workstreams</h2><p className="mt-1 text-xs text-muted-foreground">{scope === "mine" ? teamProfile(email)?.displayName : "Team"} · {period === "week" ? "This week" : "This month"}</p></div><Button asChild variant="outline" size="sm"><Link to="/dashboard">Open <ArrowRight className="ml-2 h-3.5 w-3.5" /></Link></Button></div>
      <div className="flex flex-wrap justify-between gap-6"><div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4"><Stat label="Initiated" value={value("Workstreams", initiated)} /><Stat label="Active now" value={value("Workstreams", active)} /><Stat label="Completed in period" value={value("Workstreams", completedPeriod)} /><Stat label="Completed total" value={value("Workstreams", completed.length)} /></div><div className="ml-auto flex max-w-full flex-col items-end gap-3 self-center text-xs text-muted-foreground"><div className="flex flex-wrap justify-end gap-4"><span>BD <b className="text-foreground">{data.workstreams.filter((w) => w.segment === "BD").length}</b></span><span>GTM <b className="text-foreground">{data.workstreams.filter((w) => w.segment === "GTM").length}</b></span><span>Total <b className="text-foreground">{data.workstreams.length}</b></span></div><div className="flex flex-wrap justify-end gap-x-4 gap-y-2">{[...statusCounts].map(([status, n]) => <span key={status} className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${status === "Completed" ? "bg-primary" : /blocked|stalled/i.test(status) ? "bg-destructive" : "bg-muted-foreground"}`} />{status} <b className="text-foreground">{n}</b></span>)}</div></div></div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">{[...logoCounts].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, n]) => <span key={name} title={`${name}: ${n} workstreams`} className="inline-flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-2 text-xs"><span className="[&>span]:h-6 [&>span]:w-6"><CompanyLogo name={name} website={data.companies.find((c) => c.name === name)?.website || ""} /></span><b className="tabular-nums">{n}</b></span>)}</div>
      {data.workstreams.some((w) => !w.createdAt) && <p className="text-[11px] text-muted-foreground">{data.workstreams.filter((w) => !w.createdAt).length} streams have no creation date.</p>}
      {completed.some((w) => !w.completedAt) && <p className="text-[11px] text-muted-foreground">{completed.filter((w) => !w.completedAt).length} completed streams have no completion date.</p>}
    </section>
    <FollowUps reminders={data.reminders} bounds={bounds} email={email} />
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>{scope === "mine" ? "Your" : "Team"} review momentum · {reviewed} reviewed {period === "week" ? "this week" : "this month"} · {imported} source items in period</span><Button title="Refresh homepage statistics" aria-label="Refresh homepage statistics" variant="ghost" size="sm" disabled={refreshing} onClick={async () => { setRefreshing(true); try { await client.invalidateQueries({ queryKey: ["home-momentum", email, scope] }); } finally { setRefreshing(false); } }}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />Updated {new Date(data.asOf).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</Button></div>
    <Suspense fallback={null}><Briefing /></Suspense>
  </>;
}
function FollowUps({ reminders, bounds, email }: { reminders: HomeReminder[]; bounds: ReturnType<typeof periodBounds>; email: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const complete = useServerFn(completeHomeNoteFollowUp);
  const client = useQueryClient();
  const visible = reminders.filter((r) => reminderBucket(r.due, bounds.today, bounds.weekEnd) !== "later");
  const count = (bucket: string) => reminders.filter((r) => reminderBucket(r.due, bounds.today, bounds.weekEnd) === bucket).length;
  return <section className="rounded-lg border border-border bg-card p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-display text-base font-semibold"><Clock3 className="h-4 w-4 text-primary" />Follow-ups due this week</h2><p className="mt-1 text-xs text-muted-foreground">Through {bounds.weekEnd}</p></div><Button size="sm" variant="outline" onClick={() => setOpen(!open)}>{open ? "Close" : "View"}{open ? <ChevronUp className="ml-2 h-3.5 w-3.5" /> : <ChevronDown className="ml-2 h-3.5 w-3.5" />}</Button></div><div className="mt-5 flex flex-wrap gap-10"><Stat label="Due this week" value={count("due")} /><Stat label="Overdue" value={count("overdue")} /><Stat label="Without a date" value={count("undated")} /></div>{open && <div className="mt-5 max-h-[480px] overflow-y-auto divide-y divide-border border-t border-border">{visible.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No outstanding follow-ups this week.</p> : visible.map((r) => <div key={r.id} className="flex flex-wrap items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{r.person}{r.company && <span className="font-normal text-muted-foreground"> · {r.company}</span>}</p><p className="mt-1 break-words text-xs text-muted-foreground">{r.summary}</p><p className="mt-1 text-[11px] text-muted-foreground">{r.source} · {r.owner || "Unassigned"} · {dateKey(r.due) || "No date"}</p></div>{r.activityId ? <><Button variant="outline" size="sm" disabled={busy === r.id} onClick={async () => { if (!r.activityId) return; setBusy(r.id); try { const result = await complete({ data: { activityId: r.activityId } }); if (!result.success) throw new Error("Not saved"); await client.invalidateQueries({ queryKey: ["home-momentum", email] }); toast.success("Follow-up completed"); } catch { toast.error("Couldn't complete the follow-up"); } finally { setBusy(""); } }}><Check className="mr-1 h-3.5 w-3.5" />Complete</Button>{r.sourceUrl?.startsWith("https://") && <Button asChild variant="ghost" size="sm"><a href={r.sourceUrl} target="_blank" rel="noreferrer">Open</a></Button>}</> : r.campaignId ? <Button asChild variant="outline" size="sm"><Link to="/campaigns" search={{ campaign: r.campaignId }}>Open <ArrowRight className="ml-1 h-3 w-3" /></Link></Button> : r.source === "Prospecting" ? <Button asChild variant="outline" size="sm"><Link to="/targeting" search={{ target: r.targetKey }}>Open <ArrowRight className="ml-1 h-3 w-3" /></Link></Button> : <Button asChild variant="outline" size="sm"><Link to="/crm" search={{ contact: r.email }}>Open <ArrowRight className="ml-1 h-3 w-3" /></Link></Button>}</div>)}</div>}</section>;
}
function Briefing() {
  const { data } = useSuspenseQuery(briefingQuery);
  const run = useServerFn(generateBriefing);
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  return <DailyBriefing briefing={data} busy={busy} onGenerate={async () => { setBusy(true); try { await run(); await client.invalidateQueries({ queryKey: ["home-briefing"] }); } catch { toast.error("Couldn't generate the briefing"); } finally { setBusy(false); } }} />;
}

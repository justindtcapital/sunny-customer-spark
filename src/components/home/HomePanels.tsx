import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { ArrowRight, Megaphone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NetworkIcon, EventsIcon, DashboardIcon } from "@/components/home/WorkspaceIcons";
import { VicMark } from "@/components/vic/VicMark";
import { fetchHomeMomentum } from "@/utils/home.functions";
import { fetchPlannerFn } from "@/utils/event-planner.functions";
import { fetchCampaigns } from "@/utils/campaigns.functions";
import { PYRAMID_TIERS, tierOf, type PyramidTier } from "@/lib/network-pyramid";
import { actionDayCounts } from "@/lib/action-calendar";
import { dateKey } from "@/lib/home-momentum";
import { addedWithin, doToday, upcomingEvents } from "@/lib/home-panels";
import { subcategoryColor } from "@/lib/event-planner";
import { teamMemberFor, teamProfile } from "@/lib/user-ownership";
import { VIC_SKILLS } from "@/lib/vic-skills";

export const homeDataQuery = (email: string) => queryOptions({ queryKey: ["home-momentum", email, "mine"], queryFn: () => fetchHomeMomentum({ data: { email, scope: "mine" } }), staleTime: 60_000 });
export const plannerQuery = queryOptions({ queryKey: ["home-planner"], queryFn: () => fetchPlannerFn(), staleTime: 5 * 60_000 });
export const campaignsQuery = queryOptions({ queryKey: ["home-campaigns"], queryFn: () => fetchCampaigns(), staleTime: 60_000 });

type PanelTo = "/crm" | "/my-actions" | "/events" | "/campaigns" | "/vic";

function Panel({ title, icon, to, search, cta, children }: { title: string; icon: ReactNode; to: PanelTo; search?: Record<string, string | undefined>; cta: string; children: ReactNode }) {
  const navigate = useNavigate();
  const go = () => void navigate({ to, search: (search || {}) as never });
  return <section role="link" tabIndex={0} aria-label={`Open ${title}`} onClick={go} onKeyDown={(e) => { if (e.key === "Enter") go(); }}
    className="group flex h-[360px] cursor-pointer flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-foreground">{icon}{title}</h2>
    <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    <div className="mt-3 flex justify-end">
      <Button asChild size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => e.stopPropagation()}>
        <Link to={to} search={(search || {}) as never}>{cta}<ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></Link>
      </Button>
    </div>
  </section>;
}

export function PanelSkeleton() { return <div className="h-[360px] animate-pulse rounded-lg border border-border bg-muted" />; }

function Unavailable({ what }: { what: string }) { return <p className="text-xs text-muted-foreground">{what} couldn't be loaded right now.</p>; }

/** Small month grid; each day renders its own marker under the date number. */
function MiniMonth({ today, marker, label }: { today: string; marker: (key: string) => ReactNode; label: string }) {
  const t = new Date(`${today}T12:00:00`);
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(t), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(t), { weekStartsOn: 1 }) });
  return <div aria-label={label} className="w-full max-w-[240px] select-none">
    <div className="mb-1 text-xs font-semibold text-foreground">{format(t, "MMMM yyyy")}</div>
    <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
    <div className="mt-0.5 grid grid-cols-7 gap-0.5">{days.map((d) => {
      const key = format(d, "yyyy-MM-dd");
      return <div key={key} className={`flex h-8 flex-col items-center justify-start rounded-sm pt-0.5 text-[11px] leading-none ${key === today ? "ring-1 ring-primary" : ""} ${d.getMonth() !== t.getMonth() ? "opacity-35" : ""}`}>
        <span className="text-foreground">{d.getDate()}</span>{marker(key)}
      </div>;
    })}</div>
  </div>;
}

export function NetworkPanel({ email, today }: { email: string; today: string }) {
  const { data } = useSuspenseQuery(homeDataQuery(email));
  const failed = data.errors.includes("Network");
  const counts = Object.fromEntries(PYRAMID_TIERS.map((t) => [t, 0])) as Record<PyramidTier, number>;
  const people = data.contacts.filter((c) => !c.portco);
  for (const c of people) { const tier = tierOf(c.temperature); if (tier && tier !== "Prospect") counts[tier]++; }
  counts.Prospect = data.targets.length;
  const total = people.length + data.targets.length;
  const fresh = addedWithin(people, today) + addedWithin(data.targets, today);
  return <Panel title="My network" icon={<NetworkIcon className="h-4 w-4 text-primary" />} to="/crm" cta="Open Network">
    {failed ? <Unavailable what="Network" /> : <div className="flex h-full gap-4">
      <div className="flex flex-1 flex-col justify-center gap-1" aria-label="Network pyramid">
        {PYRAMID_TIERS.map((tier, i) => <div key={tier} className="mx-auto flex h-9 items-center justify-between rounded-sm bg-primary/10 px-3 text-xs" style={{ width: `${44 + i * 14}%` }}>
          <span className="font-medium text-foreground">{tier === "Prospect" ? "Prospects" : tier}</span><span className="tabular-nums font-semibold text-primary">{counts[tier].toLocaleString()}</span>
        </div>)}
      </div>
      <div className="flex w-24 flex-col justify-center gap-5 text-right">
        <div><div className="font-display text-3xl font-semibold tabular-nums text-foreground">{fresh}</div><div className="text-[10px] font-semibold uppercase text-muted-foreground">New · 30 days</div></div>
        <div><div className="font-display text-3xl font-semibold tabular-nums text-foreground">{total.toLocaleString()}</div><div className="text-[10px] font-semibold uppercase text-muted-foreground">Total</div></div>
      </div>
    </div>}
  </Panel>;
}

export function ActionsPanel({ email, today }: { email: string; today: string }) {
  const { data } = useSuspenseQuery(homeDataQuery(email));
  const counts = actionDayCounts(data.reminders);
  const list = doToday(data.reminders, today);
  return <Panel title="My actions" icon={<DashboardIcon className="h-4 w-4 text-primary" />} to="/my-actions" search={{ owner: teamProfile(email)?.displayName, tab: "actions" }} cta="Open My Actions">
    <div className="flex h-full gap-4">
      <MiniMonth today={today} label="Actions due by day" marker={(k) => { const n = counts.get(k) || 0; return <span className="mt-0.5 text-[9px] font-semibold tabular-nums text-primary">{n || ""}</span>; }} />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 text-xs font-semibold text-foreground">Do today <span className="font-normal text-muted-foreground">({list.length})</span></div>
        {list.length === 0 ? <p className="text-xs text-muted-foreground">Nothing due. You're clear.</p> :
          <ul className="space-y-1.5 overflow-hidden text-xs">{list.slice(0, 9).map((r) => <li key={r.id} className="truncate">
            {r.overdue && <span className="mr-1.5 rounded-sm bg-destructive/10 px-1 text-[10px] font-semibold text-destructive">{format(new Date(`${dateKey(r.due)}T12:00:00`), "MMM d")}</span>}
            <span className="text-foreground">{r.summary}</span>{r.person && <span className="text-muted-foreground"> · {r.person}</span>}
          </li>)}{list.length > 9 && <li className="text-muted-foreground">+{list.length - 9} more</li>}</ul>}
      </div>
    </div>
  </Panel>;
}

export function EventsPanel({ today }: { today: string }) {
  const { data } = useSuspenseQuery(plannerQuery);
  const events = data.events.filter((e) => !/declined/i.test(e.dtcStatus || e.status));
  const byDay = new Map<string, string[]>();
  for (const e of events) {
    if (!e.start) continue;
    const days = e.end && e.end > e.start ? eachDayOfInterval({ start: new Date(`${e.start}T12:00:00`), end: new Date(`${e.end}T12:00:00`) }).slice(0, 31).map((d) => format(d, "yyyy-MM-dd")) : [e.start];
    for (const d of days) byDay.set(d, [...(byDay.get(d) || []), `var(--planner-${subcategoryColor(e.subcategory)})`]);
  }
  const next = upcomingEvents(events, today, 8);
  return <Panel title="Events" icon={<EventsIcon className="h-4 w-4 text-primary" />} to="/events" cta="Open Event Planner">
    {data.error ? <Unavailable what="Events" /> : <div className="flex h-full gap-4">
      <MiniMonth today={today} label="Events this month" marker={(k) => { const colors = [...new Set(byDay.get(k) || [])].slice(0, 3); return <span className="mt-1 flex gap-0.5">{colors.map((c) => <span key={c} className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />)}</span>; }} />
      <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
        <li className="text-xs font-semibold text-foreground">Coming up</li>
        {next.length === 0 && <li className="text-muted-foreground">No upcoming events.</li>}
        {next.map((e) => <li key={e.urid} className="flex gap-2 truncate"><span className="w-12 shrink-0 tabular-nums text-muted-foreground">{format(new Date(`${e.start}T12:00:00`), "MMM d")}</span><span className="truncate text-foreground">{e.name}</span></li>)}
      </ul>
    </div>}
  </Panel>;
}

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"; }

export function CampaignsPanel() {
  const { data } = useSuspenseQuery(campaignsQuery);
  const active = data.campaigns.filter((c) => c.status === "saved" || c.status === "actioning").sort((a, b) => (b.updated || b.created).localeCompare(a.updated || a.created));
  return <Panel title="Active campaigns" icon={<Megaphone className="h-4 w-4 text-primary" />} to="/campaigns" cta="Open Campaigns">
    {data.error ? <Unavailable what="Campaigns" /> : active.length === 0 ? <p className="text-xs text-muted-foreground">No campaigns in progress.</p> :
      <ul className="space-y-2 text-xs">{active.slice(0, 8).map((c) => { const who = teamMemberFor(c.owner)?.displayName || c.owner || "Unassigned"; return <li key={c.id} className="flex items-center gap-2">
        <span title={who} aria-label={`Run by ${who}`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">{initials(who)}</span>
        <span className="truncate text-foreground">{c.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{c.memberCount || 0} people</span>
      </li>; })}{active.length > 8 && <li className="text-muted-foreground">+{active.length - 8} more</li>}</ul>}
  </Panel>;
}

export function VicPanel() {
  const navigate = useNavigate();
  return <Panel title="V.I.C. agents" icon={<VicMark className="h-4 w-4" />} to="/vic" cta="Open V.I.C.">
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Run an agent:</p>
      {VIC_SKILLS.map((s) => <Button key={s.id} variant="secondary" size="sm" className="h-auto w-full justify-start whitespace-normal py-2 text-left text-xs"
        onClick={(e) => { e.stopPropagation(); void navigate({ to: "/vic", search: { skill: s.id } }); }}>
        <Sparkles className="mr-2 h-3.5 w-3.5 shrink-0 text-primary" />{s.name}
      </Button>)}
    </div>
  </Panel>;
}

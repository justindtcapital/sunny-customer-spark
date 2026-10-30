import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ArrowRight, ChevronLeft, ChevronRight, Megaphone, Send, Sparkles, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { NetworkPyramid } from "@/components/crm/NetworkPyramid";
import { createVicThread } from "@/lib/vic-client";
import { Button } from "@/components/ui/button";
import { NetworkIcon, EventsIcon, DashboardIcon } from "@/components/home/WorkspaceIcons";
import { VicMark } from "@/components/vic/VicMark";
import { fetchHomeMomentum } from "@/utils/home.functions";
import { fetchPlannerFn } from "@/utils/event-planner.functions";
import { fetchCampaigns } from "@/utils/campaigns.functions";
import { actionDayCounts } from "@/lib/action-calendar";
import { dateKey, type HomeReminder } from "@/lib/home-momentum";
import { doToday, dueInRange, eventsInRange, upcomingEvents } from "@/lib/home-panels";
import { subcategoryColor } from "@/lib/event-planner";
import { teamMemberFor, teamProfile } from "@/lib/user-ownership";
import { VIC_SKILLS } from "@/lib/vic-skills";

export const homeDataQuery = (email: string) => queryOptions({ queryKey: ["home-momentum", email, "mine"], queryFn: () => fetchHomeMomentum({ data: { email, scope: "mine" } }), staleTime: 60_000 });
export const plannerQuery = queryOptions({ queryKey: ["home-planner"], queryFn: () => fetchPlannerFn(), staleTime: 5 * 60_000 });
export const campaignsQuery = queryOptions({ queryKey: ["home-campaigns"], queryFn: () => fetchCampaigns(), staleTime: 60_000 });

type PanelTo = "/crm" | "/my-actions" | "/events" | "/campaigns" | "/vic";
type Range = { from: string; to: string } | null;

function Panel({ title, icon, to, search, cta, className = "h-[300px]", children }: { title: string; icon: ReactNode; to: PanelTo; search?: Record<string, string | undefined>; cta: string; className?: string; children: ReactNode }) {
  return <section aria-label={title} className={`flex flex-col rounded-lg border border-border bg-card p-4 ${className}`}>
    <h2 className="mb-2 font-display text-sm font-semibold text-foreground">
      <Link to={to} search={(search || {}) as never} className="inline-flex items-center gap-2 hover:text-primary">{icon}{title}</Link>
    </h2>
    <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    <div className="mt-2 flex justify-end">
      <Button asChild size="sm" variant="outline" className="group h-7 text-xs">
        <Link to={to} search={(search || {}) as never}>{cta}<ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></Link>
      </Button>
    </div>
  </section>;
}

export function PanelSkeleton({ className = "h-[300px]" }: { className?: string }) { return <div className={`animate-pulse rounded-lg border border-border bg-muted ${className}`} />; }

function Unavailable({ what }: { what: string }) { return <p className="text-xs text-muted-foreground">{what} couldn't be loaded right now.</p>; }

/** Month grid with click or drag day-range selection; each day renders its own marker. */
function MiniMonth({ today, marker, label, range, onRange }: { today: string; marker: (key: string) => ReactNode; label: string; range: Range; onRange: (r: Range) => void }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date(`${today}T12:00:00`)));
  const [anchor, setAnchor] = useState<string | null>(null);
  useEffect(() => { const up = () => setAnchor(null); window.addEventListener("pointerup", up); return () => window.removeEventListener("pointerup", up); }, []);
  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const span = (a: string, b: string) => (a <= b ? { from: a, to: b } : { from: b, to: a });
  return <div aria-label={label} className="w-full max-w-[250px] shrink-0 select-none">
    <div className="mb-1 flex items-center justify-between">
      <Button variant="ghost" size="icon" className="h-5 w-5" aria-label="Previous month" onClick={() => setMonth(subMonths(month, 1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
      <button type="button" className="text-xs font-semibold text-foreground hover:text-primary" title="Select the whole month"
        onClick={() => onRange({ from: format(month, "yyyy-MM-dd"), to: format(endOfMonth(month), "yyyy-MM-dd") })}>{format(month, "MMMM yyyy")}</button>
      <Button variant="ghost" size="icon" className="h-5 w-5" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-3.5 w-3.5" /></Button>
    </div>
    <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
    <div className="mt-0.5 grid grid-cols-7 gap-0.5">{days.map((d) => {
      const key = format(d, "yyyy-MM-dd");
      const on = !!range && key >= range.from && key <= range.to;
      return <button type="button" key={key} aria-pressed={on} aria-label={format(d, "EEEE MMMM d")}
        onPointerDown={(e) => { e.preventDefault(); setAnchor(key); onRange(range && range.from === key && range.to === key ? null : { from: key, to: key }); }}
        onPointerEnter={() => { if (anchor) onRange(span(anchor, key)); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRange({ from: key, to: key }); } }}
        className={`flex h-7 flex-col items-center justify-start rounded-sm pt-0.5 text-[11px] leading-none ${on ? "bg-primary/15" : "hover:bg-muted"} ${key === today ? "ring-1 ring-primary" : ""} ${d.getMonth() !== month.getMonth() ? "opacity-35" : ""}`}>
        <span className="text-foreground">{d.getDate()}</span>{marker(key)}
      </button>;
    })}</div>
  </div>;
}

function rangeLabel(r: NonNullable<Range>) {
  const f = (k: string) => format(new Date(`${k}T12:00:00`), "MMM d");
  return r.from === r.to ? f(r.from) : `${f(r.from)} – ${f(r.to)}`;
}

function RangeHeading({ range, fallback, count, onClear }: { range: Range; fallback: string; count: number; onClear: () => void }) {
  return <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-foreground">
    <span>{range ? rangeLabel(range) : fallback} <span className="font-normal text-muted-foreground">({count})</span></span>
    {range && <Button variant="ghost" size="sm" className="ml-auto h-5 px-1.5 text-[10px]" onClick={onClear}><X className="mr-0.5 h-3 w-3" />Clear</Button>}
  </div>;
}

export function NetworkPanel({ email }: { email: string }) {
  const { data } = useSuspenseQuery(homeDataQuery(email));
  const navigate = useNavigate();
  const profile = teamProfile(email);
  const people = data.contacts.filter((c) => !c.portco);
  return <Panel title="My network" icon={<NetworkIcon className="h-4 w-4 text-primary" />} to="/crm" cta="Open Network" className="h-[340px]">
    {data.errors.includes("Network") ? <Unavailable what="Network" /> :
      <NetworkPyramid embedded expanded onExpandedChange={() => {}} contacts={people} profile={profile} selection={null} onSelect={() => void navigate({ to: "/crm" })} />}
  </Panel>;
}

export function ActionsPanel({ email, today }: { email: string; today: string }) {
  const { data } = useSuspenseQuery(homeDataQuery(email));
  const [range, setRange] = useState<Range>(null);
  const counts = actionDayCounts(data.reminders);
  const list: (HomeReminder & { overdue?: boolean })[] = range ? dueInRange(data.reminders, range.from, range.to) : doToday(data.reminders, today);
  return <Panel title="My actions" icon={<DashboardIcon className="h-4 w-4 text-primary" />} to="/my-actions" search={{ owner: teamProfile(email)?.displayName, tab: "actions" }} cta="Open My Actions">
    <div className="flex h-full gap-4">
      <MiniMonth today={today} label="Actions due by day — click or drag to select days" range={range} onRange={setRange}
        marker={(k) => { const n = counts.get(k) || 0; return <span className="mt-0.5 text-[9px] font-semibold tabular-nums text-primary">{n || ""}</span>; }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <RangeHeading range={range} fallback="Do today" count={list.length} onClear={() => setRange(null)} />
        {list.length === 0 ? <p className="text-xs text-muted-foreground">{range ? "Nothing due on these days." : "Nothing due. You're clear."}</p> :
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto text-xs">{list.map((r) => <li key={r.id} className="truncate">
            {(range || r.overdue) && <span className={`mr-1.5 rounded-sm px-1 text-[10px] font-semibold ${r.overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{format(new Date(`${dateKey(r.due)}T12:00:00`), "MMM d")}</span>}
            <span className="text-foreground">{r.summary}</span>{r.person && <span className="text-muted-foreground"> · {r.person}</span>}
          </li>)}</ul>}
      </div>
    </div>
  </Panel>;
}

export function EventsPanel({ today }: { today: string }) {
  const { data } = useSuspenseQuery(plannerQuery);
  const [range, setRange] = useState<Range>(null);
  const events = data.events.filter((e) => !/declined/i.test(e.dtcStatus || e.status));
  const byDay = new Map<string, string[]>();
  for (const e of events) {
    if (!e.start) continue;
    const days = e.end && e.end > e.start ? eachDayOfInterval({ start: new Date(`${e.start}T12:00:00`), end: new Date(`${e.end}T12:00:00`) }).slice(0, 31).map((d) => format(d, "yyyy-MM-dd")) : [e.start];
    for (const d of days) byDay.set(d, [...(byDay.get(d) || []), `var(--planner-${subcategoryColor(e.subcategory)})`]);
  }
  const list = range ? eventsInRange(events, range.from, range.to) : upcomingEvents(events, today, 20);
  return <Panel title="Events" icon={<EventsIcon className="h-4 w-4 text-primary" />} to="/events" cta="Open Event Planner">
    {data.error ? <Unavailable what="Events" /> : <div className="flex h-full gap-4">
      <MiniMonth today={today} label="Events by day — click or drag to select days" range={range} onRange={setRange}
        marker={(k) => { const colors = [...new Set(byDay.get(k) || [])].slice(0, 3); return <span className="mt-1 flex gap-0.5">{colors.map((c) => <span key={c} className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />)}</span>; }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <RangeHeading range={range} fallback="Coming up" count={list.length} onClear={() => setRange(null)} />
        {list.length === 0 && <p className="text-xs text-muted-foreground">{range ? "No events on these days." : "No upcoming events."}</p>}
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto text-xs">
          {list.map((e) => <li key={e.urid} className="flex gap-2 truncate"><span className="w-12 shrink-0 tabular-nums text-muted-foreground">{format(new Date(`${e.start}T12:00:00`), "MMM d")}</span><span className="h-1.5 w-1.5 shrink-0 self-center rounded-full" style={{ background: `var(--planner-${subcategoryColor(e.subcategory)})` }} /><span className="truncate text-foreground">{e.name}</span></li>)}
        </ul>
      </div>
    </div>}
  </Panel>;
}

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"; }

export function CampaignsPanel() {
  const { data } = useSuspenseQuery(campaignsQuery);
  const active = data.campaigns.filter((c) => c.status === "saved" || c.status === "actioning").sort((a, b) => (b.updated || b.created).localeCompare(a.updated || a.created));
  return <Panel title="Active campaigns" icon={<Megaphone className="h-4 w-4 text-primary" />} to="/campaigns" cta="Open Campaigns" className="h-[230px]">
    {data.error ? <Unavailable what="Campaigns" /> : active.length === 0 ? <p className="text-xs text-muted-foreground">No campaigns in progress.</p> :
      <ul className="h-full space-y-1.5 overflow-y-auto text-xs">{active.map((c) => { const who = teamMemberFor(c.owner)?.displayName || c.owner || "Unassigned"; return <li key={c.id} className="flex items-center gap-2">
        <span title={who} aria-label={`Run by ${who}`} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">{initials(who)}</span>
        <span className="truncate text-foreground">{c.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{c.memberCount || 0} people</span>
      </li>; })}</ul>}
  </Panel>;
}

export function VicPanel() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    if (!q.trim() || busy) return;
    setBusy(true);
    try {
      const id = await createVicThread();
      sessionStorage.setItem(`vic-pending:${id}`, q.trim());
      void navigate({ to: "/vic/$threadId", params: { threadId: id } });
    } catch (e) { toast.error((e as Error).message); setBusy(false); }
  };
  return <Panel title="V.I.C." icon={<VicMark className="h-4 w-4" />} to="/vic" cta="Open V.I.C." className="h-[230px]">
    <div className="flex h-full flex-col gap-2">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <Textarea value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask V.I.C. a question…" aria-label="Ask V.I.C. a question"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }}
          className="min-h-[52px] flex-1 resize-none text-xs" />
        <Button type="submit" size="icon" className="h-[52px] w-9 shrink-0" disabled={!q.trim() || busy} aria-label="Ask V.I.C."><Send className="h-4 w-4" /></Button>
      </form>
      <div className="min-h-0 flex-1 border-t border-border pt-2">
        <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted-foreground">Run an agent</p>
        <div className="flex flex-wrap gap-1.5">{VIC_SKILLS.map((s) => <Button key={s.id} variant="secondary" size="sm" className="h-7 text-xs"
          onClick={() => void navigate({ to: "/vic", search: { skill: s.id } })}><Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />{s.name}</Button>)}</div>
      </div>
    </div>
  </Panel>;
}

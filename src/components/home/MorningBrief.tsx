import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowRight, Building2, CalendarClock, CalendarDays, ChevronDown, ChevronRight, ChevronUp, ExternalLink,
  FileText, GitBranch, Hourglass, ListChecks, Mail, Megaphone, RefreshCw, Sparkles, Sun, UserPlus, Users, Video,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SmartPasteDialog } from "@/components/crm/SmartPasteDialog";
import { ContactAvatar } from "@/components/crm/ContactAvatar";
import { companyLogoSources, resolveCompanyLogoDomain } from "@/lib/domain-utils";
import { fetchPortfolioCompanies } from "@/utils/sheets.functions";
import { emailMorningBrief, fetchMorningBriefs, rebuildMorningBrief, type BriefRow } from "@/utils/morning-brief.functions";
import type { BriefCompany, BriefMeeting, BriefPortco, BriefWorkstream, MorningBrief } from "@/utils/morning-brief.server";

export const briefQueryKey = (limit: number) => ["morning-briefs", limit] as const;

export function useBriefs(limit: number) {
  const fetchBriefs = useServerFn(fetchMorningBriefs);
  return useQuery({ queryKey: briefQueryKey(limit), queryFn: () => fetchBriefs({ data: { limit } }), staleTime: 60_000 });
}

const BADGE: Record<string, string> = { NM: "bg-success/15 text-success", NU: "bg-warning/20 text-warning-foreground", BB: "bg-destructive/15 text-destructive" };
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** PortCo websites by name, so logos also work on briefs saved before websites were stored. */
function usePortcoWebsites() {
  const { data = [] } = useQuery({ queryKey: ["portfolio-companies"], queryFn: () => fetchPortfolioCompanies(), staleTime: 300_000 });
  return useMemo(() => new Map(data.map((p) => [normName(p.name), p.website || ""])), [data]);
}

/** Company logo from website/domain (or a name guess), initials when nothing loads. */
function BriefLogo({ name, website, domain, size = "md" }: { name: string; website?: string; domain?: string; size?: "sm" | "md" | "lg" }) {
  const sources = useMemo(() => {
    const r = resolveCompanyLogoDomain({ website, domain, company: name });
    return r ? companyLogoSources(r.domain, r.confidence) : [];
  }, [website, domain, name]);
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [sources]);
  const box = size === "lg" ? "h-11 w-11" : size === "sm" ? "h-5 w-5" : "h-8 w-8";
  const img = size === "lg" ? "h-8 w-8" : size === "sm" ? "h-4 w-4" : "h-6 w-6";
  const src = sources[idx];
  const initials = (name || "?").replace(/^the\s+/i, "").trim().split(/\s+/).map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  return <span className={`${box} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background`}>
    {src ? <img key={src} src={src} alt={`${name} logo`} className={`${img} object-contain`} onError={() => setIdx((i) => i + 1)} />
      : <span className={`${size === "sm" ? "text-[8px]" : "text-xs"} font-semibold text-primary`}>{initials}</span>}
  </span>;
}

function Label({ icon: Icon, children, tone }: { icon: typeof Mail; children: ReactNode; tone?: "warn" }) {
  return <div className={`mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${tone === "warn" ? "text-warning-foreground" : "text-muted-foreground"}`}><Icon className="h-3.5 w-3.5" />{children}</div>;
}

/** One openable row: the line you scan, with details and links underneath. */
function Item({ title, meta, children }: { title: ReactNode; meta?: ReactNode; children: ReactNode }) {
  return <details className="group rounded-md border border-transparent open:border-border open:bg-muted/40 hover:bg-muted/40">
    <summary className="flex cursor-pointer list-none items-start gap-1.5 px-1.5 py-1 [&::-webkit-details-marker]:hidden">
      <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
      <span className="min-w-0 flex-1 text-foreground">{title}</span>
      {meta}
    </summary>
    <div className="space-y-1 px-6 pb-2 text-muted-foreground">{children}</div>
  </details>;
}

const openLink = "inline-flex items-center gap-1 text-primary hover:underline";

function WorkstreamItem({ w, showCompany }: { w: BriefWorkstream; showCompany?: boolean }) {
  return <Item title={<>{showCompany && w.company ? <span className="text-muted-foreground">{w.company} · </span> : null}{w.name}</>} meta={<span className="shrink-0 text-[10px] text-muted-foreground">{w.status}</span>}>
    {w.update && <p className="text-foreground">{w.update}</p>}
    <p>{[w.priority, w.lastActivity ? `updated ${w.lastActivity}` : ""].filter(Boolean).join(" · ") || "No recent update"}</p>
    <div className="flex flex-wrap gap-3">
      {w.gid && <Link to="/my-actions" search={{ tab: "actions", ws: w.gid }} className={openLink}>Open in My Actions<ArrowRight className="h-3 w-3" /></Link>}
      {w.url && <a href={w.url} target="_blank" rel="noreferrer" className={openLink}>Asana<ExternalLink className="h-3 w-3" /></a>}
    </div>
  </Item>;
}

function PortcoStrip({ p, website }: { p: BriefPortco; website: string }) {
  return <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <BriefLogo name={p.name} website={website} size="sm" />
      <Link to="/portfolio" className="font-semibold text-foreground hover:text-primary">{p.name}</Link>
      {p.badge && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${BADGE[p.badge]}`}>{p.badge}</span>}
      {p.stage && <Badge variant="outline" className="text-[10px]">{p.stage}</Badge>}
    </div>
    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground sm:grid-cols-4">
      <span>Ownership <b className="text-foreground">{p.ownership}</b></span>
      <span>Invested <b className="text-foreground">{p.investment}</b></span>
      <span>Round <b className="text-foreground">{p.round}</b></span>
      <span className="truncate">Investors <b className="text-foreground">{p.investors}</b></span>
    </div>
    {p.workstreams.length > 0 && <div className="mt-2 border-t border-border pt-2">
      <Label icon={GitBranch}>Open workstreams</Label>
      {p.workstreams.map((w, i) => <WorkstreamItem key={w.gid || i} w={w} />)}
    </div>}
  </div>;
}

function CompanyStrip({ c }: { c: BriefCompany }) {
  return <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-semibold text-foreground">{c.name}</span>
      {c.domain && <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{c.domain}</a>}
    </div>
    {c.about && <p className="mt-1 text-foreground">{c.about}{c.aboutSource === "web" && c.sources.length ? <span className="text-muted-foreground"> · via {c.sources.join(", ")}</span> : c.aboutSource === "general" ? <span className="text-muted-foreground"> · general knowledge, not web-checked</span> : null}</p>}
    <div className="mt-1 text-muted-foreground">{c.totalContacts ? <>In Venture Pulse: {c.totalContacts} contact{c.totalContacts === 1 ? "" : "s"} — {c.contacts.map((p, i) => <span key={p.name}>{i ? ", " : ""}{p.contactId ? <Link to="/crm" search={{ contact: p.contactId }} className="text-foreground hover:text-primary">{p.name}</Link> : p.name}</span>)}</> : `No contacts at ${c.name} in Venture Pulse yet.`}</div>
  </div>;
}

type NewPerson = { name: string; title: string; company: string; email?: string };
const personKey = (p: { name: string; email?: string }) => (p.email || p.name).trim().toLowerCase();
/** Tab-separated rows for the reviewed paste flow; commas inside values would split columns. */
const cell = (s = "") => s.replace(/[\t,;\n]+/g, " ").trim();
export const briefPasteText = (people: NewPerson[]) => ["Name\tEmail\tCompany\tTitle", ...people.map((p) => [p.name, p.email, p.company, p.title].map(cell).join("\t"))].join("\n");

function AddButton({ p, added, onAdd }: { p: NewPerson; added: Set<string>; onAdd: (p: NewPerson[]) => void }) {
  if (added.has(personKey(p))) return <Badge variant="secondary" className="ml-1 text-[10px]">Added</Badge>;
  return <Button size="sm" variant="outline" className="ml-1 h-5 px-1.5 text-[10px]" onClick={() => onAdd([p])}><UserPlus className="mr-1 h-3 w-3" />Add to Venture Pulse</Button>;
}

function MeetingCard({ m, added, onAdd, websites }: { m: BriefMeeting; added: Set<string>; onAdd: (p: NewPerson[]) => void; websites: Map<string, string> }) {
  const siteOf = (p: BriefPortco) => p.website || websites.get(normName(p.name)) || "";
  const subject = m.company ? { name: m.company.name, domain: m.company.domain, website: "" } : m.portcos[0] ? { name: m.portcos[0].name, domain: "", website: siteOf(m.portcos[0]) } : null;
  const related = m.related || [];
  const hasVp = m.people.length + m.actions.length + m.notes.length + m.events.length + related.length > 0;
  return <article className="overflow-hidden rounded-xl border border-border bg-card">
    <header className="flex items-start gap-3 border-b border-border bg-muted/30 px-4 py-3">
      {subject ? <BriefLogo name={subject.name} domain={subject.domain} website={subject.website} size="lg" />
        : <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-background"><CalendarClock className="h-5 w-5 text-muted-foreground" /></span>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">{m.time}</span>
          <h3 className="font-display text-sm font-semibold text-foreground">{m.title}</h3>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {m.tags.map((t) => <span key={t} className="rounded border border-border px-1.5">{t}</span>)}
          {(m.platform || m.duration) && <span className="inline-flex items-center gap-1"><Video className="h-3 w-3" />{[m.platform, m.duration].filter(Boolean).join(" · ")}</span>}
        </div>
      </div>
    </header>
    <div className="space-y-3 p-4">
      {m.company && <CompanyStrip c={m.company} />}
      {m.portcos.map((p) => <PortcoStrip key={p.name} p={p} website={siteOf(p)} />)}
      {!!m.mentionedPortcos?.length && <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">PortCos mentioned:{m.mentionedPortcos.map((p) => <Link key={p.name} to="/portfolio" className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-foreground hover:text-primary"><BriefLogo name={p.name} website={websites.get(normName(p.name))} size="sm" />{p.name}{p.badge && <span className={`rounded px-1 text-[9px] font-bold ${BADGE[p.badge]}`}>{p.badge}</span>}</Link>)}</div>}
      {m.summary && <p className="text-sm text-foreground">{m.summary}</p>}
      <div className="grid rounded-lg border border-border md:grid-cols-2 md:divide-x md:divide-border max-md:divide-y max-md:divide-border">
        <div className="p-3 text-xs">
          <Label icon={Mail}>From your Outlook</Label>
          <p className="text-muted-foreground">{m.cowork || "Nothing from Outlook for this meeting."}</p>
        </div>
        <div className="space-y-2 p-3 text-xs">
          <Label icon={Sparkles}>From Venture Pulse</Label>
          {!hasVp && <p className="text-muted-foreground">No matching records yet.</p>}
          {m.people.length > 0 && <div>
            <Label icon={Users}>Contacts</Label>
            <ul className="space-y-1">{m.people.map((p) => <li key={p.name} className="flex items-start gap-2 px-1.5">
              <ContactAvatar contact={{ name: p.name, email: p.email || "", company: p.company }} size="sm" />
              <div className="min-w-0 flex-1">
                {p.contactId ? <Link to="/crm" search={{ contact: p.contactId }} className="font-medium text-foreground hover:text-primary">{p.name}</Link> : <span className="font-medium text-foreground">{p.name}</span>}
                {p.company ? <span className="text-muted-foreground">, {p.company}</span> : null}
                {p.status !== "matched" && p.email ? <span className="text-muted-foreground"> · {p.email}</span> : null}
                {p.status === "matched" ? <span className="text-muted-foreground"> · {p.temperature}{p.lastContact ? ` · last touch ${p.lastContact.slice(0, 10)}` : ""}{p.campaigns.length ? ` · in ${p.campaigns.join(", ")}` : ""}{p.events.length ? ` · met at ${p.events.slice(0, 2).join(", ")}` : ""}</span>
                  : p.status === "possible" ? <Badge variant="outline" className="ml-1 text-[10px]">possible match</Badge>
                  : <AddButton p={p} added={added} onAdd={onAdd} />}
              </div>
            </li>)}</ul>
          </div>}
          {m.actions.length > 0 && <div>
            <Label icon={ListChecks}>Open actions</Label>
            {m.actions.map((a, i) => <Item key={a.id || i} title={a.summary} meta={a.due ? <span className={`shrink-0 text-[10px] ${a.overdue ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{a.overdue ? "overdue " : "due "}{a.due}</span> : null}>
              <p>{[a.person, a.company, a.source].filter(Boolean).join(" · ") || "Follow-up"}</p>
              <Link to="/my-actions" search={a.id ? { tab: "actions", fu: a.id } : { tab: "actions" }} className={openLink}>Open in My Actions<ArrowRight className="h-3 w-3" /></Link>
            </Item>)}
          </div>}
          {related.length > 0 && <div>
            <Label icon={GitBranch}>Workstreams touching this meeting</Label>
            {related.map((w, i) => <WorkstreamItem key={w.gid || i} w={w} showCompany />)}
          </div>}
          {m.notes.length > 0 && <div>
            <Label icon={FileText}>Recent notes</Label>
            {m.notes.map((n, i) => <Item key={i} title={n.title} meta={<span className="shrink-0 text-[10px] text-muted-foreground">{n.date}</span>}>
              {n.summary ? <p className="whitespace-pre-line text-foreground">{n.summary}</p> : <p>No summary saved.</p>}
              {n.url && <a href={n.url} target="_blank" rel="noreferrer" className={openLink}>Open note<ExternalLink className="h-3 w-3" /></a>}
            </Item>)}
          </div>}
          {m.events.length > 0 && <div>
            <Label icon={CalendarDays}>Upcoming events</Label>
            <ul className="space-y-0.5 px-1.5">{m.events.map((e, i) => <li key={i}><span className="text-muted-foreground">{e.start}</span> <Link to="/events" search={{ event: e.name, cf: undefined }} className="text-foreground hover:text-primary">{e.name}</Link></li>)}</ul>
          </div>}
        </div>
      </div>
      {(m.worthChecking.length > 0 || m.prep.length > 0) && <div className="grid gap-3 border-t border-border pt-3 text-xs md:grid-cols-2">
        {m.worthChecking.length > 0 && <div className="rounded-lg bg-warning/10 p-3">
          <Label icon={AlertTriangle} tone="warn">Worth checking</Label>
          <ul className="list-disc space-y-0.5 pl-4 text-foreground">{m.worthChecking.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>}
        {m.prep.length > 0 && <div className="rounded-lg bg-primary/5 p-3">
          <Label icon={ListChecks}>Prep</Label>
          <ul className="list-disc space-y-0.5 pl-4 text-foreground">{m.prep.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>}
      </div>}
    </div>
  </article>;
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="rounded-xl border border-border bg-card p-4"><h2 className="mb-2 inline-flex items-center gap-2 font-display text-sm font-semibold text-foreground">{icon}{title}</h2>{children}</section>;
}

/** Day-at-a-glance numbers for the brief header. */
function briefKpis(b: MorningBrief) {
  const overdue = b.dueThisWeek.filter((d) => d.overdue).length;
  return [
    { label: "Meetings", value: b.meetings.length, icon: CalendarClock, hint: `${b.meetings.filter((m) => m.portcos.length).length} with PortCos` },
    { label: "Due this week", value: b.dueThisWeek.length, icon: ListChecks, hint: overdue ? `${overdue} overdue` : "none overdue", warn: overdue > 0 },
    { label: "Follow-ups", value: b.quiet.length, icon: Hourglass, hint: "gone quiet" },
    { label: "New people", value: b.newPeople.length, icon: UserPlus, hint: "not in Venture Pulse" },
    { label: "Campaigns", value: b.campaigns.length, icon: Megaphone, hint: "active" },
    { label: "DTC events", value: b.events.length, icon: CalendarDays, hint: b.events[0] ? `next ${b.events[0].start.slice(5)}` : "next 30 days" },
  ];
}

function KpiRow({ b }: { b: MorningBrief }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
    {briefKpis(b).map((k) => <div key={k.label} className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><k.icon className="h-3.5 w-3.5" />{k.label}</div>
      <div className="font-display text-xl font-semibold tabular-nums text-foreground">{k.value}</div>
      <div className={`truncate text-[10px] ${k.warn ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{k.hint}</div>
    </div>)}
  </div>;
}

/** Homepage pane: KPIs and today's line; expands in place into the scrollable brief. */
export function MorningBriefPanel() {
  const q = useBriefs(1);
  const websites = usePortcoWebsites();
  const [open, setOpen] = useState(false);
  if (!q.data?.owner) return null;
  const row = q.data.briefs[0];
  const b = row?.brief;
  return <section aria-label="Morning Brief" className="rounded-xl border border-border bg-card p-4">
    <div className="flex items-center justify-between gap-2">
      <h2 className="inline-flex items-center gap-2 font-display text-sm font-semibold text-foreground"><Sun className="h-4 w-4 text-primary" />Morning Brief{row ? <span className="text-xs font-normal text-muted-foreground">{row.date}</span> : null}</h2>
      <div className="flex items-center gap-1">
        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground"><Link to="/brief">Full page<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
        {b && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" aria-expanded={open} aria-controls="morning-brief-body" onClick={() => setOpen((o) => !o)}>
          {open ? <>Collapse<ChevronUp className="ml-1 h-3.5 w-3.5" /></> : <>Expand brief<ChevronDown className="ml-1 h-3.5 w-3.5" /></>}
        </Button>}
      </div>
    </div>
    {b ? <div className="mt-3 space-y-3">
      <KpiRow b={b} />
      <p className="text-sm text-foreground">{b.glance}</p>
      {open ? <div id="morning-brief-body" className="max-h-[75vh] overflow-y-auto rounded-lg border border-border bg-muted/20 p-3">
        <MorningBriefView embedded />
      </div> : <div className="flex flex-wrap gap-1.5">
        {b.meetings.map((m, i) => {
          const name = m.company?.name || m.portcos[0]?.name || "";
          return <button key={i} type="button" onClick={() => setOpen(true)} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background py-0.5 pl-1 pr-2.5 text-xs text-foreground hover:border-primary">
            {name ? <BriefLogo name={name} domain={m.company?.domain} website={m.portcos[0] ? m.portcos[0].website || websites.get(normName(m.portcos[0].name)) : ""} size="sm" /> : <CalendarClock className="h-4 w-4 text-muted-foreground" />}
            <span className="font-semibold tabular-nums text-primary">{m.time}</span>
            <span className="truncate">{m.title}</span>
            {m.portcos[0]?.badge && <span className={`rounded px-1 text-[9px] font-bold ${BADGE[m.portcos[0].badge]}`}>{m.portcos[0].badge}</span>}
          </button>;
        })}
      </div>}
    </div> : <p className="mt-2 text-sm text-muted-foreground">{row?.status === "failed" ? `Today's brief couldn't be built: ${row.error}` : row?.status === "building" ? "Building today's brief…" : "Today's brief will appear after Claude Cowork's 5 AM email arrives."}</p>}
  </section>;
}

export function MorningBriefView({ date, add, embedded }: { date?: string; add?: string; embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const q = useBriefs(14);
  const websites = usePortcoWebsites();
  const rebuild = useServerFn(rebuildMorningBrief);
  const send = useServerFn(emailMorningBrief);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "build" | "mail">("");
  const [adding, setAdding] = useState<NewPerson[] | null>(null);
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  // "Add to Venture Pulse" link from the emailed brief: open that person's review once the briefs load.
  const handledLink = useRef(false);
  useEffect(() => {
    if (handledLink.current || !add || !q.data?.briefs?.length) return;
    handledLink.current = true;
    const want = add.toLowerCase();
    const rows = q.data.briefs;
    const target = rows.find((r) => r.date === date) || rows[0];
    const ordered = [target, ...rows.filter((r) => r !== target)];
    for (const r of ordered) {
      const p = r.brief?.newPeople.find((x) => personKey(x) === want || x.name.toLowerCase() === want);
      if (p) { setPick(r.id); setAdding([p]); return; }
    }
    toast.info("That person is no longer listed as new — they may already be in Venture Pulse.");
  }, [add, date, q.data]);
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading brief…</p>;
  if (!q.data?.owner) return <p className="text-sm text-muted-foreground">The Morning Brief is set up for Chris only for now.</p>;
  const rows: BriefRow[] = q.data.briefs;
  const row = rows.find((r) => r.id === pick) || rows[0];
  const b: MorningBrief | null = row?.brief || null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["morning-briefs"] });
  const doBuild = async () => {
    setBusy("build");
    try { const r = await rebuild({ data: { force: true, sendEmail: false } }); if (!r.ok) toast.error("error" in r ? String(r.error) : "Build failed"); else if ("skipped" in r && r.skipped) toast.info(`Not rebuilt: ${r.skipped}`); else toast.success("Brief rebuilt"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Build failed"); }
    finally { setBusy(""); setPick(null); refresh(); }
  };
  const doSend = async () => {
    if (!row) return;
    setBusy("mail");
    try { const r = await send({ data: { id: row.id } }); r.ok ? toast.success("Sent to your Dell inbox") : toast.error(String(r.error)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Send failed"); }
    finally { setBusy(""); refresh(); }
  };
  const remaining = b ? b.newPeople.filter((p) => !added.has(personKey(p))) : [];
  const onAdd = (ps: NewPerson[]) => setAdding(ps);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Brief date" className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={row?.id || ""} onChange={(e) => setPick(e.target.value)}>
        {rows.map((r) => <option key={r.id} value={r.id}>{r.date}{r.status !== "ready" ? ` (${r.status})` : ""}</option>)}
      </select>
      <Button size="sm" variant="outline" onClick={doBuild} disabled={!!busy}><RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy === "build" ? "animate-spin" : ""}`} />Rebuild today</Button>
      <Button size="sm" variant="outline" onClick={doSend} disabled={!!busy || !b}><Mail className="mr-1 h-3.5 w-3.5" />Email to Dell</Button>
      {remaining.length > 1 && <Button size="sm" onClick={() => onAdd(remaining)}><UserPlus className="mr-1 h-3.5 w-3.5" />Add all {remaining.length} to Venture Pulse</Button>}
      {row && <span className="text-xs text-muted-foreground">Email: {row.emailStatus || "not sent"}{row.emailError ? ` — ${row.emailError}` : ""}</span>}
    </div>
    {!b ? <p className="text-sm text-muted-foreground">{row ? (row.status === "failed" ? `Couldn't build: ${row.error}` : row.error || "Waiting for Claude Cowork's email.") : "No briefs yet. They appear after Claude Cowork's 5 AM email arrives."}</p> : <>
      {!embedded && <KpiRow b={b} />}
      <section className="rounded-xl border border-border bg-card p-4">
        {!embedded && <p className="text-sm text-foreground">{b.glance}</p>}
        <div className={`${embedded ? "" : "mt-2 "}text-[11px] font-semibold uppercase tracking-wide text-muted-foreground`}>Top priorities</div>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">{b.priorities.map((p, i) => <li key={i}>{p}</li>)}</ol>
        {b.warnings.length > 0 && <p className="mt-2 inline-flex items-center gap-1 text-xs text-warning-foreground"><AlertTriangle className="h-3.5 w-3.5" />{b.warnings.join(", ")}</p>}
      </section>
      {b.meetings.map((m, i) => <MeetingCard key={i} m={m} added={added} onAdd={onAdd} websites={websites} />)}
      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Due this week" icon={<ListChecks className="h-4 w-4 text-primary" />}>
          {b.dueThisWeek.length ? <ul className="space-y-1 text-xs">{b.dueThisWeek.map((d, i) => <li key={d.id || i}><span className={d.overdue ? "font-semibold text-destructive" : "text-muted-foreground"}>{d.due}</span> {d.id ? <Link to="/my-actions" search={{ tab: "actions", fu: d.id }} className="text-foreground hover:text-primary">{d.summary}</Link> : d.summary}{d.person ? ` · ${d.person}` : ""}</li>)}</ul> : <p className="text-xs text-muted-foreground">Nothing due.</p>}
          <Link to="/my-actions" className="mt-2 inline-block text-xs text-primary">Open My Actions</Link>
        </Section>
        <Section title="Anticipated follow-ups" icon={<Hourglass className="h-4 w-4 text-primary" />}>
          {b.quiet.length ? <ul className="space-y-1.5 text-xs">{b.quiet.map((q2, i) => <li key={i}>{q2.link ? <a href={q2.link} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:text-primary">{q2.label}</a> : <span className="font-medium text-foreground">{q2.label}</span>} — <span className="text-muted-foreground">{q2.detail}</span>{q2.nextStep && <div className="italic text-foreground">{q2.nextStep}</div>}</li>)}</ul> : <p className="text-xs text-muted-foreground">Nothing has gone quiet.</p>}
        </Section>
        <Section title="Active campaigns" icon={<Megaphone className="h-4 w-4 text-primary" />}>
          {b.campaigns.length ? <ul className="space-y-1 text-xs">{b.campaigns.map((c) => <li key={c.id}><Link to="/campaigns" search={{ campaign: c.id }} className="font-medium text-foreground hover:text-primary">{c.name}</Link> <span className="text-muted-foreground">· {c.contacted}/{c.members} contacted{c.inToday.length ? ` · today: ${c.inToday.join(", ")}` : ""}</span></li>)}</ul> : <p className="text-xs text-muted-foreground">No active campaigns.</p>}
        </Section>
        <Section title="Next DTC events" icon={<CalendarDays className="h-4 w-4 text-primary" />}>
          {b.events.length ? <ul className="space-y-1 text-xs">{b.events.map((e) => <li key={e.urid}><span className="text-muted-foreground">{e.start}</span> <Link to="/events" search={{ event: e.urid, cf: undefined }} className="font-medium text-foreground hover:text-primary">{e.name}</Link>{e.location ? ` · ${e.location}` : ""}{e.portcos.length ? ` · ${e.portcos.join(", ")}` : ""}{e.todaysPeople.length ? ` · with ${e.todaysPeople.join(", ")}` : ""}</li>)}</ul> : <p className="text-xs text-muted-foreground">No events in the next 30 days.</p>}
        </Section>
      </div>
      {(b.gaps || b.newPeople.length > 0) && <Section title="Gaps" icon={<AlertTriangle className="h-4 w-4 text-primary" />}>
        {b.gaps && <p className="text-xs text-muted-foreground">{b.gaps}</p>}
        {b.newPeople.length > 0 && <div className="mt-1 text-xs">
          <div className="text-foreground">Not in Venture Pulse yet:</div>
          <ul className="mt-1 space-y-1">{b.newPeople.map((p) => <li key={personKey(p)} className="flex flex-wrap items-center gap-x-1">
            <span className="font-medium text-foreground">{p.name}</span>
            <span className="text-muted-foreground">{[p.company, p.title].filter(Boolean).join(" · ")}{p.email ? ` · ${p.email}` : " · no email from Claude"}</span>
            <AddButton p={p} added={added} onAdd={onAdd} />
          </li>)}</ul>
        </div>}
      </Section>}
    </>}
    <SmartPasteDialog open={!!adding} onOpenChange={(o) => { if (!o) setAdding(null); }} initialText={adding ? briefPasteText(adding) : ""}
      onImported={() => { const ks = (adding || []).map(personKey); setAdded((s) => new Set([...s, ...ks])); }} />
  </div>;
}

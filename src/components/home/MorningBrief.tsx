import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Building2, CalendarDays, Mail, Megaphone, RefreshCw, Sun, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SmartPasteDialog } from "@/components/crm/SmartPasteDialog";
import { emailMorningBrief, fetchMorningBriefs, rebuildMorningBrief, type BriefRow } from "@/utils/morning-brief.functions";
import type { BriefCompany, BriefMeeting, BriefPortco, MorningBrief } from "@/utils/morning-brief.server";

export const briefQueryKey = (limit: number) => ["morning-briefs", limit] as const;

export function useBriefs(limit: number) {
  const fetchBriefs = useServerFn(fetchMorningBriefs);
  return useQuery({ queryKey: briefQueryKey(limit), queryFn: () => fetchBriefs({ data: { limit } }), staleTime: 60_000 });
}

const BADGE: Record<string, string> = { NM: "bg-success/15 text-success", NU: "bg-warning/20 text-warning-foreground", BB: "bg-destructive/15 text-destructive" };

/** Compact homepage card; renders nothing for teammates without a brief. */
export function MorningBriefPanel() {
  const q = useBriefs(1);
  if (!q.data?.owner) return null;
  const row = q.data.briefs[0];
  const b = row?.brief;
  return <section aria-label="Morning Brief" className="rounded-lg border border-border bg-card p-4">
    <div className="flex items-center justify-between gap-2">
      <h2 className="inline-flex items-center gap-2 font-display text-sm font-semibold text-foreground"><Sun className="h-4 w-4 text-primary" />Morning Brief{row ? <span className="text-xs font-normal text-muted-foreground">{row.date}</span> : null}</h2>
      <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground"><Link to="/brief">Open brief<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
    </div>
    {b ? <div className="mt-2 grid gap-3 md:grid-cols-[1fr_1fr]">
      <div>
        <p className="text-sm text-foreground">{b.glance}</p>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{b.meetings.slice(0, 5).map((m, i) => <li key={i} className="truncate"><span className="font-medium text-foreground">{m.time}</span> · {m.title}{m.portcos[0]?.badge ? ` [${m.portcos[0].badge}]` : ""}</li>)}</ul>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top priorities</div>
        <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs text-foreground">{b.priorities.slice(0, 3).map((p, i) => <li key={i}>{p}</li>)}</ol>
        <div className="mt-2 text-xs text-muted-foreground">{b.dueThisWeek.length} due this week · {b.quiet.length} gone quiet</div>
      </div>
    </div> : <p className="mt-2 text-sm text-muted-foreground">{row?.status === "failed" ? `Today's brief couldn't be built: ${row.error}` : row?.status === "building" ? "Building today's brief…" : "Today's brief will appear after Claude Cowork's 5 AM email arrives."}</p>}
  </section>;
}

function PortcoStrip({ p }: { p: BriefPortco }) {
  return <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <Link to="/portfolio" className="font-semibold text-foreground hover:text-primary">{p.name}</Link>
      {p.badge && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${BADGE[p.badge]}`}>{p.badge}</span>}
      {p.stage && <Badge variant="outline" className="text-[10px]">{p.stage}</Badge>}
    </div>
    <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground sm:grid-cols-4">
      <span>Ownership <b className="text-foreground">{p.ownership}</b></span>
      <span>Invested <b className="text-foreground">{p.investment}</b></span>
      <span>Round <b className="text-foreground">{p.round}</b></span>
      <span className="truncate">Investors <b className="text-foreground">{p.investors}</b></span>
    </div>
    {p.workstreams.length > 0 && <ul className="mt-1.5 space-y-0.5">{p.workstreams.map((w, i) => <li key={i}><span className="text-foreground">{w.name}</span> · {w.status}{w.priority ? ` · ${w.priority}` : ""}{w.lastActivity ? ` · updated ${w.lastActivity}` : ""}{w.update ? <div className="text-muted-foreground">{w.update}</div> : null}</li>)}</ul>}
  </div>;
}

function CompanyStrip({ c }: { c: BriefCompany }) {
  return <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-semibold text-foreground">{c.name}</span>
      {c.domain && <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{c.domain}</a>}
    </div>
    {c.about && <p className="mt-1 text-foreground">{c.about}{c.aboutSource === "web" && c.sources.length ? <span className="text-muted-foreground"> · via {c.sources.join(", ")}</span> : c.aboutSource === "general" ? <span className="text-muted-foreground"> · general knowledge, not web-checked</span> : null}</p>}
    <div className="mt-1 text-muted-foreground">{c.totalContacts ? <>In Venture Pulse: {c.totalContacts} contact{c.totalContacts === 1 ? "" : "s"} — {c.contacts.map((p, i) => <span key={p.name}>{i ? ", " : ""}{p.contactId ? <Link to="/crm" search={{ contact: p.contactId }} className="text-foreground hover:text-primary">{p.name}</Link> : p.name}</span>)}</> : `No contacts at ${c.name} in Venture Pulse yet.`}</div>
  </div>;
}

function List({ title, items, tone }: { title: string; items: string[]; tone?: "warn" }) {
  if (!items.length) return null;
  return <div className={tone === "warn" ? "text-warning-foreground" : ""}>
    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
    <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
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

function MeetingCard({ m, added, onAdd }: { m: BriefMeeting; added: Set<string>; onAdd: (p: NewPerson[]) => void }) {
  return <article className="space-y-2 rounded-lg border border-border bg-card p-4">
    <header>
      <div className="font-display text-sm font-semibold text-foreground">{m.time} · {m.title}</div>
      <div className="text-[11px] text-muted-foreground">{[...m.tags, m.platform, m.duration].filter(Boolean).join(" · ")}</div>
    </header>
    {m.company && <CompanyStrip c={m.company} />}
    {m.portcos.map((p) => <PortcoStrip key={p.name} p={p} />)}
    {!!m.mentionedPortcos?.length && <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">PortCos mentioned:{m.mentionedPortcos.map((p) => <Link key={p.name} to="/portfolio" className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-foreground hover:text-primary">{p.name}{p.badge && <span className={`rounded px-1 text-[9px] font-bold ${BADGE[p.badge]}`}>{p.badge}</span>}</Link>)}</div>}
    {m.summary && <p className="text-sm text-foreground">{m.summary}</p>}
    <div className="grid gap-3 md:grid-cols-2">
      <div className="text-xs"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">From your Outlook</div><p className="mt-0.5 text-muted-foreground">{m.cowork}</p></div>
      <div className="space-y-2 text-xs">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">From Venture Pulse</div>
        {m.people.length > 0 && <ul className="space-y-0.5">{m.people.map((p) => <li key={p.name}>
          {p.contactId ? <Link to="/crm" search={{ contact: p.contactId }} className="font-medium text-foreground hover:text-primary">{p.name}</Link> : <span className="font-medium text-foreground">{p.name}</span>}
          {p.company ? `, ${p.company}` : ""}
          {p.status !== "matched" && p.email ? <span className="text-muted-foreground"> · {p.email}</span> : null}
          {p.status === "matched" ? <span className="text-muted-foreground"> · {p.temperature}{p.lastContact ? ` · last touch ${p.lastContact.slice(0, 10)}` : ""}{p.campaigns.length ? ` · in ${p.campaigns.join(", ")}` : ""}{p.events.length ? ` · met at ${p.events.slice(0, 2).join(", ")}` : ""}</span>
            : p.status === "possible" ? <Badge variant="outline" className="ml-1 text-[10px]">possible match</Badge>
            : <AddButton p={p} added={added} onAdd={onAdd} />}
        </li>)}</ul>}
        <List title="Open actions" items={m.actions.map((a) => `${a.summary}${a.due ? ` (due ${a.due}${a.overdue ? ", overdue" : ""})` : ""}`)} />
        <List title="Recent notes" items={m.notes.map((n) => `${n.date} ${n.title}`)} />
        <List title="Upcoming events" items={m.events.map((e) => `${e.start} ${e.name}`)} />
      </div>
    </div>
    <List title="Worth checking" items={m.worthChecking} tone="warn" />
    <List title="Prep" items={m.prep} />
  </article>;
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-lg border border-border bg-card p-4"><h2 className="mb-2 inline-flex items-center gap-2 font-display text-sm font-semibold text-foreground">{icon}{title}</h2>{children}</section>;
}

export function MorningBriefView({ date, add }: { date?: string; add?: string } = {}) {
  const qc = useQueryClient();
  const q = useBriefs(14);
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
      <section className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-foreground">{b.glance}</p>
        <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Top priorities</div>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">{b.priorities.map((p, i) => <li key={i}>{p}</li>)}</ol>
        {b.warnings.length > 0 && <p className="mt-2 inline-flex items-center gap-1 text-xs text-warning-foreground"><AlertTriangle className="h-3.5 w-3.5" />{b.warnings.join(", ")}</p>}
      </section>
      {b.meetings.map((m, i) => <MeetingCard key={i} m={m} added={added} onAdd={onAdd} />)}
      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Due this week" icon={<CalendarDays className="h-4 w-4 text-primary" />}>
          {b.dueThisWeek.length ? <ul className="space-y-1 text-xs">{b.dueThisWeek.map((d, i) => <li key={i}><span className={d.overdue ? "font-semibold text-destructive" : "text-muted-foreground"}>{d.due}</span> {d.summary}{d.person ? ` · ${d.person}` : ""}</li>)}</ul> : <p className="text-xs text-muted-foreground">Nothing due.</p>}
          <Link to="/my-actions" className="mt-2 inline-block text-xs text-primary">Open My Actions</Link>
        </Section>
        <Section title="Anticipated follow-ups" icon={<AlertTriangle className="h-4 w-4 text-primary" />}>
          {b.quiet.length ? <ul className="space-y-1.5 text-xs">{b.quiet.map((q2, i) => <li key={i}><span className="font-medium text-foreground">{q2.label}</span> — <span className="text-muted-foreground">{q2.detail}</span>{q2.nextStep && <div className="italic text-foreground">{q2.nextStep}</div>}</li>)}</ul> : <p className="text-xs text-muted-foreground">Nothing has gone quiet.</p>}
        </Section>
        <Section title="Active campaigns" icon={<Megaphone className="h-4 w-4 text-primary" />}>
          {b.campaigns.length ? <ul className="space-y-1 text-xs">{b.campaigns.map((c) => <li key={c.id}><Link to="/campaigns" className="font-medium text-foreground hover:text-primary">{c.name}</Link> <span className="text-muted-foreground">· {c.contacted}/{c.members} contacted{c.inToday.length ? ` · today: ${c.inToday.join(", ")}` : ""}</span></li>)}</ul> : <p className="text-xs text-muted-foreground">No active campaigns.</p>}
        </Section>
        <Section title="Next DTC events" icon={<CalendarDays className="h-4 w-4 text-primary" />}>
          {b.events.length ? <ul className="space-y-1 text-xs">{b.events.map((e) => <li key={e.urid}><span className="text-muted-foreground">{e.start}</span> <span className="font-medium text-foreground">{e.name}</span>{e.location ? ` · ${e.location}` : ""}{e.portcos.length ? ` · ${e.portcos.join(", ")}` : ""}{e.todaysPeople.length ? ` · with ${e.todaysPeople.join(", ")}` : ""}</li>)}</ul> : <p className="text-xs text-muted-foreground">No events in the next 30 days.</p>}
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

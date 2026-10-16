import type React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Plus, Undo2, Zap } from "lucide-react";
import { CompanyLogo } from "@/components/dashboard/WorkstreamSummary";
import { fetchPortfolioCompanies } from "@/utils/sheets.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { createWorkstreamFn } from "@/utils/asana.functions";
import { useAuth } from "@/lib/auth-context";
import { teamMemberFor, teamProfile } from "@/lib/user-ownership";
import { ACTION_OWNERS, ownerMatches } from "@/lib/action-owners";
import { useWorkstreams } from "@/lib/use-workstreams";
import { isWorkstreamCompleted, workstreamBarStatus } from "@/lib/workstream-parse";
import { NotesImports } from "@/components/knowledge/NotesImports";
import { WorkstreamDetail, statusTone } from "@/components/portfolio/WorkstreamsPanel";
import { ActionComposer, type ActionContext } from "@/components/actions/ActionComposer";
import { fetchHomeMomentum } from "@/utils/home.functions";
import { listDoneActionsFn, undoActionFn } from "@/utils/actions.functions";
import type { NoteInboxItem } from "@/utils/notes-inbox.server";

const TABS = ["workstreams", "notes", "followups", "done"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/my-actions")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab; owner?: string; ws?: string } => ({
    ws: typeof s.ws === "string" ? s.ws : undefined,
    tab: TABS.includes(s.tab as Tab) ? (s.tab as Tab) : undefined,
    owner: typeof s.owner === "string" ? s.owner : undefined,
  }),
  head: () => ({
    meta: [
      { title: "My Actions — VenturePulse" },
      { name: "description", content: "Your inbox of workstreams, notes, activity and follow-ups, with Action Now follow-up emails." },
      { property: "og:title", content: "My Actions — VenturePulse" },
      { property: "og:description", content: "Your inbox of workstreams, notes, activity and follow-ups." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyActionsPage,
});

const fromNote = (i: NoteInboxItem, kind: "note" | "activity"): ActionContext => ({
  sourceKind: kind, sourceId: i.recordId, title: i.title,
  text: i.summary,
  nextSteps: i.nextSteps.map((n) => `${n.who ? `${n.who}: ` : ""}${n.action}${n.dueDate ? ` (by ${n.dueDate})` : ""}`),
  people: i.people.filter((p) => p.where !== "Team").map((p) => ({ name: p.name, email: p.email })),
  portcos: (i.portco || "").split(/\s*[,;]\s*/).filter(Boolean),
  tracks: (["BD", "GTM"] as const).filter((t) => i.track === t),
});

function MyActionsPage() {
  const { email } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: Tab = search.tab || "notes";
  const owner = ACTION_OWNERS.find((o) => o.name === search.owner)?.name || teamProfile(email)?.displayName || "";
  const [ctx, setCtx] = useState<ActionContext | null>(null);
  const [counts, setCounts] = useState({ notes: 0, activity: 0 });
  const qc = useQueryClient();
  const set = (p: { tab?: Tab; owner?: string }) => navigate({ search: (s) => ({ ...s, ...p }), replace: true });

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">My Actions</h1>
          <p className="text-sm text-muted-foreground">Review what came in, then follow up with Action Now.</p>
        </div>
        <Select value={owner} onValueChange={(v) => set({ owner: v })}>
          <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Action owner" /></SelectTrigger>
          <SelectContent>{ACTION_OWNERS.map((o) => <SelectItem key={o.name} value={o.name}>{o.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="inline-flex flex-wrap rounded-md border border-border p-0.5">
        {TABS.map((k) => (
          <button key={k} onClick={() => set({ tab: k })} className={`rounded px-3 py-1.5 text-sm ${tab === k ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}>
            {k === "workstreams" ? "Workstreams" : k === "notes" ? "Notes & Activity" : k === "followups" ? "Follow-ups" : "Done"}
            {k === "notes" && <span className="ml-1.5 rounded bg-muted px-1.5 text-xs text-muted-foreground">{counts.notes + counts.activity}</span>}
          </button>
        ))}
      </div>

      {!owner ? <p className="text-sm text-muted-foreground">Pick an action owner to see their inbox.</p> : <>
        {tab === "workstreams" && <WorkstreamsTab owner={owner} onAction={setCtx} focusGid={search.ws} />}
        {tab === "notes" && <NotesTab owner={owner} onAction={setCtx} onCounts={setCounts} />}
        {tab === "followups" && <FollowUpsTab owner={owner} onAction={setCtx} />}
        {tab === "done" && <DoneTab owner={owner} />}
      </>}

      <ActionComposer ctx={ctx} onClose={() => setCtx(null)} onDone={() => { void qc.invalidateQueries({ queryKey: ["my-actions"] }); }} />
    </div>
  );
}

function NotesTab({ owner, onAction, onCounts }: { owner: string; onAction: (c: ActionContext) => void; onCounts: (c: { notes: number; activity: number }) => void }) {
  const [sub, setSub] = useState<"notes" | "activity">("notes");
  const [n, setN] = useState({ notes: 0, activity: 0 });
  const update = (k: "notes" | "activity", v: number) => setN((c) => { const next = { ...c, [k]: v }; onCounts(next); return next; });
  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-md border border-border p-0.5">
        {(["notes", "activity"] as const).map((k) => (
          <button key={k} onClick={() => setSub(k)} className={`rounded px-3 py-1 text-sm ${sub === k ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}>
            {k === "notes" ? "Notes Imports" : "Activity Review"}<span className="ml-1.5 rounded bg-muted px-1.5 text-xs text-muted-foreground">{n[k]}</span>
          </button>
        ))}
      </div>
      <div className={sub === "notes" ? "" : "hidden"}><NotesImports actionOwner={owner} onStats={(s) => update("notes", s.pending)} onActionNow={(i) => onAction(fromNote(i, "note"))} split /></div>
      <div className={sub === "activity" ? "" : "hidden"}><NotesImports kind="activity" actionOwner={owner} onStats={(s) => update("activity", s.pending)} onActionNow={(i) => onAction(fromNote(i, "activity"))} split /></div>
    </div>
  );
}

function SplitPane({ list, detail }: { list: React.ReactNode; detail: React.ReactNode }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(280px,2fr)_3fr]">
      <Card><CardContent className="max-h-[75vh] overflow-y-auto p-0">{list}</CardContent></Card>
      <Card className="lg:sticky lg:top-4 self-start w-full"><CardContent className="max-h-[75vh] overflow-y-auto p-4">{detail}</CardContent></Card>
    </div>
  );
}

const rowCls = (on: boolean) => `block w-full px-3 py-2 text-left hover:bg-muted/40 ${on ? "bg-secondary/60" : ""}`;

function Logo({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const { data = [] } = useQuery({ queryKey: ["portfolio-companies"], queryFn: () => fetchPortfolioCompanies(), staleTime: 300_000 });
  const website = data.find((p) => p.name.toLowerCase().replace(/\s+/g, "") === name.toLowerCase().replace(/\s+/g, ""))?.website || "";
  return <span className={size === "sm" ? "[&>span]:h-6 [&>span]:w-6 [&_img]:h-full [&_img]:w-full" : ""}><CompanyLogo name={name} website={website} /></span>;
}

function WorkstreamsTab({ owner, onAction, focusGid }: { owner: string; onAction: (c: ActionContext) => void; focusGid?: string }) {
  const { workstreams, loading, refresh } = useWorkstreams();
  const [showDone, setShowDone] = useState(false);
  const [priority, setPriority] = useState("");
  const [creating, setCreating] = useState(false);
  const [selId, setSelId] = useState(focusGid || "");
  // Deep link (?ws=gid): select it, and show completed ones too if that's where it lives.
  useEffect(() => {
    if (!focusGid) return;
    setSelId(focusGid);
    const w = workstreams.find((x) => x.gid === focusGid);
    if (w && isWorkstreamCompleted(w)) setShowDone(true);
  }, [focusGid, workstreams]);
  const mine = useMemo(() => workstreams.filter((w) => ownerMatches(w.owner, owner)), [workstreams, owner]);
  const isDone = (w: (typeof mine)[number]) => isWorkstreamCompleted(w);
  const openCount = mine.filter((w) => !isDone(w)).length;
  const priorities = useMemo(() => [...new Set(mine.map((w) => w.workstreamPriority).filter(Boolean))].sort(), [mine]);
  const list = useMemo(() => mine.filter((w) => (showDone || !isDone(w)) && (!priority || w.workstreamPriority.toLowerCase() === priority.toLowerCase()))
    .sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name)), [mine, showDone, priority]); // eslint-disable-line react-hooks/exhaustive-deps
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const groups = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const w of list) m.set(w.company, [...(m.get(w.company) || []), w]);
    return [...m.entries()];
  }, [list]);
  const companies = useMemo(() => [...new Set(workstreams.map((w) => w.company).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [workstreams]);
  const sel = list.find((w) => w.gid === selId) || list[0];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Major workstreams · {openCount} active · {mine.length - openCount} complete</span>
        <div className="flex items-center gap-2">
          {priorities.length > 0 && (
            <div className="inline-flex rounded-md border border-border p-0.5">
              {["", ...priorities].map((p) => (
                <button key={p || "all"} onClick={() => setPriority(p)} className={`rounded px-2.5 py-1 ${priority === p ? "bg-secondary text-secondary-foreground" : ""}`}>{p || "All priorities"}</button>
              ))}
            </div>
          )}
          <div className="inline-flex rounded-md border border-border p-0.5">
            {[false, true].map((v) => (
              <button key={String(v)} onClick={() => setShowDone(v)} className={`rounded px-2.5 py-1 ${showDone === v ? "bg-secondary text-secondary-foreground" : ""}`}>{v ? "All" : "Active"}</button>
            ))}
          </div>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setCreating((c) => !c)}><Plus className="h-3.5 w-3.5 mr-1" />New workstream</Button>
        </div>
      </div>
      {creating && <NewWorkstreamForm companies={companies} onDone={(gid) => { setCreating(false); if (gid) { void refresh().then(() => setSelId(gid)); } }} />}
      {loading && <p className="text-sm text-muted-foreground">Loading workstreams…</p>}
      {!loading && !list.length && <p className="text-sm text-muted-foreground">No workstreams for {owner}.</p>}
      {list.length > 0 && <SplitPane
        list={<div className="divide-y divide-border">{groups.map(([company, items]) => {
          const isClosed = closed.has(company);
          return (
            <div key={company}>
              <button onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(company)) n.delete(company); else n.add(company); return n; })}
                className="flex w-full items-center gap-2 bg-muted/20 px-3 py-2 text-left hover:bg-muted/40">
                {isClosed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                <Logo name={company} size="sm" />
                <span className="flex-1 truncate text-sm font-semibold">{company || "No PortCo"}</span>
                <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{items.length}</span>
              </button>
              {!isClosed && <div className="divide-y divide-border">{items.map((w) => (
                <button key={w.gid} onClick={() => setSelId(w.gid)} className={`${rowCls(sel?.gid === w.gid)} pl-10`}>
                  <div className="truncate text-sm">{w.name || w.rawName}</div>
                  <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
                    <Badge variant="outline" className="text-[10px]">{w.segment}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${statusTone(workstreamBarStatus(w))}`}>{workstreamBarStatus(w)}</Badge>
                    {w.workstreamPriority && <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">{w.workstreamPriority}</Badge>}
                  </div>
                </button>
              ))}</div>}
            </div>
          );
        })}</div>}
        detail={sel && <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Logo name={sel.company} />
              <div className="min-w-0">
                <div className="font-display text-base font-semibold">{sel.name || sel.rawName}</div>
                <div className="text-xs text-muted-foreground">{sel.company} · {sel.segment}{sel.owner ? ` · ${sel.owner}` : ""}</div>
              </div>
            </div>
            <Button size="sm" className="h-8 shrink-0" onClick={() => onAction({
              sourceKind: "workstream", sourceId: `ws:${sel.gid}`, title: `${sel.company} – ${sel.name}`,
              text: [sel.notes, sel.traction, sel.dellStakeholders && `Dell stakeholders: ${sel.dellStakeholders}`, sel.lastActivity && `Last activity: ${sel.lastActivity}`].filter(Boolean).join("\n"),
              nextSteps: sel.nextSteps ? [sel.nextSteps] : [], people: [], portcos: [sel.company],
              tracks: sel.segment === "BD" || sel.segment === "GTM" ? [sel.segment] : [],
            })}><Zap className="h-3.5 w-3.5 mr-1" />Action Now</Button>
          </div>
          <WorkstreamDetail key={sel.gid} w={sel} />
        </div>}
      />}
    </div>
  );
}

/** Blank-sheet workstream creator: PortCo, segment and name — the rest is filled in via the detail editor. */
function NewWorkstreamForm({ companies, onDone }: { companies: string[]; onDone: (gid?: string) => void }) {
  const create = useServerFn(createWorkstreamFn);
  const [company, setCompany] = useState(companies[0] || "");
  const [segment, setSegment] = useState<"GTM" | "BD">("GTM");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!company || !name.trim()) return;
    setBusy(true);
    const res = await create({ data: { company, segment, name: name.trim() } }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(`Created "${res.workstream.rawName}" in Asana`);
    onDone(res.workstream.gid);
  };
  return (
    <Card><CardContent className="flex flex-wrap items-center gap-2 p-3">
      <Select value={company} onValueChange={setCompany}>
        <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="PortCo" /></SelectTrigger>
        <SelectContent>{companies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
      </Select>
      <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
        {(["GTM", "BD"] as const).map((s) => (
          <button key={s} onClick={() => setSegment(s)} className={`rounded px-2.5 py-1 ${segment === s ? "bg-secondary text-secondary-foreground" : ""}`}>{s}</button>
        ))}
      </div>
      <Input className="h-8 min-w-[220px] flex-1 text-xs" placeholder="Workstream name" value={name} onChange={(e) => setName(e.target.value)} />
      <Button size="sm" className="h-8" disabled={busy || !company || !name.trim()} onClick={submit}>Create in Asana</Button>
      <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => onDone()}>Cancel</Button>
    </CardContent></Card>
  );
}

function FollowUpsTab({ owner, onAction }: { owner: string; onAction: (c: ActionContext) => void }) {
  const ownerEmail = teamMemberFor(owner)?.email || "";
  const fetchHome = useServerFn(fetchHomeMomentum);
  const [selId, setSelId] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["my-actions", "followups", ownerEmail], queryFn: () => fetchHome({ data: { email: ownerEmail, scope: "mine" } }), enabled: !!ownerEmail, staleTime: 60_000 });
  const rows = [...(data?.reminders || [])].sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  if (!ownerEmail) return <p className="text-sm text-muted-foreground">No email on file for {owner}.</p>;
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading follow-ups…</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">No open follow-ups.</p>;
  const r = rows.find((x) => x.id === selId) || rows[0]!;
  return (
    <SplitPane
      list={<div className="divide-y divide-border">{rows.map((x) => (
        <button key={x.id} onClick={() => setSelId(x.id)} className={rowCls(r.id === x.id)}>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="shrink-0 text-[10px]">{x.source}</Badge>
            <span className="truncate text-sm font-medium">{x.person}{x.company ? ` · ${x.company}` : ""}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{x.due ? `Due ${x.due}` : "No date"} · {x.summary}</div>
        </button>
      ))}</div>}
      detail={<div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-display text-base font-semibold">{r.person}{r.company ? ` · ${r.company}` : ""}</div>
            <div className="text-xs text-muted-foreground">{r.source} · {r.due ? `Due ${r.due}` : "No date"}{r.email ? ` · ${r.email}` : ""}</div>
          </div>
          <div className="flex shrink-0 gap-2">
            {r.campaignId && <Button asChild size="sm" variant="ghost" className="h-8"><Link to="/campaigns">Campaign <ExternalLink className="h-3 w-3 ml-1" /></Link></Button>}
            <Button size="sm" className="h-8" onClick={() => onAction({
              sourceKind: "followup", sourceId: r.activityId || r.id, title: r.summary || `Follow-up with ${r.person}`,
              text: r.originalNote || r.summary, people: [{ name: r.person, email: r.email || "" }],
              portcos: r.source === "Notes" && r.company ? r.company.split(/\s*,\s*/) : [], followUpActivityId: r.activityId,
            })}><Zap className="h-3.5 w-3.5 mr-1" />Action Now</Button>
          </div>
        </div>
        {r.summary && <p className="text-sm">{r.summary}</p>}
        {r.originalNote && r.originalNote !== r.summary && <div className="whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm text-muted-foreground">{r.originalNote}</div>}
      </div>}
    />
  );
}

function DoneTab({ owner }: { owner: string }) {
  const list = useServerFn(listDoneActionsFn);
  const undo = useServerFn(undoActionFn);
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["my-actions", "done", owner], queryFn: () => list({ data: { owner } }), staleTime: 30_000 });
  return (
    <Card><CardContent className="p-0">
      {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !data.length && <p className="p-4 text-sm text-muted-foreground">Nothing completed with Action Now in the last 30 days.</p>}
      <div className="divide-y divide-border">
        {data.map((a) => (
          <div key={a.base} className="flex flex-wrap items-center gap-3 px-4 py-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <div className="min-w-[220px] flex-1">
              <div className="text-sm font-medium">{a.title}</div>
              <div className="text-xs text-muted-foreground">{a.date} · {a.person}{a.portco ? ` · ${a.portco}` : ""}{a.track ? ` · ${a.track}` : ""}</div>
            </div>
            <Button size="sm" variant="ghost" className="h-7" onClick={async () => {
              await undo({ data: { actionId: a.base, followUpActivityId: a.summary.includes("(followup)") ? a.recordId : undefined } });
              toast.success("Reopened"); void qc.invalidateQueries({ queryKey: ["my-actions"] });
            }}><Undo2 className="h-3.5 w-3.5 mr-1" />Undo</Button>
          </div>
        ))}
      </div>
    </CardContent></Card>
  );
}

import type React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Merge, Pencil, Plus, Trash2, Undo2, Zap } from "lucide-react";
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
import { FollowUpEditor } from "@/components/actions/FollowUpEditor";
import { ActionCalendar } from "@/components/actions/ActionCalendar";
import { inActionRange, type ActionDateRange } from "@/lib/action-calendar";
import { completeHomeNoteFollowUp, fetchHomeMomentum } from "@/utils/home.functions";
import { updateInteraction, clearContactFollowUpFlag } from "@/utils/sheets.functions";
import { completeActionFn, listDoneActionsFn, undoActionFn } from "@/utils/actions.functions";
import type { NoteInboxItem } from "@/utils/notes-inbox.server";

const TABS = ["workstreams", "followups", "notes", "done"] as const;
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
  const [followUpSort, setFollowUpSort] = useState<"portco" | "date">("portco");
  const [dateRange, setDateRange] = useState<ActionDateRange>(null);
  const qc = useQueryClient();
  const set = (p: { tab?: Tab; owner?: string }) => navigate({ search: (s) => ({ ...s, ...p }), replace: true });

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">My Actions</h1>
          <p className="text-sm text-muted-foreground">Review what came in, then follow up with Action Now.</p>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-4">
        {tab === "followups" && followUpSort === "date" && <ActionCalendar owner={owner} range={dateRange} onChange={setDateRange} />}
        <Select value={owner} onValueChange={(v) => set({ owner: v })}>
          <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Action owner" /></SelectTrigger>
          <SelectContent>{ACTION_OWNERS.map((o) => <SelectItem key={o.name} value={o.name}>{o.name}</SelectItem>)}</SelectContent>
        </Select>
        </div>
      </div>

      <div className="inline-flex flex-wrap rounded-md border border-border p-0.5">
        {TABS.map((k) => (
          <button key={k} onClick={() => set({ tab: k })} className={`rounded px-3 py-1.5 text-sm ${tab === k ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}>
            {k === "workstreams" ? "Workstreams" : k === "notes" ? "Notes & Activity" : k === "followups" ? "Follow-ups" : "Completed"}
            {k === "notes" && <span className="ml-1.5 rounded bg-muted px-1.5 text-xs text-muted-foreground">{counts.notes + counts.activity}</span>}
          </button>
        ))}
      </div>

      {!owner ? <p className="text-sm text-muted-foreground">Pick an action owner to see their inbox.</p> : <>
        {tab === "workstreams" && <WorkstreamsTab owner={owner} onAction={setCtx} focusGid={search.ws} />}
        {tab === "notes" && <NotesTab owner={owner} onAction={setCtx} onCounts={setCounts} />}
        {tab === "followups" && <FollowUpsTab owner={owner} onAction={setCtx} sort={followUpSort} setSort={setFollowUpSort} dateRange={dateRange} />}
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
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="min-w-0"><CardContent className="max-h-[75vh] overflow-x-hidden overflow-y-auto p-0">{list}</CardContent></Card>
      <Card className="min-w-0 lg:sticky lg:top-4 self-start w-full"><CardContent className="max-h-[75vh] overflow-x-hidden overflow-y-auto p-4 [overflow-wrap:anywhere]">{detail}</CardContent></Card>
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

type Reminder = NonNullable<Awaited<ReturnType<typeof fetchHomeMomentum>>["reminders"]>[number];
const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["follow", "with", "the", "and", "for"].includes(w)));
/** Two follow-ups look like the same action when they share the person, or most of their wording. */
function similarFollowUps(r: Reminder, all: Reminder[]): Reminder[] {
  const a = words(`${r.summary}`);
  return all.filter((x) => {
    if (x.id === r.id) return false;
    if (r.email && x.email && r.email.toLowerCase() === x.email.toLowerCase()) return true;
    const b = words(`${x.summary}`);
    const inter = [...a].filter((w) => b.has(w)).length;
    return inter >= 2 && inter / Math.max(1, Math.min(a.size, b.size)) >= 0.6;
  });
}
const weekOf = (d: string) => {
  if (!d) return "No date";
  const t = new Date(d.slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(t.getTime())) return "No date";
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return `Week of ${t.toISOString().slice(0, 10)}`;
};

function FollowUpsTab({ owner, onAction, sort, setSort, dateRange }: { owner: string; onAction: (c: ActionContext) => void; sort: "portco" | "date"; setSort: (s: "portco" | "date") => void; dateRange: ActionDateRange }) {
  const ownerEmail = teamMemberFor(owner)?.email || "";
  const fetchHome = useServerFn(fetchHomeMomentum);
  const completeNote = useServerFn(completeHomeNoteFollowUp);
  const updInteraction = useServerFn(updateInteraction);
  const clearFlag = useServerFn(clearContactFollowUpFlag);
  const completeAction = useServerFn(completeActionFn);
  const qc = useQueryClient();
  const [selId, setSelId] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSel, setMergeSel] = useState<string[]>([]);
  const [pick, setPick] = useState({ summary: "", person: "", due: "", company: "" });
  const [noteFor, setNoteFor] = useState("");
  const [noteText, setNoteText] = useState("");
  const [editFor, setEditFor] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["my-actions", "followups", ownerEmail], queryFn: () => fetchHome({ data: { email: ownerEmail, scope: "mine" } }), enabled: !!ownerEmail, staleTime: 60_000 });
  const allRows = [...(data?.reminders || [])].filter((x) => !hidden.has(x.id)).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const rows = allRows.filter((x) => sort !== "date" || inActionRange(x.due, dateRange));
  const groups = useMemo(() => {
    const m = new Map<string, Reminder[]>();
    for (const x of rows) {
      const k = sort === "portco" ? ((x.company || "").split(/\s*,\s*/)[0] || "No PortCo / Partner") : weekOf(x.due);
      m.set(k, [...(m.get(k) || []), x]);
    }
    return [...m.entries()].sort(([a], [b]) => sort === "date" ? (a === "No date" ? 1 : b === "No date" ? -1 : a.localeCompare(b)) : a.localeCompare(b));
  }, [rows, sort]);
  const mergeRows = mergeSel.map((id) => rows.find((x) => x.id === id)).filter(Boolean) as Reminder[];
  // Default each merged field to the first selected follow-up.
  useEffect(() => {
    if (mergeRows.length >= 2) setPick({ summary: mergeRows[0]!.id, person: mergeRows[0]!.id, due: mergeRows[0]!.id, company: mergeRows[0]!.id });
  }, [mergeSel.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ownerEmail) return <p className="text-sm text-muted-foreground">No email on file for {owner}.</p>;
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading follow-ups…</p>;
  if (!allRows.length) return <p className="text-sm text-muted-foreground">No open follow-ups.</p>;
  if (!rows.length) return <div className="space-y-3"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setSort("portco")}>PortCo / Partner</Button><Button variant="secondary" size="sm" onClick={() => setSort("date")}>Date</Button></div><p className="text-sm text-muted-foreground">No follow-ups on the selected dates.</p></div>;
  const r = rows.find((x) => x.id === selId) || rows[0];
  if (!r) return null;
  const canClose = (x: Reminder) =>
    !!x.activityId || (x.source === "Network" && !!x.email && (!!x.originalNote || x.id.startsWith("flag:")));
  /** Completes (or deletes) a follow-up where it lives. Returns false when it must be closed on its own page. */
  const closeOne = async (x: Reminder, del: boolean) => {
    if (x.activityId) return (await completeNote({ data: { activityId: x.activityId } })).success;
    if (x.source === "Network" && x.email && x.id.startsWith("flag:")) {
      return !!(await clearFlag({ data: { email: x.email } })).success;
    }
    if (x.source === "Network" && x.email && x.originalNote) {
      const res = await updInteraction({ data: { contactEmail: x.email, originalNote: x.originalNote, date: x.date, ...(del ? { requiresFollowUp: false } : { resolved: true }) } });
      return !!res.success;
    }
    return false;
  };
  /** Completes a follow-up and records a note about what was done (logged as an action). */
  const completeWithNote = async (x: Reminder, note: string) => {
    if (note.trim()) {
      await completeAction({ data: {
        sourceKind: "followup", sourceId: x.activityId || x.id, subject: x.summary || `Follow-up with ${x.person}`,
        recipients: [{ name: x.person, email: x.email || "" }], portcos: x.company ? x.company.split(/\s*,\s*/) : [],
        tracks: [], actor: owner, followUpActivityId: x.activityId || undefined, mode: "log", note: note.trim(),
      } });
    }
    return closeOne(x, false);
  };
  const act = async (items: Reminder[], del: boolean, label: string) => {
    setBusy(label);
    try {
      const ok: string[] = [];
      for (const x of items) if (await closeOne(x, del)) ok.push(x.id);
      setHidden((h) => new Set([...h, ...ok]));
      if (ok.length === items.length) toast.success(label);
      else toast.error(`${items.length - ok.length} couldn't be updated here — open them on their own page.`);
      void qc.invalidateQueries({ queryKey: ["my-actions"] });
    } catch (e) { console.error(e); toast.error("Couldn't update the follow-up"); }
    finally { setBusy(""); }
  };
  const toggleMerge = (id: string) => setMergeSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const doMerge = async () => {
    const keep = mergeRows.find((x) => x.id === pick.summary) || mergeRows[0]!;
    const chosenSummary = keep.summary || `Follow-up with ${keep.person}`;
    const chosenPerson = mergeRows.find((x) => x.id === pick.person)?.person || keep.person;
    const chosenDue = mergeRows.find((x) => x.id === pick.due)?.due || keep.due;
    const chosenCompany = mergeRows.find((x) => x.id === pick.company)?.company || keep.company;
    const note = `Merged ${mergeRows.length - 1} duplicate(s) into "${chosenSummary}" — ${chosenPerson}${chosenCompany ? ` · ${chosenCompany}` : ""}${chosenDue ? ` · due ${chosenDue.slice(0, 10)}` : ""}`;
    setBusy("Merging");
    try {
      const ok: string[] = [];
      for (const x of mergeRows.filter((m) => m.id !== keep.id)) if (await completeWithNote(x, note)) ok.push(x.id);
      setHidden((h) => new Set([...h, ...ok]));
      setMergeSel([]); setMergeMode(false); setSelId(keep.id);
      if (ok.length === mergeRows.length - 1) toast.success(`Merged into "${chosenSummary}"`);
      else toast.error("Some duplicates couldn't be closed here — open them on their own page.");
      void qc.invalidateQueries({ queryKey: ["my-actions"] });
    } catch (e) { console.error(e); toast.error("Couldn't merge"); }
    finally { setBusy(""); }
  };
  const similar = similarFollowUps(r, rows);
  const openLink = r.campaignId ? <Link to="/campaigns" search={{ campaign: r.campaignId } as never}>Open campaign <ExternalLink className="ml-1 h-3 w-3" /></Link>
    : r.source === "Prospecting" ? <Link to="/targeting" search={{ target: r.targetKey } as never}>Open in Prospecting <ExternalLink className="ml-1 h-3 w-3" /></Link>
    : r.email ? <Link to="/crm" search={{ contact: r.email } as never}>Open contact <ExternalLink className="ml-1 h-3 w-3" /></Link> : null;
  const mergeField = (label: string, key: keyof typeof pick, val: (x: Reminder) => string) => (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      {mergeRows.map((x) => (
        <label key={x.id} className="flex min-w-0 items-start gap-2 text-sm">
          <input type="radio" name={`merge-${key}`} checked={pick[key] === x.id} onChange={() => setPick((p) => ({ ...p, [key]: x.id }))} className="mt-1 shrink-0 accent-primary" />
          <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{val(x) || "—"}</span>
        </label>
      ))}
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Sort by</span>
        <div className="inline-flex rounded-md border border-border p-0.5">
          {(["portco", "date"] as const).map((k) => <button key={k} onClick={() => setSort(k)} className={`rounded px-3 py-1 text-sm ${sort === k ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}>{k === "portco" ? "PortCo / Partner" : "Date"}</button>)}
        </div>
        <Button size="sm" variant={mergeMode ? "secondary" : "outline"} className="h-7" onClick={() => { setMergeMode((m) => !m); setMergeSel([]); }}>
          <Merge className="mr-1 h-3.5 w-3.5" />{mergeMode ? `Merging (${mergeSel.length})` : "Merge"}
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} open</span>
      </div>
      <SplitPane
        list={<div className="divide-y divide-border">{groups.map(([g, items]) => {
          const isClosed = closed.has(g);
          return <div key={g}>
            <button onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(g)) n.delete(g); else n.add(g); return n; })} className="flex w-full items-center gap-2 bg-muted/20 px-3 py-2 text-left">
              {isClosed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              {sort === "portco" ? <Logo name={g} size="sm" /> : <CalendarDays className="h-4 w-4 text-muted-foreground" />}
              <span className="flex-1 truncate text-sm font-semibold">{g}</span>
              <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{items.length}</span>
            </button>
            {!isClosed && <div className="divide-y divide-border">{items.map((x) => (
              <button key={x.id} onClick={() => mergeMode ? toggleMerge(x.id) : setSelId(x.id)} className={`${rowCls(!mergeMode && r.id === x.id)} pl-9`}>
                <div className="flex min-w-0 items-start gap-2">
                  {mergeMode && <input type="checkbox" checked={mergeSel.includes(x.id)} readOnly className="h-3.5 w-3.5 shrink-0 accent-primary" />}
                  {x.company && <Logo name={x.company.split(/\s*,\s*/)[0]!} size="sm" />}
                  <div className="min-w-0 flex-1">
                  <span className="block text-sm font-medium [overflow-wrap:anywhere]">{x.summary || `Follow up with ${x.person}`}</span>
                  <span className="mt-1 flex flex-wrap justify-end gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                    <Badge variant="outline" className="h-4 px-1 text-[9px]">{x.source}</Badge>
                    <span className="hidden max-w-[110px] truncate sm:inline">{x.person}</span>
                    <span className="tabular-nums">{x.due ? x.due.slice(0, 10) : "No date"}</span>
                  </span>
                  </div>
                </div>
              </button>
            ))}</div>}
          </div>;
        })}</div>}
        detail={mergeMode && mergeRows.length >= 2 ? <div className="space-y-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Merge className="h-3.5 w-3.5" />Merge {mergeRows.length} follow-ups</div>
          <p className="text-xs text-muted-foreground">Pick which value to keep for each field. The follow-up whose summary you keep stays open; the others close with a merge note.</p>
          {mergeField("Summary (this one stays open)", "summary", (x) => x.summary || `Follow up with ${x.person}`)}
          {mergeField("Person", "person", (x) => x.person)}
          {mergeField("Due date", "due", (x) => (x.due ? x.due.slice(0, 10) : ""))}
          {mergeField("PortCo / Partner", "company", (x) => x.company || "")}
          <div className="flex gap-2 border-t border-border pt-3">
            <Button size="sm" disabled={!!busy} onClick={() => void doMerge()}><Merge className="mr-1 h-3.5 w-3.5" />Merge into one</Button>
            <Button size="sm" variant="ghost" onClick={() => { setMergeMode(false); setMergeSel([]); }}>Cancel</Button>
          </div>
        </div> : mergeMode ? <p className="text-sm text-muted-foreground">Tick two or more follow-ups in the list to merge them.</p> : <div className="space-y-4">
          <div className="flex items-start gap-3">
            {r.company && <Logo name={r.company.split(/\s*,\s*/)[0]!} />}
            <div className="min-w-0 flex-1">
              <div className="font-display text-base font-semibold">{r.summary || `Follow up with ${r.person}`}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-y border-border py-3">
            <Button size="sm" onClick={() => onAction({
              sourceKind: "followup", sourceId: r.activityId || r.id, title: r.summary || `Follow-up with ${r.person}`,
              text: r.details || r.originalNote || r.summary, people: r.people || [{ name: r.person, email: r.email || "" }],
              portcos: r.company ? r.company.split(/\s*,\s*/) : [], tracks: r.tracks, followUpActivityId: r.activityId,
            })}><Zap className="mr-1 h-3.5 w-3.5" />Action Now</Button>
            <Button size="sm" variant="outline" disabled={!!busy || !canClose(r)} onClick={() => { setNoteFor(noteFor === r.id ? "" : r.id); setNoteText(""); }}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Mark complete</Button>
            <Button size="sm" variant="outline" className="text-destructive" disabled={!!busy || !canClose(r)} onClick={() => { if (confirm("Delete this follow-up? The original note or contact history stays.")) void act([r], true, "Follow-up deleted"); }}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
            {openLink && <Button asChild size="sm" variant="ghost">{openLink}</Button>}
            {r.sourceUrl?.startsWith("https://") && <Button asChild size="sm" variant="ghost"><a href={r.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink className="ml-1 h-3 w-3" /></a></Button>}
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => { setEditFor(editFor === r.id ? "" : r.id); setNoteFor(""); }}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
          </div>
          {editFor === r.id && <FollowUpEditor key={r.id} reminder={r} onClose={() => setEditFor("")} />}
          {noteFor === r.id && <div className="space-y-2 rounded-md border border-border p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What did you do? (optional note)</div>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} placeholder='e.g. "Sent the intro deck" or "Already handled on the call"' className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <Button size="sm" disabled={!!busy} onClick={() => { const n = noteText; setNoteFor(""); setNoteText(""); setBusy("Marked complete"); void completeWithNote(r, n).then((ok) => { if (ok) { setHidden((h) => new Set([...h, r.id])); toast.success("Marked complete"); void qc.invalidateQueries({ queryKey: ["my-actions"] }); } else toast.error("Couldn't update the follow-up"); }).finally(() => setBusy("")); }}>Save & complete</Button>
              <Button size="sm" variant="ghost" onClick={() => { setNoteFor(""); setNoteText(""); }}>Cancel</Button>
            </div>
          </div>}
          {!canClose(r) && <p className="text-xs text-muted-foreground">This {r.source.toLowerCase()} follow-up is completed from its own page — use the open link above.</p>}
          {(r.details || (r.originalNote && r.originalNote !== r.summary)) && <div className="whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm text-muted-foreground">{r.details || r.originalNote}</div>}
          <div className="flex justify-end border-t border-border pt-3">
            <div className="space-y-0.5 text-right text-xs text-muted-foreground">
              <div className="flex items-center justify-end gap-1.5"><Badge variant="outline" className="h-4 px-1 text-[9px]">{r.source}</Badge>{r.company}</div>
              <div>{r.people ? r.people.map((p) => p.name || p.email).join(", ") : `${r.person}${r.email ? ` · ${r.email}` : ""}`}</div>
              <div className="tabular-nums">{r.due ? `Due ${r.due.slice(0, 10)}` : "No date"}</div>
            </div>
          </div>
          {similar.length > 0 && <div className="space-y-2 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Merge className="h-3.5 w-3.5" />Similar actions · {similar.length}</div>
              <Button size="sm" variant="outline" className="h-7" disabled={!!busy || !similar.some(canClose)} onClick={() => void act(similar.filter(canClose), false, `Merged ${similar.filter(canClose).length} into this one`)}>Merge all into this</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Merging keeps this follow-up open and closes the duplicates. For field-by-field merging, use the Merge button above the list.</p>
            {similar.map((x) => <div key={x.id} className="flex min-w-0 items-start gap-2 text-sm">
              <Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start whitespace-normal p-0 text-left [overflow-wrap:anywhere]" onClick={() => setSelId(x.id)}><span>{x.summary || x.person}<span className="text-xs text-muted-foreground"> · {x.person} · {x.due ? x.due.slice(0, 10) : "No date"}</span></span></Button>
              <Button size="sm" variant="ghost" className="h-7" disabled={!!busy || !canClose(x)} onClick={() => void act([x], false, "Merged")}>Merge</Button>
            </div>)}
          </div>}
        </div>}
      />
    </div>
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

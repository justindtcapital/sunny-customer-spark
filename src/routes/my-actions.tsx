import type React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, GitBranch, Inbox, Merge, Pencil, Plus, Trash2, Undo2, Users, Wrench, Zap } from "lucide-react";
import { useLogoColor } from "@/lib/logo-color";
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
import { isWorkstreamCompleted, workstreamBarStatus, type Workstream } from "@/lib/workstream-parse";
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

const TABS = ["actions", "notes", "done"] as const;
const TAB_STYLE = {
  actions: { label: "My Actions", Icon: GitBranch, tone: "text-primary", selected: "bg-primary text-primary-foreground hover:bg-primary/90" },
  notes: { label: "Notes & Activity inbox", Icon: Inbox, tone: "text-council-foreground", selected: "bg-council-foreground text-primary-foreground hover:text-primary-foreground hover:bg-council-foreground/90" },
  done: { label: "Completed", Icon: CheckCircle2, tone: "text-good-foreground", selected: "bg-good-foreground text-primary-foreground hover:text-primary-foreground hover:bg-good-foreground/90" },
};
type Tab = (typeof TABS)[number];
/** Legacy deep links used tab=workstreams / tab=followups; both now open the merged My Actions feed. */
const normalizeTab = (t: unknown): Tab | undefined => {
  if (t === "workstreams" || t === "followups") return "actions";
  return TABS.includes(t as Tab) ? (t as Tab) : undefined;
};

export const Route = createFileRoute("/my-actions")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab; owner?: string; ws?: string } => ({
    ws: typeof s.ws === "string" ? s.ws : undefined,
    tab: normalizeTab(s.tab),
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
  const tab: Tab = search.tab || "actions";
  const owner = ACTION_OWNERS.find((o) => o.name === search.owner)?.name || teamProfile(email)?.displayName || "";
  const [ctx, setCtx] = useState<ActionContext | null>(null);
  const [counts, setCounts] = useState({ notes: 0, activity: 0 });
  const [dateRange, setDateRange] = useState<ActionDateRange>(null);
  const qc = useQueryClient();
  const set = (p: { tab?: Tab; owner?: string }) => navigate({ search: (s) => ({ ...s, ...p }), replace: true });

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">My Actions</h1>
          <p className="text-sm text-muted-foreground">Workstreams and follow-ups by company, plus your notes and activity inbox.</p>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-4">
        <Select value={owner} onValueChange={(v) => set({ owner: v })}>
          <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Action owner" /></SelectTrigger>
          <SelectContent>{ACTION_OWNERS.map((o) => <SelectItem key={o.name} value={o.name}>{o.name}</SelectItem>)}</SelectContent>
        </Select>
        </div>
      </div>

      {tab === "actions" && <ActionCalendar owner={owner} range={dateRange} onChange={setDateRange} />}


      <div role="tablist" aria-label="My Actions inboxes" className="flex flex-wrap gap-2 border-b border-border pb-4">
        {TABS.map((k) => {
          const { label, Icon, tone, selected } = TAB_STYLE[k];
          return <Button role="tab" aria-selected={tab === k} aria-controls={`actions-${k}`} key={k} onClick={() => set({ tab: k })} variant="outline" className={`h-10 border-2 px-4 ${tab === k ? `${selected} border-transparent font-semibold` : `${tone} border-border bg-card`}`}>
            <Icon className="h-4 w-4" />{label}
            {k === "notes" && <span className="ml-1 rounded bg-current/10 px-1.5 text-xs tabular-nums">{counts.notes + counts.activity}</span>}
          </Button>;
        })}
      </div>

      {!owner ? <p className="text-sm text-muted-foreground">Pick an action owner to see their inbox.</p> : <div role="tabpanel" id={`actions-${tab}`}>
        {tab === "actions" && <ActionsTab owner={owner} onAction={setCtx} focusGid={search.ws} dateRange={dateRange} />}
        {tab === "notes" && <NotesTab owner={owner} onAction={setCtx} onCounts={setCounts} />}
        {tab === "done" && <DoneTab owner={owner} />}
      </div>}

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
          <Button key={k} size="sm" variant={sub === k ? "default" : "ghost"} aria-pressed={sub === k} onClick={() => setSub(k)}>
            {k === "notes" ? "Notes Imports" : "Activity Review"}<span className="ml-1.5 rounded bg-muted px-1.5 text-xs text-muted-foreground">{n[k]}</span>
          </Button>
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

type Sel = { kind: "ws" | "fu"; id: string };
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
/** Which companies to show — separate from which item types to show. */
const COMPANY_TOGGLES = [
  { key: "portcos", label: "PortCos", Icon: Building2 },
  { key: "network", label: "Network", Icon: Users },
  { key: "ops", label: "PortDev Ops", Icon: Wrench },
] as const;
const ITEM_TOGGLES = [
  { key: "workstreams", label: "Workstreams", Icon: GitBranch },
  { key: "followups", label: "Follow-ups", Icon: CalendarDays },
] as const;
type FeedToggle = (typeof COMPANY_TOGGLES)[number]["key"] | (typeof ITEM_TOGGLES)[number]["key"];

/** Workstream / follow-up bullet: icon in a circle tinted with the company logo's primary color. */
function Bullet({ kind, company, website }: { kind: "ws" | "fu"; company: string; website?: string }) {
  const color = useLogoColor(company, website || "");
  const Icon = kind === "ws" ? GitBranch : CalendarDays;
  return (
    <span
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${color ? "" : kind === "ws" ? "border-primary/40 bg-primary/10 text-primary" : "border-warm-foreground/40 bg-warm-foreground/10 text-warm-foreground"}`}
      style={color ? { backgroundColor: color.bg, borderColor: color.fg, color: color.fg } : undefined}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}

/** Merged My Actions feed: workstreams and follow-ups grouped by PortCo / company. */
function ActionsTab({ owner, onAction, focusGid, dateRange }: { owner: string; onAction: (c: ActionContext) => void; focusGid?: string; dateRange: ActionDateRange }) {
  const { workstreams, loading: wsLoading, refresh } = useWorkstreams();
  const qc = useQueryClient();
  const ownerEmail = teamMemberFor(owner)?.email || "";
  const fetchHome = useServerFn(fetchHomeMomentum);
  const completeNote = useServerFn(completeHomeNoteFollowUp);
  const updInteraction = useServerFn(updateInteraction);
  const clearFlag = useServerFn(clearContactFollowUpFlag);
  const completeAction = useServerFn(completeActionFn);
  const [showDone, setShowDone] = useState(false);
  const [priority, setPriority] = useState("");
  const [creating, setCreating] = useState(false);
  const [toggles, setToggles] = useState<Record<FeedToggle, boolean>>({ portcos: true, network: true, ops: true, workstreams: true, followups: true });
  const [sel, setSel] = useState<Sel | null>(focusGid ? { kind: "ws", id: focusGid } : null);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSel, setMergeSel] = useState<string[]>([]);
  const [pick, setPick] = useState({ summary: "", person: "", due: "", company: "" });
  const [noteFor, setNoteFor] = useState("");
  const [noteText, setNoteText] = useState("");
  const [editFor, setEditFor] = useState("");

  const { data: homeData, isLoading: fuLoading } = useQuery({ queryKey: ["my-actions", "followups", ownerEmail], queryFn: () => fetchHome({ data: { email: ownerEmail, scope: "mine" } }), enabled: !!ownerEmail, staleTime: 60_000 });
  const { data: portcoList = [] } = useQuery({ queryKey: ["portfolio-companies"], queryFn: () => fetchPortfolioCompanies(), staleTime: 300_000 });
  const portcoNames = useMemo(() => new Set(portcoList.map((p) => norm(p.name))), [portcoList]);
  const websites = useMemo(() => new Map(portcoList.map((p) => [norm(p.name), p.website || ""])), [portcoList]);

  // Workstreams owned by the selected person.
  const mine = useMemo(() => workstreams.filter((w) => ownerMatches(w.owner, owner)), [workstreams, owner]);
  const wsList = useMemo(() => mine.filter((w) => (showDone || !isWorkstreamCompleted(w)) && (!priority || w.workstreamPriority.toLowerCase() === priority.toLowerCase()))
    .sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name)), [mine, showDone, priority]); // eslint-disable-line react-hooks/exhaustive-deps
  const openWs = mine.filter((w) => !isWorkstreamCompleted(w)).length;
  const priorities = useMemo(() => [...new Set(mine.map((w) => w.workstreamPriority).filter(Boolean))].sort(), [mine]);
  const companies = useMemo(() => [...new Set(workstreams.map((w) => w.company).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [workstreams]);

  // Follow-ups owned by the selected person, date-filtered by the calendar.
  const fuAll = useMemo(() => [...(homeData?.reminders || [])].filter((x) => !hidden.has(x.id)).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")), [homeData, hidden]);
  const fuList = useMemo(() => fuAll.filter((x) => !dateRange || inActionRange(x.due, dateRange)), [fuAll, dateRange]);

  // Deep link (?ws=gid): select it, and show completed ones too if that's where it lives.
  useEffect(() => {
    if (!focusGid) return;
    setSel({ kind: "ws", id: focusGid });
    const w = workstreams.find((x) => x.gid === focusGid);
    if (w && isWorkstreamCompleted(w)) setShowDone(true);
  }, [focusGid, workstreams]);

  // Groups keyed by company: workstreams first, then follow-ups. A follow-up linked
  // to a workstream (via the editor or Action Now) nests under that workstream even
  // when the follow-up's company tag differs from the workstream's company name.
  const groups = useMemo(() => {
    const byGid = new Map(wsList.map((w) => [w.gid, w]));
    const linked = new Map<string, Reminder[]>();
    const general: Reminder[] = [];
    if (toggles.followups) for (const x of fuList) {
      const gid = x.workstreamGid || (x.recordId?.startsWith("ws:") ? x.recordId.slice(3) : "");
      const w = gid ? byGid.get(gid) : undefined;
      if (w && toggles.workstreams) linked.set(w.gid, [...(linked.get(w.gid) || []), x]);
      else general.push(x);
    }
    const m = new Map<string, { ws: Workstream[]; fu: Reminder[] }>();
    const ensure = (k: string) => { const g = m.get(k) || { ws: [] as Workstream[], fu: [] as Reminder[] }; m.set(k, g); return g; };
    if (toggles.workstreams) for (const w of wsList) ensure(w.company || "No PortCo").ws.push(w);
    for (const x of general) ensure((x.company || "").split(/\s*,\s*/)[0] || "No company").fu.push(x);
    return [...m.entries()]
      .map(([company, g]) => {
        const kind = portcoNames.has(norm(company)) ? "portcos" as const
          : company === "No PortCo" || company === "No company" ? "ops" as const
          : "network" as const;
        const gLinked = new Map<string, Reminder[]>();
        for (const w of g.ws) if (linked.has(w.gid)) gLinked.set(w.gid, linked.get(w.gid)!);
        return { company, ws: g.ws, linked: gLinked, general: g.fu, kind };
      })
      .filter((g) => toggles[g.kind] && (g.ws.length + g.general.length + [...g.linked.values()].flat().length > 0))
      .sort((a, b) => a.company.localeCompare(b.company));
  }, [wsList, fuList, toggles, portcoNames]);

  const firstGroupFu = (g: (typeof groups)[number] | undefined) => g ? [...g.ws.flatMap((w) => g.linked.get(w.gid) || []), ...g.general][0] : undefined;
  const firstSel: Sel | null = groups[0]?.ws[0] ? { kind: "ws", id: groups[0].ws[0]!.gid } : firstGroupFu(groups[0]) ? { kind: "fu", id: firstGroupFu(groups[0])!.id } : null;
  const resolved = sel?.kind === "ws" ? (wsList.some((w) => w.gid === sel.id) ? sel : null) : sel?.kind === "fu" ? (fuList.some((x) => x.id === sel.id) ? sel : null) : null;
  const cur = resolved || firstSel;
  const ws = cur?.kind === "ws" ? wsList.find((w) => w.gid === cur.id) || null : null;
  const r = cur?.kind === "fu" ? fuList.find((x) => x.id === cur.id) || null : null;
  // Detail pane: follow-ups linked to this workstream first, falling back to the same company.
  const wsGroup = ws ? groups.find((g) => g.company === (ws.company || "No PortCo")) : undefined;
  const wsGroupFu = ws && wsGroup ? (wsGroup.linked.get(ws.gid) || [...wsGroup.general, ...[...wsGroup.linked.values()].flat()]) : [];

  const mergeRows = mergeSel.map((id) => fuList.find((x) => x.id === id)).filter(Boolean) as Reminder[];
  // Default each merged field to the first selected follow-up.
  useEffect(() => {
    if (mergeRows.length >= 2) setPick({ summary: mergeRows[0]!.id, person: mergeRows[0]!.id, due: mergeRows[0]!.id, company: mergeRows[0]!.id });
  }, [mergeSel.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setMergeSel([]); setMergeMode(false); setSel({ kind: "fu", id: keep.id });
      if (ok.length === mergeRows.length - 1) toast.success(`Merged into "${chosenSummary}"`);
      else toast.error("Some duplicates couldn't be closed here — open them on their own page.");
      void qc.invalidateQueries({ queryKey: ["my-actions"] });
    } catch (e) { console.error(e); toast.error("Couldn't merge"); }
    finally { setBusy(""); }
  };

  const loading = wsLoading || fuLoading;
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

  const fuDetail = (x: Reminder) => {
    const similar = similarFollowUps(x, fuList);
    const openLink = x.campaignId ? <Link to="/campaigns" search={{ campaign: x.campaignId } as never}>Open campaign <ExternalLink className="ml-1 h-3 w-3" /></Link>
      : x.source === "Prospecting" ? <Link to="/targeting" search={{ target: x.targetKey } as never}>Open in Prospecting <ExternalLink className="ml-1 h-3 w-3" /></Link>
      : x.email ? <Link to="/crm" search={{ contact: x.email } as never}>Open contact <ExternalLink className="ml-1 h-3 w-3" /></Link> : null;
    return <div className="space-y-4">
      <div className="flex items-start gap-3">
        {x.company && <Logo name={x.company.split(/\s*,\s*/)[0]!} />}
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-semibold">{x.summary || `Follow up with ${x.person}`}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-y border-border py-3">
        <Button size="sm" onClick={() => onAction({
          sourceKind: "followup", sourceId: x.activityId || x.id, title: x.summary || `Follow-up with ${x.person}`,
          text: x.details || x.originalNote || x.summary, people: x.people || [{ name: x.person, email: x.email || "" }],
          portcos: x.company ? x.company.split(/\s*,\s*/) : [], tracks: x.tracks, followUpActivityId: x.activityId,
        })}><Zap className="mr-1 h-3.5 w-3.5" />Action Now</Button>
        <Button size="sm" variant="outline" disabled={!!busy || !canClose(x)} onClick={() => { setNoteFor(noteFor === x.id ? "" : x.id); setNoteText(""); }}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Mark complete</Button>
        <Button size="sm" variant="outline" className="text-destructive" disabled={!!busy || !canClose(x)} onClick={() => { if (confirm("Delete this follow-up? The original note or contact history stays.")) void act([x], true, "Follow-up deleted"); }}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
        {openLink && <Button asChild size="sm" variant="ghost">{openLink}</Button>}
        {x.sourceUrl?.startsWith("https://") && <Button asChild size="sm" variant="ghost"><a href={x.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink className="ml-1 h-3 w-3" /></a></Button>}
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => { setEditFor(editFor === x.id ? "" : x.id); setNoteFor(""); }}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
      </div>
      {editFor === x.id && <FollowUpEditor key={x.id} reminder={x} onClose={() => setEditFor("")} />}
      {noteFor === x.id && <div className="space-y-2 rounded-md border border-border p-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What did you do? (optional note)</div>
        <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} placeholder='e.g. "Sent the intro deck" or "Already handled on the call"' className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <Button size="sm" disabled={!!busy} onClick={() => { const n = noteText; setNoteFor(""); setNoteText(""); setBusy("Marked complete"); void completeWithNote(x, n).then((ok) => { if (ok) { setHidden((h) => new Set([...h, x.id])); toast.success("Marked complete"); void qc.invalidateQueries({ queryKey: ["my-actions"] }); } else toast.error("Couldn't update the follow-up"); }).finally(() => setBusy("")); }}>Save & complete</Button>
          <Button size="sm" variant="ghost" onClick={() => { setNoteFor(""); setNoteText(""); }}>Cancel</Button>
        </div>
      </div>}
      {!canClose(x) && <p className="text-xs text-muted-foreground">This {x.source.toLowerCase()} follow-up is completed from its own page — use the open link above.</p>}
      {(x.details || (x.originalNote && x.originalNote !== x.summary)) && <div className="whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm text-muted-foreground">{x.details || x.originalNote}</div>}
      <div className="flex justify-end border-t border-border pt-3">
        <div className="space-y-0.5 text-right text-xs text-muted-foreground">
          <div className="flex items-center justify-end gap-1.5"><Badge variant="outline" className="h-4 px-1 text-[9px]">{x.source}</Badge>{x.company}</div>
          <div>{x.people ? x.people.map((p) => p.name || p.email).join(", ") : `${x.person}${x.email ? ` · ${x.email}` : ""}`}</div>
          <div className="tabular-nums">{x.due ? `Due ${x.due.slice(0, 10)}` : "No date"}</div>
        </div>
      </div>
      {similar.length > 0 && <div className="space-y-2 rounded-md border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Merge className="h-3.5 w-3.5" />Similar actions · {similar.length}</div>
          <Button size="sm" variant="outline" className="h-7" disabled={!!busy || !similar.some(canClose)} onClick={() => void act(similar.filter(canClose), false, `Merged ${similar.filter(canClose).length} into this one`)}>Merge all into this</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Merging keeps this follow-up open and closes the duplicates. For field-by-field merging, use the Merge button above the list.</p>
        {similar.map((s) => <div key={s.id} className="flex min-w-0 items-start gap-2 text-sm">
          <Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start whitespace-normal p-0 text-left [overflow-wrap:anywhere]" onClick={() => setSel({ kind: "fu", id: s.id })}><span>{s.summary || s.person}<span className="text-xs text-muted-foreground"> · {s.person} · {s.due ? s.due.slice(0, 10) : "No date"}</span></span></Button>
          <Button size="sm" variant="ghost" className="h-7" disabled={!!busy || !canClose(s)} onClick={() => void act([s], false, "Merged")}>Merge</Button>
        </div>)}
      </div>}
    </div>;
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Company filters">
          {COMPANY_TOGGLES.map(({ key, label, Icon }) => (
            <Button key={key} size="sm" variant={toggles[key] ? "default" : "ghost"} aria-pressed={toggles[key]} onClick={() => setToggles((t) => ({ ...t, [key]: !t[key] }))}>
              <Icon className="mr-1 h-3.5 w-3.5" />{label}
            </Button>
          ))}
        </div>
        <span className="h-6 w-px bg-border" aria-hidden />
        <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Item type filters">
          {ITEM_TOGGLES.map(({ key, label, Icon }) => (
            <Button key={key} size="sm" variant={toggles[key] ? "default" : "ghost"} aria-pressed={toggles[key]} onClick={() => setToggles((t) => ({ ...t, [key]: !t[key] }))}>
              <Icon className="mr-1 h-3.5 w-3.5" />{label}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{openWs} workstreams · {fuList.length} follow-ups</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {priorities.length > 0 && (
            <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
              {["", ...priorities].map((p) => (
                <button key={p || "all"} onClick={() => setPriority(p)} className={`rounded px-2.5 py-1 ${priority === p ? "bg-secondary text-secondary-foreground" : ""}`}>{p || "All priorities"}</button>
              ))}
            </div>
          )}
          <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
            {[false, true].map((v) => (
              <button key={String(v)} onClick={() => setShowDone(v)} className={`rounded px-2.5 py-1 ${showDone === v ? "bg-secondary text-secondary-foreground" : ""}`}>{v ? "All" : "Active"}</button>
            ))}
          </div>
          <Button size="sm" variant={mergeMode ? "secondary" : "outline"} className="h-7" onClick={() => { setMergeMode((m) => !m); setMergeSel([]); }}>
            <Merge className="mr-1 h-3.5 w-3.5" />{mergeMode ? `Merging (${mergeSel.length})` : "Merge"}
          </Button>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setCreating((c) => !c)}><Plus className="h-3.5 w-3.5 mr-1" />New workstream</Button>
        </div>
      </div>
      {creating && <NewWorkstreamForm companies={companies} onDone={(gid) => { setCreating(false); if (gid) { void refresh().then(() => setSel({ kind: "ws", id: gid })); } }} />}
      {loading && <p className="text-sm text-muted-foreground">Loading actions…</p>}
      {!loading && !groups.length && <p className="text-sm text-muted-foreground">No actions for {owner} with these filters.</p>}
      {groups.length > 0 && <SplitPane
        list={<div className="divide-y divide-border">{groups.map((g) => {
          const isClosed = closed.has(g.company);
          const website = websites.get(norm(g.company)) || "";
          const fuCount = g.general.length + [...g.linked.values()].flat().length;
          const fuRow = (x: Reminder, nested: boolean) => (
            <button key={x.id} onClick={() => mergeMode ? toggleMerge(x.id) : setSel({ kind: "fu", id: x.id })} className={`${rowCls(!mergeMode && cur?.kind === "fu" && cur.id === x.id)} ${nested ? "pl-16" : "pl-10"}`}>
              <div className="flex min-w-0 items-start gap-2">
                {mergeMode && <input type="checkbox" checked={mergeSel.includes(x.id)} readOnly className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary" />}
                <Bullet kind="fu" company={g.company} website={website} />
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
          );
          return (
            <div key={g.company}>
              <button onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(g.company)) n.delete(g.company); else n.add(g.company); return n; })}
                className="flex w-full items-center gap-2 bg-muted/20 px-3 py-2 text-left hover:bg-muted/40">
                {isClosed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                <Logo name={g.company} size="sm" />
                <span className="flex-1 truncate text-sm font-semibold">{g.company}</span>
                <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{g.ws.length + fuCount}</span>
              </button>
              {!isClosed && <div className="divide-y divide-border">
                {g.ws.map((w) => (
                  <div key={w.gid}>
                    <button onClick={() => setSel({ kind: "ws", id: w.gid })} className={`${rowCls(cur?.kind === "ws" && cur.id === w.gid)} pl-10`}>
                      <div className="flex min-w-0 items-start gap-2">
                        <Bullet kind="ws" company={g.company} website={website} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{w.name || w.rawName}</div>
                          <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
                            <Badge variant="outline" className="text-[10px]">{w.segment}</Badge>
                            <Badge variant="outline" className={`text-[10px] ${statusTone(workstreamBarStatus(w))}`}>{workstreamBarStatus(w)}</Badge>
                            {w.workstreamPriority && <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">{w.workstreamPriority}</Badge>}
                          </div>
                        </div>
                      </div>
                    </button>
                    {(g.linked.get(w.gid) || []).map((x) => fuRow(x, true))}
                  </div>
                ))}
                {g.general.map((x) => fuRow(x, false))}
              </div>}
            </div>
          );
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
        </div> : mergeMode ? <p className="text-sm text-muted-foreground">Tick two or more follow-ups in the list to merge them.</p> : ws ? <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Logo name={ws.company} />
              <div className="min-w-0">
                <div className="font-display text-base font-semibold">{ws.name || ws.rawName}</div>
                <div className="text-xs text-muted-foreground">{ws.company} · {ws.segment}{ws.owner ? ` · ${ws.owner}` : ""}</div>
              </div>
            </div>
            <Button size="sm" className="h-8 shrink-0" onClick={() => onAction({
              sourceKind: "workstream", sourceId: `ws:${ws.gid}`, title: `${ws.company} – ${ws.name}`,
              text: [ws.notes, ws.traction, ws.dellStakeholders && `Dell stakeholders: ${ws.dellStakeholders}`, ws.lastActivity && `Last activity: ${ws.lastActivity}`].filter(Boolean).join("\n"),
              nextSteps: ws.nextSteps ? [ws.nextSteps] : [], people: [], portcos: [ws.company],
              tracks: ws.segment === "BD" || ws.segment === "GTM" ? [ws.segment] : [],
            })}><Zap className="h-3.5 w-3.5 mr-1" />Action Now</Button>
          </div>
          <WorkstreamDetail key={ws.gid} w={ws} onSaved={() => { void refresh(); void qc.invalidateQueries({ queryKey: ["my-actions", "done"] }); }} />
          {wsGroupFu.length > 0 && <div className="space-y-1 border-t border-border pt-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Follow-ups · {wsGroupFu.length}</div>
            {wsGroupFu.map((x) => (
              <button key={x.id} onClick={() => setSel({ kind: "fu", id: x.id })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/40">
                <Bullet kind="fu" company={ws.company} website={websites.get(norm(ws.company)) || ""} />
                <span className="min-w-0 flex-1 truncate text-sm">{x.summary || `Follow up with ${x.person}`}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{x.due ? x.due.slice(0, 10) : "No date"}</span>
              </button>
            ))}
          </div>}
        </div> : r ? fuDetail(r) : <p className="text-sm text-muted-foreground">Select an action to see its details.</p>}
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

function DoneTab({ owner }: { owner: string }) {
  const list = useServerFn(listDoneActionsFn);
  const undo = useServerFn(undoActionFn);
  const qc = useQueryClient();
  const [kind, setKind] = useState("all");
  const [busy, setBusy] = useState("");
  const { data = [], isLoading, isError } = useQuery({ queryKey: ["my-actions", "done", owner], queryFn: () => list({ data: { owner } }), staleTime: 30_000 });
  const visible = data.filter((a) => kind === "all" || a.kind === kind);
  const labels = { workstream: "Workstream", followup: "Follow-up / Action", note: "Note", activity: "Activity" };
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <Select value={kind} onValueChange={setKind}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All completed</SelectItem>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
      <span className="ml-auto text-xs text-muted-foreground">{visible.length} completed · All dates</span>
    </div>
    <Card><CardContent className="p-0">
      {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading completed actions…</p>}
      {isError && <div role="alert" className="p-4 text-sm text-destructive">Couldn't load completed actions. <Button size="sm" variant="outline" onClick={() => void qc.invalidateQueries({ queryKey: ["my-actions", "done"] })}>Retry</Button></div>}
      {!isLoading && !isError && !visible.length && <p className="p-4 text-sm text-muted-foreground">No completed items for this selection.</p>}
      <div className="divide-y divide-border">{visible.map((a) => <div key={a.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-good-foreground" />
        <div className="min-w-0 flex-1"><div className="break-words text-sm font-medium">{a.title}</div><div className="mt-1 flex flex-wrap justify-end gap-2 text-xs text-muted-foreground"><Badge variant="outline">{labels[a.kind]}</Badge>{a.date.slice(0, 10)}{a.person && <span>{a.person}</span>}{a.portco && <span>{a.portco}</span>}</div></div>
        {a.workstreamGid && <Button asChild size="sm" variant="ghost"><Link to="/my-actions" search={{ tab: "actions", owner, ws: a.workstreamGid }}>Open <ExternalLink className="h-3.5 w-3.5" /></Link></Button>}
        {a.actionId && <Button size="sm" variant="ghost" disabled={!!busy} onClick={async () => {
          if (!a.actionId) return;
          setBusy(a.id);
          try { await undo({ data: { actionId: a.actionId, followUpActivityId: a.followUpActivityId } }); toast.success("Reopened"); await qc.invalidateQueries({ queryKey: ["my-actions"] }); }
          catch { toast.error("Couldn't reopen this action"); } finally { setBusy(""); }
        }}><Undo2 className="h-3.5 w-3.5" />Undo</Button>}
      </div>)}</div>
    </CardContent></Card>
  </div>;
}

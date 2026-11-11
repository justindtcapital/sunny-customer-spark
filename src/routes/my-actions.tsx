import type React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, GitBranch, Merge, Plus, Trash2, Undo2, Sparkles } from "lucide-react";
import { ActionsFilterBar, DEFAULT_INBOX, priorityShort, priorityTone, type BannerView, type InboxKind, type InboxToggles } from "@/components/actions/ActionsBanner";
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
import { editFollowUpFn } from "@/utils/follow-up-edit.functions";
import { followUpValues } from "@/lib/follow-up-edit";
import { CompleteFollowUpForm } from "@/components/actions/CompleteFollowUpForm";
import { ActionCalendar } from "@/components/actions/ActionCalendar";
import { actionDueLabel, inActionRange, type ActionDateRange } from "@/lib/action-calendar";
import { reportingDay } from "@/lib/home-momentum";
import { fileFollowUp, portcoMatchKey, type Filing } from "@/lib/action-grouping";
import { ACTION_SORTS, abbreviateTitle, companyKindVisible, sortActions, type ActionSort, type CompanyKind } from "@/lib/action-sort";

type FeedToggles = Record<CompanyKind | "workstreams" | "followups", boolean>;
const KIND_LABEL: Record<CompanyKind, string> = { portcos: "PortCo", network: "Network", ops: "PortDev Ops" };
import { completeHomeNoteFollowUp, fetchHomeMomentum } from "@/utils/home.functions";
import { updateInteraction, clearContactFollowUpFlag } from "@/utils/sheets.functions";
import { completeActionFn, listDoneActionsFn, undoActionFn } from "@/utils/actions.functions";
import { WorkstreamTrail } from "@/components/actions/WorkstreamTrail";
import type { NoteInboxItem } from "@/utils/notes-inbox.server";

const TABS = ["actions", "notes", "done"] as const;
type Tab = (typeof TABS)[number];
/** Legacy deep links used tab=workstreams / tab=followups; both now open the merged My Actions feed. */
const normalizeTab = (t: unknown): Tab | undefined => {
  if (t === "workstreams" || t === "followups") return "actions";
  return TABS.includes(t as Tab) ? (t as Tab) : undefined;
};

export const Route = createFileRoute("/my-actions")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab; owner?: string; ws?: string; fu?: string } => ({
    ws: typeof s.ws === "string" ? s.ws : undefined,
    fu: typeof s.fu === "string" ? s.fu : undefined,
    tab: normalizeTab(s.tab),
    owner: typeof s.owner === "string" ? s.owner : undefined,
  }),
  head: () => ({
    meta: [
      { title: "My Actions — VenturePulse" },
      { name: "description", content: "Your inbox of workstreams, notes, activity and follow-ups, with Action with V.I.C. emails and logs." },
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
  const [inbox, setInbox] = useState<InboxToggles>(DEFAULT_INBOX);
  const [dateRange, setDateRange] = useState<ActionDateRange>(null);
  const [kinds, setKinds] = useState<CompanyKind[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [showWs, setShowWs] = useState(true);
  const [showActions, setShowActions] = useState(true);
  const [listSearch, setListSearch] = useState("");
  const [kindCounts, setKindCounts] = useState<Record<CompanyKind, number>>({ portcos: 0, network: 0, ops: 0 });
  const { workstreams } = useWorkstreams();
  const priorities = useMemo(() => [...new Set(workstreams.filter((w) => ownerMatches(w.owner, owner)).map((w) => w.workstreamPriority).filter(Boolean))].sort(), [workstreams, owner]);
  const qc = useQueryClient();
  const set = (p: { tab?: Tab; owner?: string }) => navigate({ search: (s) => ({ ...s, ...p }), replace: true });
  const view: BannerView = tab === "notes" ? "inbox" : tab;
  const onView = (v: BannerView) => set({ tab: v === "inbox" ? "notes" : v });
  // In the inbox a tick toggles; from another view it opens the inbox with that list ticked.
  const onToggleInbox = (k: InboxKind) => {
    if (tab === "notes") setInbox((b) => ({ ...b, [k]: !b[k] }));
    else { setInbox((b) => ({ ...b, [k]: true })); set({ tab: "notes" }); }
  };
  // Changing a filter always shows the to-do feed it filters.
  const toActions = () => { if (tab !== "actions") set({ tab: "actions" }); };
  const toggles: FeedToggles = { portcos: kinds.includes("portcos"), network: kinds.includes("network"), ops: kinds.includes("ops"), workstreams: showWs, followups: showActions };
  const hiddenPriorities = picked.length ? priorities.filter((p) => !picked.includes(p)) : [];

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

      <div className="flex flex-wrap items-stretch gap-x-4 gap-y-3 border-b border-border pb-3">
        <ActionCalendar compact owner={owner} range={dateRange} onChange={(r) => { setDateRange(r); toActions(); }} />
        <ActionsFilterBar view={view} onView={onView} counts={counts} inbox={inbox} onToggleInbox={onToggleInbox}
          kinds={kinds} kindCounts={kindCounts} onKinds={setKinds}
          priorities={priorities} picked={picked} onPicked={setPicked}
          showWs={showWs} onShowWs={setShowWs} showActions={showActions} onShowActions={setShowActions} search={listSearch} onSearch={setListSearch} />
      </div>

      {!owner ? <p className="text-sm text-muted-foreground">Pick an action owner to see their inbox.</p> : <div role="tabpanel" id={`actions-${tab}`}>
        {tab === "actions" && <ActionsTab owner={owner} onAction={setCtx} focusGid={search.ws} focusFu={search.fu} dateRange={dateRange} toggles={toggles} hiddenPriorities={hiddenPriorities} search={listSearch} onKindCounts={setKindCounts} />}
        {/* Kept mounted so the inbox counts in the banner are always current. */}
        <div className={tab === "notes" ? "" : "hidden"}><NotesTab owner={owner} show={inbox} onAction={setCtx} onCounts={setCounts} /></div>
        {tab === "done" && <DoneTab owner={owner} />}
      </div>}

      <ActionComposer ctx={ctx} onClose={() => setCtx(null)} onDone={() => { void qc.invalidateQueries({ queryKey: ["my-actions"] }); }} />
    </div>
  );
}

function NotesTab({ owner, show, onAction, onCounts }: { owner: string; show: InboxToggles; onAction: (c: ActionContext) => void; onCounts: (c: { notes: number; activity: number }) => void }) {
  const [, setN] = useState({ notes: 0, activity: 0 });
  const update = (k: "notes" | "activity", v: number) => setN((c) => { const next = { ...c, [k]: v }; onCounts(next); return next; });
  return (
    <div className="space-y-4">
      {!show.notes && !show.activity && <p className="text-sm text-muted-foreground">Tick Notes or Activity to see what's waiting for review.</p>}
      <div className={show.notes ? "" : "hidden"}><NotesImports actionOwner={owner} onStats={(s) => update("notes", s.pending)} onActionNow={(i) => onAction(fromNote(i, "note"))} split /></div>
      <div className={show.activity ? "" : "hidden"}><NotesImports kind="activity" actionOwner={owner} onStats={(s) => update("activity", s.pending)} onActionNow={(i) => onAction(fromNote(i, "activity"))} split /></div>
    </div>
  );
}

/** PortCo-page layout: compact list left, detail right; on narrow screens the detail opens inline under its row. */
function SplitPane({ list, detail, wide }: { list: React.ReactNode; detail: React.ReactNode; wide: boolean }) {
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-1 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1">{list}</div>
      {wide && <Card className="min-w-0 self-start w-full"><CardContent className="lg:max-h-[calc(100vh-220px)] overflow-x-hidden overflow-y-auto p-4 [overflow-wrap:anywhere]">{detail}</CardContent></Card>}
    </div>
  );
}
function useIsWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => { const m = window.matchMedia("(min-width: 1024px)"); const f = () => setWide(m.matches); f(); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return wide;
}

const rowCls = (on: boolean) => `block w-full rounded-md border bg-card px-2 py-1.5 text-left ${on ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`;

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

/** PortCo / Network switch for one follow-up; saves straight away through the follow-up edit overlay. */
function FilingControl({ x, filing }: { x: Reminder; filing: Filing }) {
  const save = useServerFn(editFollowUpFn);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const current = filing.kind === "network" ? "network" : "portco";
  const choose = async (to: "portco" | "network") => {
    if (to === current && !filing.auto) return;
    setBusy(true);
    try {
      await save({ data: { id: x.id, edit: { ...followUpValues(x), filing: to } } });
      await Promise.all([qc.invalidateQueries({ queryKey: ["my-actions"] }), qc.invalidateQueries({ queryKey: ["home-momentum"] })]);
      toast.success(to === "network" ? "Filed as a Network follow-up" : "Filed as a PortCo follow-up");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't change where this is filed"); }
    finally { setBusy(false); }
  };
  const where = filing.kind === "network"
    ? `Filed under ${filing.group}${filing.portcoTag && filing.portcoTag !== filing.group ? ` · tagged ${filing.portcoTag}` : ""}`
    : filing.kind === "portcos" ? `Filed under ${filing.group}` : "Filed under PortDev Ops";
  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <span className="font-semibold uppercase tracking-wider text-muted-foreground">Follow-up type</span>
    <div role="radiogroup" aria-label="Follow-up type" className="inline-flex rounded-md border border-border p-0.5">
      {(["portco", "network"] as const).map((k) => (
        <button key={k} role="radio" aria-checked={current === k} disabled={busy} onClick={() => void choose(k)}
          className={`rounded px-2.5 py-1 font-medium ${current === k ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {k === "portco" ? "PortCo" : "Network"}
        </button>
      ))}
    </div>
    <span className="text-muted-foreground">{where}{filing.auto ? " (automatic)" : ""}</span>
  </div>;
}
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

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
function ActionsTab({ owner, onAction, focusGid, focusFu, dateRange, toggles, hiddenPriorities, search, onKindCounts }: { owner: string; onAction: (c: ActionContext) => void; focusGid?: string; focusFu?: string; dateRange: ActionDateRange; toggles: FeedToggles; hiddenPriorities: string[]; search: string; onKindCounts: (c: Record<CompanyKind, number>) => void }) {
  const wide = useIsWide();
  // Set after hydration so server and browser render the same list first.
  const [today, setToday] = useState("");
  useEffect(() => setToday(reportingDay(new Date())), []);
  const q = search.trim().toLowerCase();
  const hit = (...xs: (string | undefined)[]) => !q || xs.some((x) => (x || "").toLowerCase().includes(q));
  const { workstreams, loading: wsLoading, refresh } = useWorkstreams();
  const qc = useQueryClient();
  const ownerEmail = teamMemberFor(owner)?.email || "";
  const fetchHome = useServerFn(fetchHomeMomentum);
  const completeNote = useServerFn(completeHomeNoteFollowUp);
  const updInteraction = useServerFn(updateInteraction);
  const clearFlag = useServerFn(clearContactFollowUpFlag);
  const completeAction = useServerFn(completeActionFn);
  // Completed workstreams live in the Completed view; a deep link to one still shows it here.
  const [showDone, setShowDone] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sort, setSort] = useState<ActionSort>("portco");
  const [sel, setSel] = useState<Sel | null>(focusGid ? { kind: "ws", id: focusGid } : focusFu ? { kind: "fu", id: focusFu } : null);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSel, setMergeSel] = useState<string[]>([]);
  const [pick, setPick] = useState({ summary: "", person: "", due: "", company: "" });
  const [noteFor, setNoteFor] = useState("");

  const { data: homeData, isLoading: fuLoading } = useQuery({ queryKey: ["my-actions", "followups", ownerEmail], queryFn: () => fetchHome({ data: { email: ownerEmail, scope: "mine" } }), enabled: !!ownerEmail, staleTime: 60_000 });
  const { data: portcoList = [] } = useQuery({ queryKey: ["portfolio-companies"], queryFn: () => fetchPortfolioCompanies(), staleTime: 300_000 });
  // PortCo names keyed loosely so "Bland" and "Bland AI" are one company.
  const portcoNames = useMemo(() => new Map(portcoList.map((p) => [portcoMatchKey(p.name), p.name])), [portcoList]);
  // PortCo vs Network filing for each follow-up (read-time, or the user's saved choice).
  const filings = useMemo(() => {
    const portcoName = (n: string) => portcoNames.get(portcoMatchKey(n)) || "";
    return new Map((homeData?.reminders || []).map((x) => [x.id, fileFollowUp(x, portcoName, (n) => !!teamMemberFor(n))]));
  }, [homeData, portcoNames]);
  const filingOf = (x: Reminder): Filing => filings.get(x.id) || { kind: "ops", group: "", portcoTag: "", auto: true };
  const websites = useMemo(() => { const m = new Map(portcoList.map((p) => [portcoMatchKey(p.name), p.website || ""])); return { get: (k: string) => m.get(portcoMatchKey(k)) }; }, [portcoList]);

  // Workstreams owned by the selected person.
  const mine = useMemo(() => workstreams.filter((w) => ownerMatches(w.owner, owner)), [workstreams, owner]);
  const wsList = useMemo(() => mine.filter((w) => (showDone || !isWorkstreamCompleted(w)) && !hiddenPriorities.includes(w.workstreamPriority) && hit(w.name, w.rawName, w.company))
    .sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name)), [mine, showDone, hiddenPriorities, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const companies = useMemo(() => [...new Set(workstreams.map((w) => w.company).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [workstreams]);

  // Follow-ups owned by the selected person, date-filtered by the calendar.
  const fuAll = useMemo(() => [...(homeData?.reminders || [])].filter((x) => !hidden.has(x.id)).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")), [homeData, hidden]);
  const fuList = useMemo(() => fuAll.filter((x) => (!dateRange || inActionRange(x.due, dateRange)) && hit(x.summary, x.person, x.company, x.details)), [fuAll, dateRange, q]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep link (?ws=gid): select it, and show completed ones too if that's where it lives.
  useEffect(() => {
    if (!focusGid) return;
    setSel({ kind: "ws", id: focusGid });
    const w = workstreams.find((x) => x.gid === focusGid);
    if (w && isWorkstreamCompleted(w)) setShowDone(true);
  }, [focusGid, workstreams]);
  // Deep link (?fu=id) from the Morning Brief: select that follow-up.
  useEffect(() => { if (focusFu && !focusGid) setSel({ kind: "fu", id: focusFu }); }, [focusFu, focusGid]);

  // Groups keyed by company: workstreams first, then follow-ups. A follow-up linked
  // to a workstream (via the editor or Action Now) nests under that workstream even
  // when the follow-up's company tag differs from the workstream's company name.
  const allGroups = useMemo(() => {
    const byGid = new Map(wsList.map((w) => [w.gid, w]));
    const linked = new Map<string, Reminder[]>();
    const general: Reminder[] = [];
    if (toggles.followups) for (const x of fuList) {
      const gid = x.workstreamGid || (x.recordId?.startsWith("ws:") ? x.recordId.slice(3) : "");
      // Network follow-ups sit under the person's company even when linked to a PortCo workstream.
      const w = gid && filingOf(x).kind !== "network" ? byGid.get(gid) : undefined;
      if (w && toggles.workstreams) linked.set(w.gid, [...(linked.get(w.gid) || []), x]);
      else general.push(x);
    }
    const OPS = "PortDev Ops";
    const m = new Map<string, { company: string; kind: CompanyKind; ws: Workstream[]; fu: Reminder[] }>();
    // Keyed by kind too, so a PortCo filed as a Network company never merges with its PortCo group.
    const ensure = (name: string, forced?: CompanyKind) => {
      const isOps = forced === "ops" || !name.trim() || /^(no portco|no company|portdev ops)$/i.test(name.trim());
      const mk = portcoMatchKey(name);
      const kind: CompanyKind = isOps ? "ops" : forced || (portcoNames.has(mk) ? "portcos" : "network");
      const key = isOps ? "~ops" : `${kind}:${mk}`;
      const g = m.get(key) || { company: isOps ? OPS : (kind === "portcos" && portcoNames.get(mk)) || name.trim(), kind, ws: [] as Workstream[], fu: [] as Reminder[] };
      m.set(key, g); return g;
    };
    if (toggles.workstreams) for (const w of wsList) ensure(w.company).ws.push(w);
    // PortCo follow-ups under the PortCo; Network ones under the outside person's company (never a teammate).
    for (const x of general) { const f = filingOf(x); ensure(f.group, f.kind).fu.push(x); }
    return [...m.values()]
      .map(({ company, kind, ...g }) => {
        const gLinked = new Map<string, Reminder[]>();
        for (const w of g.ws) if (linked.has(w.gid)) gLinked.set(w.gid, linked.get(w.gid)!);
        return { company, ws: g.ws, linked: gLinked, general: g.fu, kind };
      })
      .filter((g) => g.ws.length + g.general.length + [...g.linked.values()].flat().length > 0)
      .sort((a, b) => a.company.localeCompare(b.company));
  }, [wsList, fuList, toggles.workstreams, toggles.followups, portcoNames, filings]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => allGroups.filter((g) => companyKindVisible(toggles, g.kind)), [allGroups, toggles.portcos, toggles.network, toggles.ops]); // eslint-disable-line react-hooks/exhaustive-deps
  const kindCountKey = allGroups.map((g) => `${g.kind}:${g.ws.length + g.general.length + [...g.linked.values()].flat().length}`).join(",");
  useEffect(() => {
    const c = { portcos: 0, network: 0, ops: 0 };
    for (const g of allGroups) c[g.kind] += g.ws.length + g.general.length + [...g.linked.values()].flat().length;
    onKindCounts(c);
  }, [kindCountKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Non-PortCo sorts show one flat list; a linked follow-up takes its workstream's priority.
  const flat = useMemo(() => sort === "portco" ? [] : sortActions(groups.flatMap((g) => [
    ...g.ws.flatMap((w) => [
      { key: `ws:${w.gid}`, ws: w, company: g.company, title: w.name || w.rawName, date: w.lastActivity || w.createdAt, due: "", priority: w.workstreamPriority },
      ...(g.linked.get(w.gid) || []).map((x) => ({ key: `fu:${x.id}`, fu: x, company: g.company, title: x.summary || x.person, date: x.date, due: x.due, priority: w.workstreamPriority })),
    ]),
    ...g.general.map((x) => ({ key: `fu:${x.id}`, fu: x, company: g.company, title: x.summary || x.person, date: x.date, due: x.due, priority: "" })),
  ] as { key: string; ws?: Workstream; fu?: Reminder; company: string; title: string; date?: string; due?: string; priority?: string }[]), sort), [groups, sort]);

  const firstGroupFu = (g: (typeof groups)[number] | undefined) => g ? [...g.ws.flatMap((w) => g.linked.get(w.gid) || []), ...g.general][0] : undefined;
  const firstSel: Sel | null = flat[0] ? (flat[0].ws ? { kind: "ws", id: flat[0].ws.gid } : { kind: "fu", id: flat[0].fu!.id }) : groups[0]?.ws[0] ? { kind: "ws", id: groups[0].ws[0]!.gid } : firstGroupFu(groups[0]) ? { kind: "fu", id: firstGroupFu(groups[0])!.id } : null;
  const resolved = sel?.kind === "ws" ? (toggles.workstreams && wsList.some((w) => w.gid === sel.id) ? sel : null) : sel?.kind === "fu" ? (toggles.followups && fuList.some((x) => x.id === sel.id) ? sel : null) : null;
  const cur = resolved || firstSel;
  const ws = cur?.kind === "ws" ? wsList.find((w) => w.gid === cur.id) || null : null;
  const r = cur?.kind === "fu" ? fuList.find((x) => x.id === cur.id) || null : null;
  // Detail pane: follow-ups linked to this workstream first, falling back to the same company.
  const wsGroup = ws ? groups.find((g) => g.ws.some((w) => w.gid === ws.gid)) : undefined;
  const wsGroupBase = ws && wsGroup ? (wsGroup.linked.get(ws.gid) || [...wsGroup.general, ...[...wsGroup.linked.values()].flat()]) : [];
  // Network follow-ups linked to this workstream are filed elsewhere but still listed here.
  const wsGroupFu = ws ? [...wsGroupBase, ...fuList.filter((x) => !wsGroupBase.includes(x) && (x.workstreamGid || (x.recordId?.startsWith("ws:") ? x.recordId.slice(3) : "")) === ws.gid)] : [];

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
  const completeWithNote = async (x: Reminder, note: string, nextFollowUp?: { date: string; note: string }) => {
    if (note.trim() || nextFollowUp) {
      await completeAction({ data: {
        sourceKind: "followup", sourceId: x.activityId || x.id, subject: x.summary || `Follow-up with ${x.person}`,
        recipients: x.people?.length ? x.people : [{ name: x.contactName || x.person, email: x.email || "" }], portcos: (x.company || x.groupCompany || "").split(/\s*,\s*/).filter(Boolean),
        tracks: x.tracks || [], actor: owner, followUpActivityId: x.activityId || undefined, mode: "log", note: note.trim(), nextFollowUp,
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
        {(filingOf(x).group || x.company) && <Logo name={filingOf(x).group || x.company.split(/\s*,\s*/)[0]!} />}
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-semibold">{x.summary || `Follow up with ${x.person}`}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-y border-border py-3">
        <Button size="sm" onClick={() => onAction({
          sourceKind: "followup", sourceId: x.activityId || x.id, title: x.summary || `Follow-up with ${x.person}`,
          text: x.details || x.originalNote || x.summary, people: x.people || [{ name: x.person, email: x.email || "" }],
          portcos: x.company ? x.company.split(/\s*,\s*/) : [], tracks: x.tracks, followUpActivityId: x.activityId,
        })}><Sparkles className="mr-1 h-3.5 w-3.5" />Action with V.I.C.</Button>
        <Button size="sm" variant="outline" disabled={!!busy || !canClose(x)} onClick={() => setNoteFor(noteFor === x.id ? "" : x.id)}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Mark complete</Button>
        <Button size="sm" variant="outline" className="text-destructive" disabled={!!busy || !canClose(x)} onClick={() => { if (confirm("Delete this follow-up? The original note or contact history stays.")) void act([x], true, "Follow-up deleted"); }}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
        {openLink && <Button asChild size="sm" variant="ghost">{openLink}</Button>}
        {x.sourceUrl?.startsWith("https://") && <Button asChild size="sm" variant="ghost"><a href={x.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink className="ml-1 h-3 w-3" /></a></Button>}
      </div>
      {noteFor === x.id && <CompleteFollowUpForm key={x.id} busy={!!busy} onCancel={() => setNoteFor("")} onSave={async (note, next) => {
        setBusy("Marked complete");
        try {
          const ok = await completeWithNote(x, note, next);
          if (!ok) throw new Error("Couldn't update the follow-up");
          setNoteFor(""); setHidden((h) => new Set([...h, x.id]));
          toast.success(next ? "Marked complete and future follow-up scheduled" : "Marked complete");
          void qc.invalidateQueries({ queryKey: ["my-actions"] });
          void qc.invalidateQueries({ queryKey: ["home-momentum"] });
        } finally { setBusy(""); }
      }} />}
      {!canClose(x) && <p className="text-xs text-muted-foreground">This {x.source.toLowerCase()} follow-up is completed from its own page — use the open link above.</p>}
      {(x.details || (x.originalNote && x.originalNote !== x.summary)) && <div className="whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm text-muted-foreground">{x.details || x.originalNote}</div>}
      <FilingControl x={x} filing={filingOf(x)} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border border-border p-3 text-xs sm:grid-cols-4">
        <div><dt className="text-muted-foreground">Source</dt><dd className="font-medium">{x.source}</dd></div>
        <div><dt className="text-muted-foreground">Created</dt><dd className="font-medium tabular-nums">{x.date ? x.date.slice(0, 10) : "—"}</dd></div>
        <div><dt className="text-muted-foreground">Due</dt><dd className="font-medium tabular-nums">{x.due ? x.due.slice(0, 10) : "No date"}</dd></div>
        <div><dt className="text-muted-foreground">Owner</dt><dd className="font-medium">{teamMemberFor(x.owner)?.displayName || x.owner || "—"}</dd></div>
      </dl>
      <FollowUpEditor inline key={x.id} reminder={x} />
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

  const detailNode = mergeMode && mergeRows.length >= 2 ? <div className="space-y-4">
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
              people: [], portcos: [ws.company],
              tracks: ws.segment === "BD" || ws.segment === "GTM" ? [ws.segment] : [],
            })}><Sparkles className="h-3.5 w-3.5 mr-1" />Action with V.I.C.</Button>
          </div>
          <WorkstreamDetail key={ws.gid} w={ws} onSaved={() => { void refresh(); void qc.invalidateQueries({ queryKey: ["my-actions", "done"] }); }} />
          {wsGroupFu.length > 0 && <div className="space-y-1 border-t border-border pt-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Follow-ups · {wsGroupFu.length}</div>
            {wsGroupFu.map((x) => (
              <button key={x.id} onClick={() => setSel({ kind: "fu", id: x.id })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/40">
                <Bullet kind="fu" company={ws.company} website={websites.get(ws.company) || ""} />
                <span className="min-w-0 flex-1 truncate text-sm">{x.summary || `Follow up with ${x.person}`}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{x.due ? x.due.slice(0, 10) : "No date"}</span>
              </button>
            ))}
          </div>}
          <WorkstreamTrail gid={ws.gid} company={ws.company} segment={ws.segment} />
        </div> : r ? fuDetail(r) : <p className="text-sm text-muted-foreground">Select an action to see its details.</p>;
  const inline = (on: boolean) => !wide && on ? <div className="mb-2 mt-1 rounded-lg border border-border bg-card p-4 [overflow-wrap:anywhere]">{detailNode}</div> : null;
  const priChip = (p?: string) => p ? <span title={p} className={`shrink-0 rounded border px-1.5 py-px text-[10px] font-semibold ${priorityTone(p)}`}>{priorityShort(p)}</span> : null;

  const fuRow = (x: Reminder, company: string, website: string, nested: boolean, showCompany: boolean, priority?: string) => {
    const on = !mergeMode && cur?.kind === "fu" && cur.id === x.id;
    const full = x.summary || `Follow up with ${x.person}`;
    return <div key={x.id} className={nested ? "pl-6" : ""}>
      <button onClick={() => mergeMode ? toggleMerge(x.id) : setSel({ kind: "fu", id: x.id })} aria-expanded={on} title={full} className={rowCls(on)}>
        <div className="flex min-w-0 items-center gap-2">
          {mergeMode && <input type="checkbox" checked={mergeSel.includes(x.id)} readOnly className="h-3.5 w-3.5 shrink-0 accent-primary" />}
          <Bullet kind="fu" company={company} website={website} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{abbreviateTitle(full, company, 48)}</span>
          {showCompany && <span className="hidden max-w-[90px] truncate text-[11px] text-muted-foreground sm:inline">{company}</span>}
          {(() => { const f = filingOf(x); return f.kind === "network" && f.portcoTag && portcoMatchKey(f.portcoTag) !== portcoMatchKey(company) ? <span title={`Tagged ${f.portcoTag}`} className="max-w-[80px] shrink-0 truncate rounded border border-primary/30 bg-primary/5 px-1.5 py-px text-[10px] font-medium text-primary">{f.portcoTag}</span> : null; })()}
          {priChip(priority)}
          {(() => { const d = actionDueLabel(x.due, today); return <span title={d.overdue ? "Overdue" : undefined} className={`shrink-0 text-[11px] tabular-nums ${d.overdue ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{d.text}</span>; })()}
        </div>
      </button>
      {inline(on)}
    </div>;
  };
  const wsRow = (w: Workstream, company: string, website: string, showCompany: boolean) => {
    const on = cur?.kind === "ws" && cur.id === w.gid;
    const full = w.name || w.rawName;
    return <>
      <button onClick={() => setSel({ kind: "ws", id: w.gid })} aria-expanded={on} title={full} className={rowCls(on)}>
        <div className="flex min-w-0 items-center gap-2">
          <Bullet kind="ws" company={company} website={website} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{abbreviateTitle(full, company, 44)}</span>
          {showCompany && <span className="hidden max-w-[90px] truncate text-[11px] text-muted-foreground sm:inline">{company}</span>}
          {priChip(w.workstreamPriority)}
          <Badge variant="outline" className={`shrink-0 px-1 text-[10px] ${statusTone(workstreamBarStatus(w))}`}>{workstreamBarStatus(w)}</Badge>
        </div>
      </button>
      {inline(on)}
    </>;
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {toggles.workstreams ? `${wsList.length} workstreams` : ""}{toggles.workstreams && toggles.followups ? " · " : ""}{toggles.followups ? `${fuList.length} follow-ups` : ""}
        </span>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>· Sort by</span>
          <Select value={sort} onValueChange={(v) => setSort(v as ActionSort)}>
            <SelectTrigger aria-label="Sort actions by" className="h-6 w-auto gap-1 border-0 bg-transparent px-1 text-xs font-medium text-foreground shadow-none"><SelectValue /></SelectTrigger>
            <SelectContent>{ACTION_SORTS.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
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
        list={sort !== "portco" ? flat.map((it) => {
          const website = websites.get(it.company) || "";
          return it.ws ? <div key={it.key}>{wsRow(it.ws, it.company, website, true)}</div> : fuRow(it.fu!, it.company, website, false, true, it.priority);
        }) : (["portcos", "network", "ops"] as const).filter((k) => groups.some((g) => g.kind === k)).map((k, _i, shown) => (
          <section key={k} className="space-y-1 pb-2">
            {shown.length > 1 && <h2 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{KIND_LABEL[k]}</h2>}
            {groups.filter((g) => g.kind === k).map((g) => {
              const isClosed = closed.has(g.company);
              const website = websites.get(g.company) || "";
              const fuCount = g.general.length + [...g.linked.values()].flat().length;
              return (
                <div key={`${g.kind}:${g.company}`} className="space-y-1">
                  <button onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(g.company)) n.delete(g.company); else n.add(g.company); return n; })}
                    className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/40">
                    {isClosed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    <Logo name={g.company} size="sm" />
                    <span className="flex-1 truncate text-sm font-semibold">{g.company}</span>
                    <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{g.ws.length + fuCount}</span>
                  </button>
                  {!isClosed && <div className="space-y-1 pl-5">
                    {g.ws.map((w) => (
                      <div key={w.gid} className="space-y-1">
                        {wsRow(w, g.company, website, false)}
                        {(g.linked.get(w.gid) || []).map((x) => fuRow(x, g.company, website, true, false, w.workstreamPriority))}
                      </div>
                    ))}
                    {g.general.map((x) => fuRow(x, g.company, website, false, false))}
                  </div>}
                </div>
              );
            })}
          </section>
        ))}
        detail={detailNode} wide={wide}
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

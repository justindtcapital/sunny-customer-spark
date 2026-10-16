import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Undo2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { teamMemberFor, teamProfile } from "@/lib/user-ownership";
import { ACTION_OWNERS, ownerMatches } from "@/lib/action-owners";
import { useWorkstreams } from "@/lib/use-workstreams";
import { workstreamBarStatus } from "@/lib/workstream-parse";
import { NotesImports } from "@/components/knowledge/NotesImports";
import { WorkstreamSummary } from "@/components/dashboard/WorkstreamSummary";
import { ActionComposer, type ActionContext } from "@/components/actions/ActionComposer";
import { fetchHomeMomentum } from "@/utils/home.functions";
import { listDoneActionsFn, undoActionFn } from "@/utils/actions.functions";
import type { NoteInboxItem } from "@/utils/notes-inbox.server";

const TABS = ["workstreams", "notes", "followups", "done"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/my-actions")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab; owner?: string } => ({
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
    <div className="mx-auto max-w-6xl space-y-4 p-6">
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
        {tab === "workstreams" && <WorkstreamsTab owner={owner} onAction={setCtx} />}
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
      <div className={sub === "notes" ? "" : "hidden"}><NotesImports actionOwner={owner} onStats={(s) => update("notes", s.pending)} onActionNow={(i) => onAction(fromNote(i, "note"))} /></div>
      <div className={sub === "activity" ? "" : "hidden"}><NotesImports kind="activity" actionOwner={owner} onStats={(s) => update("activity", s.pending)} onActionNow={(i) => onAction(fromNote(i, "activity"))} /></div>
    </div>
  );
}

function WorkstreamsTab({ owner, onAction }: { owner: string; onAction: (c: ActionContext) => void }) {
  const { workstreams, loading } = useWorkstreams();
  const mine = useMemo(() => workstreams.filter((w) => ownerMatches(w.owner, owner)), [workstreams, owner]);
  const open = mine.filter((w) => !/complete/i.test(workstreamBarStatus(w)));
  const keys = useMemo(() => [...new Set(mine.map((w) => w.companyKey))], [mine]);
  return (
    <div className="space-y-4">
      <Card><CardContent className="p-0">
        <div className="border-b border-border px-4 py-2 text-xs font-semibold text-muted-foreground">Open workstreams ({open.length})</div>
        {loading && <p className="p-4 text-sm text-muted-foreground">Loading workstreams…</p>}
        <div className="divide-y divide-border">
          {open.map((w) => (
            <div key={w.gid} className="flex flex-wrap items-center gap-3 px-4 py-2">
              <Badge variant="outline" className="text-[10px]">{w.segment}</Badge>
              <div className="min-w-[220px] flex-1">
                <div className="text-sm font-medium">{w.company} · {w.name}</div>
                <div className="text-xs text-muted-foreground">{workstreamBarStatus(w)}{w.workstreamPriority ? ` · ${w.workstreamPriority}` : ""}{w.nextSteps ? ` · Next: ${w.nextSteps.slice(0, 90)}` : ""}</div>
              </div>
              <Button size="sm" variant="outline" className="h-7" onClick={() => onAction({
                sourceKind: "workstream", sourceId: `ws:${w.gid}`, title: `${w.company} – ${w.name}`,
                text: [w.notes, w.traction, w.dellStakeholders && `Dell stakeholders: ${w.dellStakeholders}`, w.lastActivity && `Last activity: ${w.lastActivity}`].filter(Boolean).join("\n"),
                nextSteps: w.nextSteps ? [w.nextSteps] : [], people: [], portcos: [w.company],
                tracks: w.segment === "BD" || w.segment === "GTM" ? [w.segment] : [],
              })}><Zap className="h-3.5 w-3.5 mr-1" />Action Now</Button>
            </div>
          ))}
        </div>
      </CardContent></Card>
      {keys.length > 0 && <WorkstreamSummary keys={keys} scopeLabel={owner} actionOwner={owner} points={[]} />}
    </div>
  );
}

function FollowUpsTab({ owner, onAction }: { owner: string; onAction: (c: ActionContext) => void }) {
  const ownerEmail = teamMemberFor(owner)?.email || "";
  const fetchHome = useServerFn(fetchHomeMomentum);
  const { data, isLoading } = useQuery({ queryKey: ["my-actions", "followups", ownerEmail], queryFn: () => fetchHome({ data: { email: ownerEmail, scope: "mine" } }), enabled: !!ownerEmail, staleTime: 60_000 });
  const rows = [...(data?.reminders || [])].sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  if (!ownerEmail) return <p className="text-sm text-muted-foreground">No email on file for {owner}.</p>;
  return (
    <Card><CardContent className="p-0">
      {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading follow-ups…</p>}
      {!isLoading && !rows.length && <p className="p-4 text-sm text-muted-foreground">No open follow-ups.</p>}
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
            <Badge variant="outline" className="text-[10px]">{r.source}</Badge>
            <div className="min-w-[220px] flex-1">
              <div className="text-sm font-medium">{r.person}{r.company ? ` · ${r.company}` : ""}</div>
              <div className="text-xs text-muted-foreground">{r.due ? `Due ${r.due}` : "No date"} · {r.summary}</div>
            </div>
            {r.campaignId && <Button asChild size="sm" variant="ghost" className="h-7"><Link to="/campaigns">Campaign <ExternalLink className="h-3 w-3 ml-1" /></Link></Button>}
            <Button size="sm" variant="outline" className="h-7" onClick={() => onAction({
              sourceKind: "followup", sourceId: r.activityId || r.id, title: r.summary || `Follow-up with ${r.person}`,
              text: r.originalNote || r.summary, people: [{ name: r.person, email: r.email || "" }],
              portcos: r.source === "Notes" && r.company ? r.company.split(/\s*,\s*/) : [], followUpActivityId: r.activityId,
            })}><Zap className="h-3.5 w-3.5 mr-1" />Action Now</Button>
          </div>
        ))}
      </div>
    </CardContent></Card>
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

import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Contact, PortfolioCompany, PortfolioEvent } from "@/lib/types";
import { fetchContacts, fetchPortfolioCompanies } from "@/utils/sheets.functions";
import {
  fetchAsanaPortcoData,
  refreshAsanaCacheFn,
} from "@/utils/asana.functions";
import {
  buildMatrixPoints,
  cleanPriority,
  matrixInvestors,
  matrixPriorities,
  matrixSectors,
} from "@/lib/portco-matrix";
import { PortcoMatrix } from "@/components/dashboard/PortcoMatrix";
import { MatrixStatsPanel } from "@/components/dashboard/MatrixStatsPanel";
import { ActivityCharts } from "@/components/dashboard/ActivityCharts";
import { WorkstreamSummary, CompanyLogo } from "@/components/dashboard/WorkstreamSummary";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { KnowledgePanel } from "@/components/knowledge/KnowledgePanel";
import { NotesImports } from "@/components/knowledge/NotesImports";
import { ConnectMailboxButton } from "@/components/knowledge/ConnectMailboxButton";
import { computeScopeActivity } from "@/lib/dashboard-activity";
import { useWorkstreams } from "@/lib/use-workstreams";
import { ACTION_OWNERS, ownerMatches } from "@/lib/action-owners";
import { workstreamBarStatus } from "@/lib/workstream-parse";
import type { NoteInboxItem } from "@/utils/notes-inbox.server";
import type { ReactNode } from "react";

import { portCoKey } from "@/lib/portco-canonical";
import { PortfolioDetail } from "@/components/portfolio/PortfolioDetail";
import { extractDomain } from "@/lib/domain-utils";
import { normalizeFocusArea } from "@/lib/focus-area-utils";
import { matchSheetToAsanaKeys } from "@/lib/portco-names";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

const EMPTY_FIELDS: Record<string, Record<string, string>> = {};
const EMPTY_NAMES: Record<string, string> = {};
const EMPTY_EVENTS: Record<string, PortfolioEvent[]> = {};

export const Route = createFileRoute("/dashboard")({
  validateSearch: (search: Record<string, unknown>): { owner?: string; section?: string } => ({
    owner: typeof search.owner === "string" ? search.owner : undefined,
    section: typeof search.section === "string" ? search.section : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Dashboard — VenturePulse" },
      { name: "description", content: "PortCo prioritization by sales and GTM maturity" },
      { property: "og:title", content: "Dashboard — VenturePulse" },
      {
        property: "og:description",
        content: "PortCo prioritization by sales and GTM maturity",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async () => {
    const withTimeout = <T,>(p: Promise<T>, fallback: T, ms = 5000): Promise<T> =>
      Promise.race([
        p.catch(() => fallback),
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
      ]);

    // Asana is fetched on the client (see useQuery below) so a slow Asana call
    // can never hang the server render and abort the request.
    const [contacts, portfolio] = await Promise.all([
      withTimeout<Contact[]>(fetchContacts(), []),
      withTimeout<PortfolioCompany[]>(fetchPortfolioCompanies(), []),
    ]);

    return { contacts, companies: portfolio || [] };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { contacts, companies } = Route.useLoaderData();
  const fetchAsana = useServerFn(fetchAsanaPortcoData);
  const { data: asana } = useQuery({
    queryKey: ["asana-portco-data"],
    queryFn: () => fetchAsana(),
    staleTime: 60_000,
  });

  const asanaFieldsByPortco = asana?.fieldsByCompanyName ?? EMPTY_FIELDS;
  const portcoNames = asana?.namesByCompanyName ?? EMPTY_NAMES;
  const eventsByPortco = (asana?.eventsByCompanyName ?? EMPTY_EVENTS) as Record<
    string,
    PortfolioEvent[]
  >;

  // Asana keys and sheet names disagree ("VAST" vs "VAST Data"), so match fuzzily
  // before attaching websites / domains — otherwise logos fall back to a guess.
  const { websiteByPortco, sectorByPortco } = useMemo(() => {
    const sheetList = (companies || []).filter((p) => (p.name || "").trim());
    const sheetToAsana = matchSheetToAsanaKeys(
      sheetList.map((p) => p.name),
      Object.keys(asanaFieldsByPortco),
      (k) => portcoNames[k] || k,
    );
    const websites: Record<string, string> = {};
    const sectors: Record<string, string> = {};
    for (const p of sheetList) {
      const dom = p.domain || normalizeFocusArea(p.sector);
      for (const key of [portCoKey(p.name || ""), sheetToAsana.get(p.name) || ""]) {
        if (!key) continue;
        if (p.website && !websites[key]) websites[key] = p.website;
        if (dom && !sectors[key]) sectors[key] = dom;
      }
    }
    return { websiteByPortco: websites, sectorByPortco: sectors };
  }, [companies, asanaFieldsByPortco, portcoNames]);
  const [investor, setInvestor] = useState("");
  const [sector, setSector] = useState("");
  const [priority, setPriority] = useState("");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const owner = ACTION_OWNERS.find((o) => o.name === search.owner)?.name || "";
  const destination = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!owner || !["notes", "workstreams"].includes(search.section || "")) return;
    // Run after the router restores the previous page position.
    const timer = window.setTimeout(() => destination.current?.scrollIntoView({ block: "start" }), 250);
    return () => window.clearTimeout(timer);
  }, [owner, search.section]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const refreshAsana = useServerFn(refreshAsanaCacheFn);

  const detailCompany = useMemo(
    () => (detailKey ? companies.find((c) => portCoKey(c.name || "") === detailKey) : undefined),
    [detailKey, companies],
  );
  const detailContacts = useMemo(() => {
    const d = detailCompany ? extractDomain(detailCompany.website) : "";
    if (!d) return [];
    return contacts.filter((c) => extractDomain(c.email) === d);
  }, [detailCompany, contacts]);
  const detailIntros = useMemo(() => {
    const name = (detailCompany?.name || "").trim().toLowerCase();
    if (!name) return [];
    return contacts.filter((c) =>
      (c.portCoIntros || []).some((p) => p.trim().toLowerCase() === name),
    );
  }, [detailCompany, contacts]);

  const points = useMemo(
    () =>
      buildMatrixPoints(asanaFieldsByPortco, portcoNames, websiteByPortco, sectorByPortco),
    [asanaFieldsByPortco, portcoNames, websiteByPortco, sectorByPortco],
  );
  const investors = useMemo(() => matrixInvestors(points), [points]);
  const sectors = useMemo(() => matrixSectors(points), [points]);
  const priorities = useMemo(() => matrixPriorities(points), [points]);
  const { workstreams: allWorkstreams } = useWorkstreams();
  const ownerKeys = useMemo(
    () =>
      owner
        ? new Set(allWorkstreams.filter((w) => ownerMatches(w.owner, owner)).map((w) => w.companyKey))
        : null,
    [owner, allWorkstreams],
  );
  const inFilter = (p: (typeof points)[number]) =>
    (!investor || p.investor === investor) &&
    (!sector || p.sectors.includes(sector)) &&
    (!priority || cleanPriority(p.priority) === priority) &&
    (!ownerKeys || ownerKeys.has(p.key));

  const selected = selectedKey ? points.find((p) => p.key === selectedKey) : undefined;
  const filtered = points.filter(inFilter);
  const scope = selected ? [selected] : filtered;
  const scopeKind = selected
    ? "company"
    : investor || sector || priority || owner
      ? "investor"
      : "all";
  const scopeLabel = selected
    ? selected.name
    : [investor, sector, priority, owner].filter(Boolean).join(" · ") || "Entire portfolio";

  const activity = useMemo(
    () => computeScopeActivity(new Set(scope.map((p) => p.key)), contacts, eventsByPortco),
    [scope, contacts, eventsByPortco],
  );
  const scopeKeys = useMemo(() => scope.map((p) => p.key), [scope]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Where each portfolio company sits on sales and go-to-market maturity, sized by
            investment. Click a company for its own numbers.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
        <ConnectMailboxButton />
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            try {
              await refreshAsana();
              await queryClient.invalidateQueries({ queryKey: ["asana-portco-data"] });
              await router.invalidate();
            } finally {
              setRefreshing(false);
            }
          }}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh Asana data"}
        </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h2 className="font-display text-sm font-semibold text-foreground">
                PortCo Prioritization
              </h2>
              <div className="flex items-center gap-2 shrink-0">
                <Select
                  value={owner || "all"}
                  onValueChange={(v) => {
                    void navigate({ search: (prev) => ({ ...prev, owner: v === "all" ? undefined : v }) });
                    setSelectedKey(null);
                  }}
                >
                  <SelectTrigger className="h-8 w-36 text-xs bg-card">
                    <SelectValue placeholder="All action owners" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All action owners</SelectItem>
                    {ACTION_OWNERS.map((o) => (
                      <SelectItem key={o.name} value={o.name}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={investor || "all"}
                  onValueChange={(v) => {
                    setInvestor(v === "all" ? "" : v);
                    setSelectedKey(null);
                  }}
                >
                  <SelectTrigger className="h-8 w-36 text-xs bg-card">
                    <SelectValue placeholder="All investors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All investors</SelectItem>
                    {investors.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={sector || "all"}
                  onValueChange={(v) => {
                    setSector(v === "all" ? "" : v);
                    setSelectedKey(null);
                  }}
                >
                  <SelectTrigger className="h-8 w-36 text-xs bg-card">
                    <SelectValue placeholder="All domains" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All domains</SelectItem>
                    {sectors.map((sc) => (
                      <SelectItem key={sc} value={sc}>
                        {sc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={priority || "all"}
                  onValueChange={(v) => {
                    setPriority(v === "all" ? "" : v);
                    setSelectedKey(null);
                  }}
                >
                  <SelectTrigger className="h-8 w-36 text-xs bg-card">
                    <SelectValue placeholder="All priorities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All priorities</SelectItem>
                    {priorities.map((pr) => (
                      <SelectItem key={pr} value={pr}>
                        {pr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {points.length === 0 ? (
              <p className="text-sm text-muted-foreground py-16 text-center">
                No portfolio companies came back from Asana.
              </p>
            ) : (
              <PortcoMatrix
                points={points}
                investor={investor}
                sector={sector}
                priority={priority}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
                allowedKeys={ownerKeys}
              />
            )}
          </CardContent>
        </Card>

        <MatrixStatsPanel
          scope={scope}
          scopeLabel={scopeLabel}
          scopeKind={scopeKind}
          contacts={contacts}
          eventsByPortco={eventsByPortco}
          onOpenCompany={setDetailKey}
        />
      </div>

      <ActivityCharts monthly={activity.monthly} scopeLabel={scopeLabel} />

      {owner && (
        <>
          <div ref={search.section === "workstreams" ? destination : undefined} className="scroll-mt-6">
          <WorkstreamOverview key={`${owner}:${search.section}`} initiallyOpen={search.section === "workstreams"} keys={scopeKeys} owner={owner} scopeLabel={scopeLabel} points={points}>
            <WorkstreamSummary
              keys={scopeKeys}
              scopeLabel={scopeLabel}
              actionOwner={owner}
              points={points}
            />
          </WorkstreamOverview>
          </div>
        </>
      )}
      {scopeKind === "company" && (
        <>
          <ActivityFeed
            keys={scopeKeys}
            scopeLabel={scopeLabel}
            showCompany={false}
            allScope={false}
          />
          <KnowledgePanel company={scopeLabel} />
        </>
      )}
      {owner && <div ref={search.section === "notes" ? destination : undefined} className="scroll-mt-6"><ReviewInboxes key={`${owner}:${search.section}`} initiallyOpen={search.section === "notes"} owner={owner} points={points} /></div>}

      <PortfolioDetail
        company={detailCompany ?? null}
        open={!!detailCompany}
        onOpenChange={(o) => {
          if (!o) setDetailKey(null);
        }}
        crmContacts={detailContacts}
        crmIntros={detailIntros}
      />
    </div>
  );
}


function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-[72px]">
      <div className="font-display text-2xl font-semibold leading-none text-foreground tabular-nums">{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

const STATUS_DOT: [RegExp, string][] = [
  [/stalled|blocked/i, "bg-red-500"],
  [/early|not started|on hold/i, "bg-zinc-400"],
  [/working|progress|active/i, "bg-emerald-500"],
  [/complete|done/i, "bg-sky-500"],
];
const PRIORITY_DOT: [RegExp, string][] = [
  [/high|needle/i, "bg-red-500"],
  [/medium|nurture/i, "bg-amber-400"],
  [/low|back ?burner/i, "bg-zinc-400"],
];
const TRACK_DOT: Record<string, string> = {
  BD: "bg-sky-500",
  GTM: "bg-emerald-500",
  Workstream: "bg-violet-500",
  News: "bg-amber-400",
};

function dotFor(label: string, map: [RegExp, string][]): string {
  for (const [re, cls] of map) if (re.test(label)) return cls;
  return "bg-muted-foreground/40";
}

function DotChips({ counts, map }: { counts: Record<string, number>; map?: [RegExp, string][] }) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {rows.map(([k, n]) => (
        <span key={k} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`h-2 w-2 rounded-full ${map ? dotFor(k, map) : (TRACK_DOT[k] ?? "bg-muted-foreground/40")}`} />
          {k} <b className="text-foreground tabular-nums">{n}</b>
        </span>
      ))}
    </div>
  );
}

function LogoCounts({ counts, points }: { counts: Record<string, number>; points: { name: string; website: string }[] }) {
  const byName = useMemo(() => new Map(points.map((p) => [p.name, p])), [points]);
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {rows.map(([name, n]) => (
        <span
          key={name}
          title={`${name} · ${n}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-0.5 pl-0.5 pr-2"
        >
          <span className="[&>span]:h-6 [&>span]:w-6 [&_img]:h-full [&_img]:w-full">
            <CompanyLogo name={name} website={byName.get(name)?.website || ""} />
          </span>
          <span className="text-xs font-semibold text-foreground tabular-nums">{n}</span>
        </span>
      ))}
    </div>
  );
}

function tally(xs: string[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const x of xs) o[x || "None"] = (o[x || "None"] || 0) + 1;
  return o;
}

function SummaryCard({ title, sub, open, onToggle, children }: {
  title: string; sub: string; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
          <Button size="sm" variant={open ? "secondary" : "outline"} onClick={onToggle}>
            {open ? "Close" : "Manage"}
          </Button>
        </div>
        <div className="mt-3 space-y-3">{children}</div>
      </CardContent>
    </Card>
  );
}

function WorkstreamOverview({ keys, owner, scopeLabel, points, children, initiallyOpen = false }: {
  keys: string[]; owner: string; scopeLabel: string;
  points: { name: string; website: string }[]; children: ReactNode; initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const { workstreams } = useWorkstreams();
  const ws = useMemo(() => {
    const set = new Set(keys);
    return workstreams.filter((w) => set.has(w.companyKey) && (!owner || ownerMatches(w.owner, owner)));
  }, [workstreams, keys, owner]);
  const statuses = ws.map((w) => workstreamBarStatus(w));
  const done = statuses.filter((s) => /complete/i.test(s)).length;
  return (
    <div className="space-y-3">
      <SummaryCard title="Workstreams" sub={scopeLabel} open={open} onToggle={() => setOpen((o) => !o)}>
        <div className="flex flex-wrap items-start gap-8">
          <div className="flex flex-wrap gap-8">
            <Stat label="Streams" value={ws.length} />
            <Stat label="Active" value={ws.length - done} />
            <Stat label="Completed" value={done} />
            <Stat label="PortCos" value={new Set(ws.map((w) => w.companyKey)).size} />
          </div>
          <div className="ml-auto flex w-fit max-w-full flex-col items-end gap-2 self-center pr-1">
            <DotChips counts={tally(statuses)} map={STATUS_DOT} />
            <DotChips counts={tally(ws.map((w) => (w.workstreamPriority || "No priority")))} map={PRIORITY_DOT} />
          </div>
        </div>
        <LogoCounts counts={tally(ws.map((w) => w.company))} points={points} />
      </SummaryCard>
      {open && children}
    </div>
  );
}

function ReviewInboxes({ owner, points, initiallyOpen = false }: { owner: string; points: { name: string; website: string }[]; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [tab, setTab] = useState<"notes" | "activity">("notes");
  const [counts, setCounts] = useState({ notes: 0, activity: 0 });
  const [reviewed, setReviewed] = useState({ notes: 0, activity: 0 });
  const [acts, setActs] = useState<NoteInboxItem[]>([]);
  const [notes, setNotesItems] = useState<NoteInboxItem[]>([]);
  const setNotesStats = useCallback((s: { pending: number; reviewed: number }) => {
    setCounts((c) => ({ ...c, notes: s.pending }));
    setReviewed((r) => ({ ...r, notes: s.reviewed }));
  }, []);
  const setActivityStats = useCallback((s: { pending: number; reviewed: number }) => {
    setCounts((c) => ({ ...c, activity: s.pending }));
    setReviewed((r) => ({ ...r, activity: s.reviewed }));
  }, []);
  return (
    <div className="space-y-3">
      <SummaryCard title="Notes & Activity" sub={`${owner} · Waiting for Review`} open={open} onToggle={() => setOpen((o) => !o)}>
        <div className="flex flex-wrap items-start gap-8">
          <div className="flex flex-wrap gap-8">
            <Stat label="To Review" value={counts.notes + counts.activity} />
            <Stat label="Reviewed" value={reviewed.notes + reviewed.activity} />
            <Stat label="Notes" value={counts.notes} />
            <Stat label="Emails" value={counts.activity} />
          </div>
          <div className="ml-auto flex w-fit max-w-full flex-col items-end gap-2 self-center pr-1">
            <DotChips counts={tally(acts.map((i) => i.track || "Untagged"))} />
          </div>
        </div>
        <LogoCounts counts={tally([...notes, ...acts].map((i) => i.portco).filter(Boolean))} points={points} />
      </SummaryCard>
      <div className={open ? "space-y-2" : "hidden"}>
        <div className="inline-flex rounded-md border border-border p-0.5">
          {(["notes", "activity"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded px-3 py-1 text-sm ${tab === k ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}
            >
              {k === "notes" ? "Notes Imports" : "Activity Review"}
              <span className="ml-1.5 rounded bg-muted px-1.5 text-xs text-muted-foreground">{counts[k]}</span>
            </button>
          ))}
        </div>
        <div className={tab === "notes" ? "" : "hidden"}><NotesImports actionOwner={owner} onItems={setNotesItems} onStats={setNotesStats} /></div>
        <div className={tab === "activity" ? "" : "hidden"}><NotesImports kind="activity" actionOwner={owner} onItems={setActs} onStats={setActivityStats} /></div>
      </div>
    </div>
  );
}

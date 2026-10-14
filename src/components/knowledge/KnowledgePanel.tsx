// Knowledge & activity panel for a single PortCo (dashboard, below the
// workstreams). Shows harvested activities (email/meeting minutes) plus recent
// knowledge records, with a 6/12-month window toggle. Each entry expands to
// its summary and a link to the source (Gmail thread or Drive doc).

import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Mail, Newspaper, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { portcoMatches, useKnowledge } from "@/lib/use-knowledge";
import { runKnowledgeHarvestFn } from "@/utils/knowledge.functions";
import type { HarvestedActivity, KnowledgeRecord } from "@/utils/knowledge.server";

interface Props {
  /** Display name of the selected company. */
  company: string;
}

const TYPE_COLORS: Record<string, string> = {
  intro: "bg-emerald-500/15 text-emerald-400",
  meeting: "bg-sky-500/15 text-sky-400",
  email: "bg-slate-500/15 text-slate-300",
  event: "bg-violet-500/15 text-violet-400",
  "follow-up": "bg-amber-500/15 text-amber-400",
  update: "bg-cyan-500/15 text-cyan-400",
  news: "bg-rose-500/15 text-rose-400",
};

function typeChip(type: string) {
  const t = (type || "email").toLowerCase();
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", TYPE_COLORS[t] || TYPE_COLORS.email)}>
      {t}
    </span>
  );
}

function sourceIcon(sourceType: string) {
  if (sourceType.startsWith("gmail")) return <Mail className="h-3.5 w-3.5 text-muted-foreground" />;
  if (sourceType === "gmail-news") return <Newspaper className="h-3.5 w-3.5 text-muted-foreground" />;
  return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
}

function monthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function KnowledgePanel({ company }: Props) {
  const { records, activities, loading, refresh } = useKnowledge();
  const [windowMonths, setWindowMonths] = useState<6 | 12>(6);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [harvesting, setHarvesting] = useState(false);

  const cutoff = monthsAgo(windowMonths);

  const companyActivities = useMemo(
    () =>
      activities
        .filter((a) => portcoMatches(a.portco, company) && (a.date || "") >= cutoff)
        .sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [activities, company, cutoff],
  );

  const companyRecords = useMemo(
    () =>
      records
        .filter((r) => portcoMatches(r.portco, company) && (r.date || "") >= cutoff)
        .sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [records, company, cutoff],
  );

  const recordById = useMemo(() => new Map(records.map((r) => [r.recordId, r])), [records]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runHarvest = async () => {
    setHarvesting(true);
    try {
      await runKnowledgeHarvestFn();
      await refresh();
    } finally {
      setHarvesting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Knowledge &amp; activity — {company}</CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border text-xs">
            {([6, 12] as const).map((m) => (
              <button
                key={m}
                onClick={() => setWindowMonths(m)}
                className={cn(
                  "px-2.5 py-1",
                  windowMonths === m ? "bg-accent text-foreground" : "text-muted-foreground",
                )}
              >
                {m} mo
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={runHarvest} disabled={harvesting}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", harvesting && "animate-spin")} />
            {harvesting ? "Harvesting…" : "Harvest now"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading knowledge…</p>
        ) : companyActivities.length === 0 && companyRecords.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No harvested activity for {company} in the last {windowMonths} months. Email the tracking
            aliases or drop notes into the Venture Pulse KB Drive, then hit Harvest now.
          </p>
        ) : (
          <>
            {companyActivities.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Activity ({companyActivities.length})
                </p>
                {companyActivities.map((a) => (
                  <ActivityRow
                    key={a.activityId}
                    activity={a}
                    record={recordById.get(a.recordId)}
                    open={expanded.has(a.activityId)}
                    onToggle={() => toggle(a.activityId)}
                  />
                ))}
              </div>
            )}
            {companyRecords.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Source material ({companyRecords.length})
                </p>
                {companyRecords.map((r) => (
                  <RecordRow key={r.recordId} record={r} open={expanded.has(r.recordId)} onToggle={() => toggle(r.recordId)} />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityRow({
  activity: a,
  record,
  open,
  onToggle,
}: {
  activity: HarvestedActivity;
  record?: KnowledgeRecord;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-md border border-border">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        <span className="w-20 shrink-0 text-xs text-muted-foreground">{a.date}</span>
        {typeChip(a.type)}
        <span className="min-w-0 flex-1 truncate text-sm">{a.title}</span>
        {a.person && <span className="shrink-0 text-xs text-muted-foreground">{a.person}</span>}
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {a.summary && <p className="text-sm text-muted-foreground">{a.summary}</p>}
          {record?.participants && (
            <p className="text-xs text-muted-foreground">Participants: {record.participants}</p>
          )}
          {a.sourceUrl && (
            <a
              href={a.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Open source <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function RecordRow({ record: r, open, onToggle }: { record: KnowledgeRecord; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-md border border-border">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        {sourceIcon(r.sourceType)}
        <span className="w-20 shrink-0 text-xs text-muted-foreground">{r.date}</span>
        <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {r.summary && <p className="text-sm text-muted-foreground">{r.summary}</p>}
          {r.participants && <p className="text-xs text-muted-foreground">Participants: {r.participants}</p>}
          {r.sourceUrl && (
            <a
              href={r.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Open source <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

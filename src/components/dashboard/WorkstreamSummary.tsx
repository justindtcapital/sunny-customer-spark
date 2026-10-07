import { useMemo, useState } from "react";
import { Loader2, Rocket, Handshake } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { WorkstreamRow } from "@/components/portfolio/WorkstreamsPanel";
import { useWorkstreams } from "@/lib/use-workstreams";
import type { Workstream } from "@/lib/workstream-parse";
import { ownerMatches, priorityRank } from "@/lib/action-owners";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  keys: string[];
  scopeLabel: string;
  showCompany: boolean;
  actionOwner?: string;
}

type StatusFilter = "all" | "open" | "done";
type SortKey = "priority" | "company" | "status";

function sortItems(items: Workstream[], sort: SortKey): Workstream[] {
  const cmp = (a: Workstream, b: Workstream) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (sort === "priority") {
      const d = priorityRank(a.workstreamPriority) - priorityRank(b.workstreamPriority);
      if (d) return d;
    } else if (sort === "status") {
      const d = (a.workstreamStatus || "~").localeCompare(b.workstreamStatus || "~");
      if (d) return d;
    }
    return a.company.localeCompare(b.company) || a.name.localeCompare(b.name);
  };
  return [...items].sort(cmp);
}

function Box({
  title,
  icon,
  items,
  showCompany,
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  items: Workstream[];
  showCompany: boolean;
  loading: boolean;
}) {
  const open = items.filter((w) => !w.completed).length;
  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="font-display text-sm font-semibold text-foreground">{title}</h3>
          </div>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {open} active · {items.length - open} complete
          </p>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-6">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading workstreams…
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6">No workstreams on record.</p>
        ) : (
          <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {items.map((w) => (
              <WorkstreamRow key={w.gid} w={w} showCompany={showCompany} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WorkstreamSummary({ keys, scopeLabel, showCompany, actionOwner = "" }: Props) {
  const { workstreams, loading } = useWorkstreams();
  const keySet = useMemo(() => new Set(keys), [keys]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("priority");

  const { gtm, bd } = useMemo(() => {
    const inScope = workstreams.filter(
      (w) =>
        keySet.has(w.companyKey) &&
        ownerMatches(w.owner, actionOwner) &&
        (status === "all" || (status === "done" ? w.completed : !w.completed)),
    );
    return {
      gtm: sortItems(inScope.filter((w) => w.segment === "GTM"), sort),
      bd: sortItems(inScope.filter((w) => w.segment !== "GTM"), sort),
    };
  }, [workstreams, keySet, actionOwner, status, sort]);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-sm font-semibold text-foreground">Major workstreams</h2>
          <p className="text-xs text-muted-foreground">
            {scopeLabel}
            {actionOwner ? ` · ${actionOwner}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="h-8 w-32 text-xs bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">In progress</SelectItem>
              <SelectItem value="done">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-8 w-36 text-xs bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Sort: Priority</SelectItem>
              <SelectItem value="company">Sort: Company</SelectItem>
              <SelectItem value="status">Sort: Status</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Box
          title="Go-to-market"
          icon={<Rocket className="h-4 w-4 text-primary" />}
          items={gtm}
          showCompany={showCompany}
          loading={loading}
        />
        <Box
          title="Business development"
          icon={<Handshake className="h-4 w-4 text-primary" />}
          items={bd}
          showCompany={showCompany}
          loading={loading}
        />
      </div>
    </section>
  );
}

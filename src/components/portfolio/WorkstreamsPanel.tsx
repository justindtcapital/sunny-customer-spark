import { useMemo, useState } from "react";
import type { Workstream } from "@/lib/workstream-parse";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, GitBranch, Loader2, RefreshCw } from "lucide-react";

export function statusTone(status: string): string {
  const s = (status || "").toLowerCase();
  if (s.includes("complete") && !s.includes("working"))
    return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
  if (s.includes("working")) return "bg-amber-500/10 text-amber-600 border-amber-500/30";
  if (!s) return "bg-muted text-muted-foreground border-border";
  return "bg-sky-500/10 text-sky-600 border-sky-500/30";
}

export function WorkstreamRow({ w, showCompany = false }: { w: Workstream; showCompany?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground truncate">
            {showCompany && (
              <span className="text-muted-foreground font-normal">{w.company} · </span>
            )}
            {w.name || w.rawName}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {[w.owner || "Unassigned", w.category || "No category", w.dellTargets]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className={`text-[10px] ${statusTone(w.status)}`}>
            {w.status || "Not set"}
          </Badge>
          {w.lastActivity && (
            <span className="text-[10px] tabular-nums text-muted-foreground">{w.lastActivity}</span>
          )}
        </div>
      </div>
      {w.nextSteps && (
        <p className="mt-1.5 text-[11px] text-muted-foreground line-clamp-2">
          <span className="font-medium text-foreground/80">Next: </span>
          {w.nextSteps}
        </p>
      )}
    </div>
  );
}

function Group({
  label,
  items,
  showCompany,
  defaultOpen = true,
}: {
  label: string;
  items: Workstream[];
  showCompany?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
          {items.length}
        </span>
      </button>
      {open && items.map((w) => <WorkstreamRow key={w.gid} w={w} showCompany={showCompany} />)}
    </div>
  );
}

/** Groups a workstream list into BD / GTM / Other with completed ones collapsed. */
export function WorkstreamGroups({
  workstreams,
  showCompany,
}: {
  workstreams: Workstream[];
  showCompany?: boolean;
}) {
  const { bd, gtm, other, done } = useMemo(() => {
    const open = workstreams.filter((w) => !w.completed);
    return {
      bd: open.filter((w) => w.segment === "BD"),
      gtm: open.filter((w) => w.segment === "GTM"),
      other: open.filter((w) => w.segment === "Other"),
      done: workstreams.filter((w) => w.completed),
    };
  }, [workstreams]);

  if (workstreams.length === 0)
    return <p className="text-xs text-muted-foreground py-4">No workstreams in Asana yet.</p>;

  return (
    <div className="space-y-3">
      <Group label="BD" items={bd} showCompany={showCompany} />
      <Group label="GTM" items={gtm} showCompany={showCompany} />
      <Group label="Other" items={other} showCompany={showCompany} />
      <Group label="Completed" items={done} showCompany={showCompany} defaultOpen={false} />
    </div>
  );
}

/** Card wrapper used on the portfolio-company detail page. */
export function WorkstreamsPanel({
  workstreams,
  loading,
  onRefresh,
}: {
  workstreams: Workstream[];
  loading?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <GitBranch className="h-4 w-4 text-primary" /> Workstreams ({workstreams.length})
        </h3>
        {onRefresh && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onRefresh} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        )}
      </div>
      {loading && workstreams.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading workstreams…
        </p>
      ) : (
        <WorkstreamGroups workstreams={workstreams} />
      )}
    </div>
  );
}

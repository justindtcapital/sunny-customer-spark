import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { workstreamTrailFn } from "@/utils/actions.functions";
import { canonicalOwnerName } from "@/lib/user-ownership";

/** Read-only "Recent activity" list under a workstream's follow-ups in My Actions. */
export function WorkstreamTrail({ gid, company, segment }: { gid: string; company: string; segment: string }) {
  const load = useServerFn(workstreamTrailFn);
  const [all, setAll] = useState(false);
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["my-actions", "trail", gid],
    queryFn: () => load({ data: { gid, company, segment } }),
    staleTime: 60_000,
  });
  const shown = all ? data : data.slice(0, 4);
  return (
    <div className="space-y-1 border-t border-border pt-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <History className="h-3.5 w-3.5" />Recent activity{data.length ? ` · ${data.length}` : ""}
      </div>
      {isLoading && <p className="px-2 py-1 text-xs text-muted-foreground">Loading activity…</p>}
      {isError && <p role="alert" className="px-2 py-1 text-xs text-destructive">Couldn't load activity. <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => void refetch()}>Retry</Button></p>}
      {!isLoading && !isError && !data.length && <p className="px-2 py-1 text-xs text-muted-foreground">No emails, logged actions or notes recorded yet.</p>}
      {shown.map((a) => (
        <div key={a.id} className="rounded-md px-2 py-1.5 hover:bg-muted/40">
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="outline" className="shrink-0 px-1 text-[10px]">{a.label}</Badge>
            <span className="min-w-0 flex-1 truncate text-sm" title={a.title}>{a.title}</span>
            {a.url && <a href={a.url} target="_blank" rel="noreferrer" aria-label="Open source" className="shrink-0 text-primary"><ExternalLink className="h-3.5 w-3.5" /></a>}
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{a.date ? `${Number(a.date.slice(5, 7))}/${Number(a.date.slice(8, 10))}${a.date.slice(0, 4) !== String(new Date().getFullYear()) ? `/${a.date.slice(2, 4)}` : ""}` : "—"}</span>
          </div>
          {(a.person || a.owner) && <div className="mt-0.5 truncate pl-1 text-[11px] text-muted-foreground">{[a.person, a.owner && `by ${canonicalOwnerName(a.owner)}`].filter(Boolean).join(" · ")}</div>}
        </div>
      ))}
      {data.length > 4 && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAll((v) => !v)}>{all ? "Show less" : `Show ${data.length - 4} more`}</Button>}
    </div>
  );
}

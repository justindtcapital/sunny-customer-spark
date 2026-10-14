// Workstream review queue — shown on the dashboard workstream view only.
// Every harvested item Gemini matched to a workstream (minutes, uploads,
// workstreams@ emails) lands here for a human decision: Confirm, Change,
// Create new (VP-only workstream), or Ignore.

import { useMemo, useState } from "react";
import { Check, EyeOff, GitBranchPlus, Loader2, Shuffle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useKnowledge } from "@/lib/use-knowledge";
import { useWorkstreams } from "@/lib/use-workstreams";
import { reviewWorkstreamLinkFn } from "@/utils/knowledge.functions";
import type { WorkstreamLink } from "@/utils/knowledge.server";
import { cn } from "@/lib/utils";

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-400",
  medium: "bg-amber-500/15 text-amber-400",
  low: "bg-slate-500/15 text-slate-300",
};

export function WorkstreamReviewQueue() {
  const { links, records, loading, refresh } = useKnowledge();
  const { workstreams } = useWorkstreams();
  const [busy, setBusy] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);

  const recordById = useMemo(() => new Map(records.map((r) => [r.recordId, r])), [records]);

  const pending = useMemo(
    () => links.filter((l) => l.status === "matched" || l.status === "suggested" || l.status === "create-new"),
    [links],
  );
  const ignored = useMemo(() => links.filter((l) => l.status === "ignored"), [links]);

  const act = async (link: WorkstreamLink, action: "confirm" | "ignore", gid = "", name = "") => {
    setBusy(link.linkId);
    try {
      await reviewWorkstreamLinkFn({
        data: { linkId: link.linkId, action, workstreamGid: gid, workstreamName: name },
      });
      await refresh();
    } finally {
      setBusy(null);
      setChanging(null);
    }
  };

  if (loading || (pending.length === 0 && ignored.length === 0)) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">
          Workstream updates — needs review ({pending.length})
        </CardTitle>
        {ignored.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowIgnored((v) => !v)}>
            <EyeOff className="mr-1.5 h-3.5 w-3.5" />
            {showIgnored ? "Hide ignored" : `Ignored (${ignored.length})`}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {pending.map((link) => {
          const record = recordById.get(link.recordId);
          const companyWorkstreams = workstreams.filter(
            (w) => w.company.toLowerCase() === (link.portco || "").toLowerCase(),
          );
          return (
            <div key={link.linkId} className="rounded-md border border-border px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    CONFIDENCE_STYLES[link.confidence] || CONFIDENCE_STYLES.low,
                  )}
                >
                  {link.status === "create-new" ? "New workstream?" : link.status === "matched" ? "Matched" : "Suggested"}
                </span>
                <span className="text-sm font-medium">{record?.title || link.recordId}</span>
                <span className="text-xs text-muted-foreground">
                  → {link.portco || "?"} / {link.workstreamName || "?"}
                </span>
              </div>
              {record?.summary && (
                <p className="mt-1 text-xs text-muted-foreground">{record.summary}</p>
              )}
              {changing === link.linkId ? (
                <div className="mt-2 flex items-center gap-2">
                  <Select
                    onValueChange={(gid) => {
                      const ws = companyWorkstreams.find((w) => w.gid === gid);
                      if (ws) void act(link, "confirm", ws.gid, ws.name);
                    }}
                  >
                    <SelectTrigger className="h-8 w-72 text-xs">
                      <SelectValue placeholder="Pick the right workstream…" />
                    </SelectTrigger>
                    <SelectContent>
                      {companyWorkstreams.map((w) => (
                        <SelectItem key={w.gid} value={w.gid}>
                          {w.segment} · {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => setChanging(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === link.linkId}
                    onClick={() => void act(link, "confirm")}
                  >
                    {busy === link.linkId ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="mr-1 h-3.5 w-3.5" />
                    )}
                    Confirm
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setChanging(link.linkId)}>
                    <Shuffle className="mr-1 h-3.5 w-3.5" /> Change
                  </Button>
                  {link.status !== "create-new" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === link.linkId}
                      onClick={() => void act(link, "confirm", "", link.workstreamName)}
                    >
                      <GitBranchPlus className="mr-1 h-3.5 w-3.5" /> Create new (VP only)
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    disabled={busy === link.linkId}
                    onClick={() => void act(link, "ignore")}
                  >
                    <EyeOff className="mr-1 h-3.5 w-3.5" /> Ignore
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {showIgnored &&
          ignored.map((link) => (
            <div key={link.linkId} className="rounded-md border border-dashed border-border px-3 py-2 opacity-60">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">
                  {recordById.get(link.recordId)?.title || link.recordId} → {link.workstreamName}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === link.linkId}
                  onClick={() => void act(link, "confirm")}
                >
                  Restore
                </Button>
              </div>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

import type React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CircleDot, History } from "lucide-react";
import { workstreamTrailFn } from "@/utils/actions.functions";
import type { ThreadOrigin } from "@/lib/action-thread";

const md = (d: string) => d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}${d.slice(0, 4) !== String(new Date().getFullYear()) ? `/${d.slice(2, 4)}` : ""}` : "";

function Step({ icon: Icon, label, tone, children }: { icon: typeof History; label: string; tone?: "now"; children: React.ReactNode }) {
  return <div className={`min-w-0 space-y-1 rounded-md border p-3 ${tone === "now" ? "border-primary/40 bg-primary/5" : "border-border"}`}>
    <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${tone === "now" ? "text-primary" : "text-muted-foreground"}`}><Icon className="h-3.5 w-3.5" />{label}</div>
    <div className="min-w-0 text-sm">{children}</div>
  </div>;
}

/** Latest recorded activity on the follow-up's workstream (same read as Recent activity). */
function WorkstreamLatest({ ws }: { ws: { gid: string; company: string; segment: string; name: string } }) {
  const load = useServerFn(workstreamTrailFn);
  const { data = [], isLoading } = useQuery({ queryKey: ["my-actions", "trail", ws.gid], queryFn: () => load({ data: { gid: ws.gid, company: ws.company, segment: ws.segment } }), staleTime: 60_000 });
  const last = data[0];
  if (isLoading) return <p className="text-xs text-muted-foreground">Checking the workstream…</p>;
  if (!last) return null;
  return <p className="text-xs text-muted-foreground">Latest on {ws.name}: <span className="text-foreground">{last.title}</span>{last.date ? ` · ${md(last.date.slice(0, 10))}` : ""}</p>;
}

/**
 * Before → this action → next, side by side when the pane is wide enough.
 * Read-only; "next" opens that follow-up.
 */
export function ActionThread({ before, workstream, now, next, onOpenNext, done }: {
  before: ThreadOrigin | null;
  workstream?: { gid: string; company: string; segment: string; name: string };
  now: React.ReactNode;
  next?: { title: string; due: string };
  onOpenNext?: () => void;
  done?: boolean;
}) {
  return <div className="grid gap-2 @3xl:grid-cols-3">
    <Step icon={History} label="Before">
      {before ? <div className="space-y-1">
        <div className="text-xs text-muted-foreground">{before.label}{before.date ? ` · ${md(before.date)}` : ""}</div>
        {before.title && <div className="font-medium">{before.title}</div>}
        {before.text && <div className="line-clamp-4 whitespace-pre-wrap text-muted-foreground">{before.text}</div>}
      </div> : <p className="text-muted-foreground">No earlier step recorded.</p>}
      {workstream && <div className="mt-1"><WorkstreamLatest ws={workstream} /></div>}
    </Step>
    <Step icon={CircleDot} label={done ? "This action · done" : "This action"} tone="now">{now}</Step>
    <Step icon={ArrowRight} label="Next">
      {next ? <button type="button" onClick={onOpenNext} className="block w-full text-left hover:underline">
        <span className="font-medium">{next.title}</span>
        <span className="ml-1 text-xs text-muted-foreground">{next.due ? `due ${md(next.due.slice(0, 10))}` : "no date"}</span>
      </button> : <p className="text-muted-foreground">{done ? "Schedule it above, or move on." : "Nothing scheduled yet — you can set it when you complete this."}</p>}
    </Step>
  </div>;
}

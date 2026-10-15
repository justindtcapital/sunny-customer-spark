// Collapsible PortCo-pane section: a compact stats box (big numbers left, dot
// chips right) that expands to the full detail list — same look as the
// Dashboard's Workstreams / Notes & Activity summary cards.
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const TRACK_DOT: Record<string, string> = {
  BD: "bg-sky-500",
  GTM: "bg-emerald-500",
  Workstream: "bg-violet-500",
  News: "bg-amber-400",
  "Follow-up": "bg-rose-400",
  Granola: "bg-emerald-500",
  Upload: "bg-sky-500",
  Drive: "bg-amber-400",
  Planned: "bg-primary",
  Completed: "bg-muted-foreground/60",
  Network: "bg-sky-500",
  Logged: "bg-violet-500",
};

export function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-[56px]">
      <div className="font-display text-xl font-semibold leading-none text-foreground tabular-nums">{value}</div>
      <div className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

export function MiniDots({ counts }: { counts: Record<string, number> }) {
  const rows = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!rows.length) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      {rows.map(([k, n]) => (
        <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={`h-2 w-2 rounded-full ${TRACK_DOT[k] ?? "bg-muted-foreground/40"}`} />
          {k} <b className="text-foreground tabular-nums">{n}</b>
        </span>
      ))}
    </div>
  );
}

export function StatSection({ title, stats, dots, actions, children, defaultOpen = false }: {
  title: string;
  stats: { label: string; value: ReactNode }[];
  dots?: Record<string, number>;
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-left">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <h3 className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">{title}</h3>
        </button>
        <div className="flex items-center gap-1.5">
          {actions}
          <Button variant={open ? "secondary" : "outline"} size="sm" className="h-7 px-2 text-[11px]" onClick={() => setOpen((o) => !o)}>
            {open ? "Collapse" : "Expand"}
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap gap-6">
          {stats.map((s) => <MiniStat key={s.label} label={s.label} value={s.value} />)}
        </div>
        {dots && <div className="ml-auto max-w-[60%]"><MiniDots counts={dots} /></div>}
      </div>
      {open && <div className="mt-4 border-t border-border pt-4">{children}</div>}
    </section>
  );
}

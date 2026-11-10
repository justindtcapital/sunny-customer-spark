import { Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CompanyKind } from "@/lib/action-sort";

export const COMPANY_TOGGLES: { key: CompanyKind; label: string }[] = [
  { key: "portcos", label: "PortCo" },
  { key: "network", label: "Network" },
  { key: "ops", label: "PortDev Ops" },
];

export type InboxKind = "notes" | "activity";
export type InboxToggles = Record<InboxKind, boolean>;
export const DEFAULT_INBOX: InboxToggles = { notes: true, activity: true };
export type BannerView = "inbox" | "actions" | "done";

const FALLBACK_PRIORITIES = ["1. Must Do", "2. Should Do", "3. Could Do"];

/** Must → green, Should → yellow, Could → red (matched by wording or leading number). */
export function priorityTone(p: string) {
  if (/must|^\s*1\b/i.test(p)) return "border-good-foreground/50 bg-good text-good-foreground";
  if (/should|^\s*2\b/i.test(p)) return "border-warm-foreground/50 bg-warm text-warm-foreground";
  if (/could|^\s*3\b/i.test(p)) return "border-hot-foreground/50 bg-hot text-hot-foreground";
  return "border-border bg-muted text-foreground";
}
/** "1: High - Must Do" → "Must Do". */
export function priorityShort(p: string) {
  const m = p.match(/-\s*(.+)$/);
  return (m ? m[1]! : p.replace(/^\s*\d+\s*[:.)-]?\s*/, "")).trim();
}

const chipCls = (on: boolean) => cn("h-7 rounded-md border px-2.5 text-xs font-medium transition-colors",
  on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-accent/50");

function Chip({ label, count, on, onClick }: { label: string; count?: number; on: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={chipCls(on)}>
    {label}{count !== undefined && <span className="ml-1.5 tabular-nums opacity-70">{count}</span>}
  </button>;
}

const RowLabel = ({ children }: { children: React.ReactNode }) =>
  <span className="w-20 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{children}</span>;

/** PortCo-style chip rows: My Inbox, My Actions kinds, priorities, workstream switch and search. */
export function ActionsFilterBar({ view, onView, counts, inbox, onToggleInbox, kinds, kindCounts, onKinds, priorities, picked, onPicked, showWs, onShowWs, search, onSearch }: {
  view: BannerView; onView: (v: BannerView) => void;
  counts: { notes: number; activity: number }; inbox: InboxToggles; onToggleInbox: (k: InboxKind) => void;
  kinds: CompanyKind[]; kindCounts: Record<CompanyKind, number>; onKinds: (k: CompanyKind[]) => void;
  priorities: string[]; picked: string[]; onPicked: (p: string[]) => void;
  showWs: boolean; onShowWs: (v: boolean) => void;
  search: string; onSearch: (s: string) => void;
}) {
  const pri = (priorities.length ? priorities : FALLBACK_PRIORITIES).slice(0, 4);
  const inInbox = view === "inbox";
  const total = kindCounts.portcos + kindCounts.network + kindCounts.ops;
  const toggle = <T,>(list: T[], v: T) => list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-between gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <RowLabel>My Inbox</RowLabel>
        <Chip label="Notes" count={counts.notes} on={inInbox && inbox.notes} onClick={() => onToggleInbox("notes")} />
        <Chip label="Activity" count={counts.activity} on={inInbox && inbox.activity} onClick={() => onToggleInbox("activity")} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <RowLabel>My Actions</RowLabel>
        <Chip label="All" count={total} on={view === "actions" && !kinds.length} onClick={() => { onKinds([]); onView("actions"); }} />
        {COMPANY_TOGGLES.map(({ key, label }) => <Chip key={key} label={label} count={kindCounts[key]} on={view === "actions" && kinds.includes(key)} onClick={() => { onKinds(toggle(kinds, key)); onView("actions"); }} />)}
        <Chip label="Completed" on={view === "done"} onClick={() => onView(view === "done" ? "actions" : "done")} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <RowLabel>Priority</RowLabel>
        <button type="button" onClick={() => onPicked([])} className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", !picked.length ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : "border-border text-muted-foreground")}>All</button>
        {pri.map((p) => <button key={p} type="button" title={p} aria-pressed={picked.includes(p)} onClick={() => { onPicked(toggle(picked, p)); onView("actions"); }}
          className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors", priorityTone(p), picked.includes(p) && "ring-2 ring-primary ring-offset-1 ring-offset-background")}>{priorityShort(p)}</button>)}
        <label className="ml-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Checkbox checked={showWs} onCheckedChange={(v) => { onShowWs(v === true); onView("actions"); }} aria-label="Show workstreams" />Show workstreams
        </label>
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-8 pl-7 text-sm" placeholder="Search actions" value={search} onChange={(e) => { onSearch(e.target.value); if (view === "inbox") onView("actions"); }} />
        </div>
      </div>
    </div>
  );
}

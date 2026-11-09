import type React from "react";
import { Check } from "lucide-react";

/** Which companies and item types the My Actions feed shows. */
export const COMPANY_TOGGLES = [
  { key: "portcos", label: "PortCo" },
  { key: "network", label: "Network" },
  { key: "ops", label: "PortDev Ops" },
] as const;
export const ITEM_TOGGLES = [
  { key: "workstreams", label: "Workstreams" },
  { key: "followups", label: "Follow-ups" },
] as const;
export type FeedToggle = (typeof COMPANY_TOGGLES)[number]["key"] | (typeof ITEM_TOGGLES)[number]["key"];
export const DEFAULT_TOGGLES: Record<FeedToggle, boolean> = { portcos: true, network: true, ops: true, workstreams: true, followups: true };

/** Shown until real workstream priorities load, so the banner doesn't jump. */
const FALLBACK_PRIORITIES = ["1. Must Do", "2. Should Do", "3. Could Do"];

/** Must → green, Should → yellow, Could → red (matched by wording or leading number). */
function priorityTone(p: string) {
  if (/must|^\s*1\b/i.test(p)) return "border-good-foreground/60 bg-good text-good-foreground";
  if (/should|^\s*2\b/i.test(p)) return "border-warm-foreground/60 bg-warm text-warm-foreground";
  if (/could|^\s*3\b/i.test(p)) return "border-hot-foreground/60 bg-hot text-hot-foreground";
  return "border-border bg-muted text-foreground";
}

/** "1: High - Must Do" → "1. Must Do" (the short wording used on the banner). */
function priorityLabel(p: string) {
  const m = p.match(/^\s*(\d+)\s*[:.)-]?.*?-\s*(.+)$/);
  return m ? `${m[1]}. ${m[2]!.trim()}` : p;
}

function Tile({ label, checked, onClick, tone }: { label: string; checked: boolean; onClick: () => void; tone: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onClick}
      className={`flex h-8 w-full items-center justify-between gap-2 rounded-md border-2 px-2.5 text-sm font-medium transition-opacity hover:opacity-90 ${tone} ${checked ? "" : "opacity-55"}`}>
      <span className="truncate">{label}</span>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-current bg-background text-foreground">
        {checked && <Check className="h-3 w-3" />}
      </span>
    </button>
  );
}

function BigButton({ title, sub, active, onClick }: { title: string; sub: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={`flex h-full min-h-[4.5rem] w-28 shrink-0 flex-col items-center justify-center rounded-2xl border-2 px-3 text-center leading-tight transition-colors ${active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"}`}>
      <span className="font-display text-base font-semibold">{title}</span>
      <span className={`text-xs ${active ? "text-primary-foreground/80" : "text-primary/80"}`}>{sub}</span>
    </button>
  );
}

function SubButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={`flex h-8 w-full items-center justify-center gap-1.5 rounded-md border-2 px-3 text-sm font-medium transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"}`}>
      {label}<span className="text-xs tabular-nums opacity-80">({count})</span>
    </button>
  );
}

export type BannerView = "notes" | "activity" | "actions" | "done";

/** Two-row control block beside the calendar: My Inbox (to review) and My Actions (to do) with their filters. */
export function ActionsBanner({ view, onView, counts, toggles, onToggle, priorities, hiddenPriorities, onTogglePriority }: {
  view: BannerView;
  onView: (v: BannerView) => void;
  counts: { notes: number; activity: number };
  toggles: Record<FeedToggle, boolean>;
  onToggle: (k: FeedToggle) => void;
  priorities: string[];
  hiddenPriorities: string[];
  onTogglePriority: (p: string) => void;
}) {
  const inbox = view === "notes" || view === "activity";
  const pri = (priorities.length ? priorities : FALLBACK_PRIORITIES).slice(0, 4);
  const filterTone = "border-primary bg-primary text-primary-foreground";
  const left: React.ReactNode[] = [...COMPANY_TOGGLES, ...ITEM_TOGGLES].map(({ key, label }) => (
    <Tile key={key} label={label} tone={filterTone} checked={toggles[key]} onClick={() => onToggle(key)} />
  ));
  return (
    <div role="tablist" aria-label="My Actions views" className="flex min-w-0 flex-col gap-3">
      <div className="flex items-stretch gap-2">
        <BigButton title="My Inbox" sub="(to review)" active={inbox} onClick={() => onView(inbox ? view : "notes")} />
        <div className="grid w-40 content-center gap-1.5">
          <SubButton label="Notes" count={counts.notes} active={view === "notes"} onClick={() => onView("notes")} />
          <SubButton label="Activity" count={counts.activity} active={view === "activity"} onClick={() => onView("activity")} />
        </div>
      </div>
      <div className="flex items-stretch gap-2">
        <BigButton title="My Actions" sub="(to do)" active={!inbox} onClick={() => onView("actions")} />
        <div role="group" aria-label="Company and item filters" className="grid w-40 content-start gap-1.5">{left}</div>
        <div role="group" aria-label="Priority filters" className="grid w-40 content-start gap-1.5">
          {pri.map((p) => <Tile key={p} label={priorityLabel(p)} tone={priorityTone(p)} checked={!hiddenPriorities.includes(p)} onClick={() => onTogglePriority(p)} />)}
          <Tile label="Completed" tone="border-foreground/70 bg-card text-foreground" checked={view === "done"} onClick={() => onView(view === "done" ? "actions" : "done")} />
        </div>
      </div>
    </div>
  );
}

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

export type InboxKind = "notes" | "activity";
export type InboxToggles = Record<InboxKind, boolean>;
export const DEFAULT_INBOX: InboxToggles = { notes: true, activity: true };

/** Shown until real workstream priorities load, so the banner doesn't jump. */
const FALLBACK_PRIORITIES = ["1. Must Do", "2. Should Do", "3. Could Do"];

/** Must → green, Should → yellow, Could → red (matched by wording or leading number). */
function priorityTone(p: string) {
  if (/must|^\s*1\b/i.test(p)) return "border-good-foreground/50 bg-good text-good-foreground";
  if (/should|^\s*2\b/i.test(p)) return "border-warm-foreground/50 bg-warm text-warm-foreground";
  if (/could|^\s*3\b/i.test(p)) return "border-hot-foreground/50 bg-hot text-hot-foreground";
  return "border-border bg-muted text-foreground";
}

/** "1: High - Must Do" → "1. Must Do" (the short wording used on the banner). */
function priorityLabel(p: string) {
  const m = p.match(/^\s*(\d+)\s*[:.)-]?.*?-\s*(.+)$/);
  return m ? `${m[1]}. ${m[2]!.trim()}` : p;
}

const FILTER_TONE = "border-primary bg-primary text-primary-foreground";

function Tile({ label, count, checked, onClick, tone, className = "" }: { label: string; count?: number; checked: boolean; onClick: () => void; tone: string; className?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onClick}
      className={`flex min-h-7 w-full items-center justify-between gap-2 rounded-md border px-2 text-xs font-medium transition-opacity hover:opacity-90 ${tone} ${checked ? "" : "opacity-50"} ${className}`}>
      <span className="truncate">{label}{count !== undefined && <span className="ml-1 tabular-nums opacity-75">({count})</span>}</span>
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border border-current bg-background text-foreground">
        {checked && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

function BigButton({ title, sub, active, onClick, className }: { title: string; sub: string; active: boolean; onClick: () => void; className: string }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-xl border px-2 text-center leading-tight transition-colors ${active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"} ${className}`}>
      <span className="text-sm font-semibold">{title}</span>
      <span className={`text-[10px] ${active ? "text-primary-foreground/80" : "text-primary/80"}`}>{sub}</span>
    </button>
  );
}

export type BannerView = "inbox" | "actions" | "done";

/**
 * Control block beside the calendar, laid out on one grid so its top and bottom line up
 * with the calendar: My Inbox (Notes / Activity) above My Actions (company, item and priority filters).
 */
export function ActionsBanner({ view, onView, counts, inbox, onToggleInbox, toggles, onToggle, priorities, hiddenPriorities, onTogglePriority }: {
  view: BannerView;
  onView: (v: BannerView) => void;
  counts: { notes: number; activity: number };
  inbox: InboxToggles;
  onToggleInbox: (k: InboxKind) => void;
  toggles: Record<FeedToggle, boolean>;
  onToggle: (k: FeedToggle) => void;
  priorities: string[];
  hiddenPriorities: string[];
  onTogglePriority: (p: string) => void;
}) {
  const pri = (priorities.length ? priorities : FALLBACK_PRIORITIES).slice(0, 4);
  const feed = [...COMPANY_TOGGLES, ...ITEM_TOGGLES];
  // Rows: 2 inbox rows, a small spacer, then 5 action rows — all stretch to the calendar's height.
  return (
    <div role="tablist" aria-label="My Actions views"
      className="grid grid-cols-[6rem_9rem_9rem] grid-rows-[repeat(2,minmax(1.75rem,1fr))_0.25rem_repeat(5,minmax(1.75rem,1fr))] gap-x-1.5 gap-y-1.5">
      <BigButton title="My Inbox" sub="(to review)" active={view === "inbox"} onClick={() => onView("inbox")} className="col-start-1 row-span-2 row-start-1" />
      <Tile label="Notes" count={counts.notes} tone={FILTER_TONE} checked={inbox.notes} onClick={() => onToggleInbox("notes")} className="col-start-2 row-start-1" />
      <Tile label="Activity" count={counts.activity} tone={FILTER_TONE} checked={inbox.activity} onClick={() => onToggleInbox("activity")} className="col-start-2 row-start-2" />

      <BigButton title="My Actions" sub="(to do)" active={view !== "inbox"} onClick={() => onView("actions")} className="col-start-1 row-span-5 row-start-4" />
      {feed.map(({ key, label }, i) => (
        <Tile key={key} label={label} tone={FILTER_TONE} checked={toggles[key]} onClick={() => onToggle(key)} className="col-start-2" style-row={i} {...rowAt(4 + i)} />
      ))}
      {pri.map((p, i) => (
        <Tile key={p} label={priorityLabel(p)} tone={priorityTone(p)} checked={!hiddenPriorities.includes(p)} onClick={() => onTogglePriority(p)} className="col-start-3" {...rowAt(4 + i)} />
      ))}
      <Tile label="Completed" tone="border-foreground/60 bg-card text-foreground" checked={view === "done"} onClick={() => onView(view === "done" ? "actions" : "done")} className="col-start-3" {...rowAt(4 + pri.length)} />
    </div>
  );
}

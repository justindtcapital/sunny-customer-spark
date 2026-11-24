import { useMemo, useState } from "react";
import { CalendarPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reportingDay } from "@/lib/home-momentum";
import { quickFollowUpDates } from "@/lib/action-thread";

/**
 * Small "Done — schedule the next follow-up?" row shown right after a follow-up is
 * completed outside My Actions (contact page, Prospecting), so completing never dead-ends.
 */
export function QuickFollowUpPrompt({ onSchedule, onSkip, busy = false }: { onSchedule: (date: string) => void | Promise<void>; onSkip: () => void; busy?: boolean }) {
  const today = useMemo(() => reportingDay(new Date()), []);
  const quick = useMemo(() => quickFollowUpDates(today).filter((q) => q.label !== "Tomorrow"), [today]);
  const [date, setDate] = useState("");
  return <div role="group" aria-label="Schedule the next follow-up" className="mt-1.5 flex flex-wrap items-center gap-1 rounded-md border border-good-foreground/30 bg-good/30 px-2 py-1.5 text-[11px]">
    <CalendarPlus className="h-3.5 w-3.5 text-good-foreground" />
    <span className="mr-1 font-medium">Done. Next follow-up?</span>
    {quick.map((q) => <Button key={q.label} type="button" size="sm" variant="outline" className="h-6 bg-background px-2 text-[11px]" disabled={busy} onClick={() => void onSchedule(q.date)}>{q.label}</Button>)}
    <Input aria-label="Follow-up date" type="date" min={today} value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} className="h-6 w-32 bg-background px-1 text-[11px]" />
    {date && <Button type="button" size="sm" className="h-6 px-2 text-[11px]" disabled={busy || date < today} onClick={() => void onSchedule(date)}>Set</Button>}
    <Button type="button" size="icon" variant="ghost" aria-label="No follow-up needed" title="No follow-up needed" className="ml-auto h-6 w-6" disabled={busy} onClick={onSkip}><X className="h-3 w-3" /></Button>
  </div>;
}

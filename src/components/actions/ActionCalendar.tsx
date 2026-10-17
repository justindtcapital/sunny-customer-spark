import { useEffect, useRef, useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { fetchHomeMomentum } from "@/utils/home.functions";
import { teamMemberFor } from "@/lib/user-ownership";
import { actionDayCounts, inActionRange, orderedDateRange, type ActionDateRange } from "@/lib/action-calendar";
import { reportingDay } from "@/lib/home-momentum";

export function ActionCalendar({ owner, range, onChange }: { owner: string; range: ActionDateRange; onChange: (r: ActionDateRange) => void }) {
  const [month, setMonth] = useState<Date | null>(null);
  const [today, setToday] = useState("");
  const anchor = useRef("");
  const moved = useRef(false);
  const fetchHome = useServerFn(fetchHomeMomentum);
  const email = teamMemberFor(owner)?.email || "";
  const { data } = useQuery({ queryKey: ["my-actions", "followups", email], queryFn: () => fetchHome({ data: { email, scope: "mine" } }), enabled: !!email, staleTime: 60_000 });
  useEffect(() => { const day = reportingDay(new Date()); setToday(day); setMonth(new Date(`${day}T12:00:00`)); }, []);
  const counts = actionDayCounts(data?.reminders || []);
  if (!month) return null;
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  return <div aria-label="Action calendar" className="w-[280px] max-w-full shrink-0 select-none border-l border-border pl-3">
    <div className="flex items-center justify-between">
      <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
      <span className="text-xs font-semibold">{format(month, "MMMM yyyy")}</span>
      <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-3.5 w-3.5" /></Button>
    </div>
    <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
    <div className="grid touch-none grid-cols-7 gap-0.5"
      onPointerDown={(e) => { if (e.button !== 0) return; const day = (e.target as HTMLElement).closest<HTMLElement>("[data-daykey]")?.dataset.daykey; if (!day) return; anchor.current = day; moved.current = false; e.currentTarget.setPointerCapture(e.pointerId); onChange(orderedDateRange(day, day)); }}
      onPointerMove={(e) => { if (!anchor.current) return; const day = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-daykey]")?.dataset.daykey; if (day) { moved.current = moved.current || day !== anchor.current; onChange(orderedDateRange(anchor.current, day)); } }}
      onPointerUp={(e) => { anchor.current = ""; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => { anchor.current = ""; }}>
      {days.map((date) => { const key = format(date, "yyyy-MM-dd"); const selected = !!range && inActionRange(key, range); const count = counts.get(key) || 0;
        return <Button key={key} data-daykey={key} aria-label={`${key}, ${count} actions`} aria-pressed={selected} variant={selected ? "secondary" : "ghost"} className={`h-7 w-full flex-col gap-0 rounded-sm p-0 text-[11px] leading-none ${key === today ? "ring-1 ring-primary" : ""} ${date.getMonth() !== month.getMonth() ? "opacity-40" : ""}`} onClick={(e) => { if (e.detail === 0) onChange(orderedDateRange(key, key)); }}><span>{date.getDate()}</span><span className={`h-2.5 text-[9px] tabular-nums ${count ? "text-primary" : "text-muted-foreground"}`}>{count || ""}</span></Button>;
      })}
    </div>
    <div className="mt-1 flex items-center justify-between gap-1">
      <Button size="sm" variant="ghost" className="h-6 px-1 text-[11px]" onClick={() => { setMonth(new Date(`${today}T12:00:00`)); onChange(orderedDateRange(today, today)); }}>Today</Button>
      {range && <span className="text-[10px] text-muted-foreground">{range.start.slice(5)}{range.end !== range.start ? ` – ${range.end.slice(5)}` : ""}</span>}
      <Button size="sm" variant="ghost" className="h-6 px-1 text-[11px]" onClick={() => onChange(null)}><X className="mr-1 h-3 w-3" />All dates</Button>
    </div>
  </div>;
}
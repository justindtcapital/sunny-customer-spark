import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AsanaEvent } from "@/lib/types";
import { fetchAsanaEvents } from "@/utils/asana.functions";
import { fetchAppEvents } from "@/utils/sheets.functions";
import { fetchPlannerFn } from "@/utils/event-planner.functions";
import { aliasHit, pickerKeywords, resolveTrackerEvent, trackerPickerEvents, type PickerEvent } from "@/lib/event-people";

interface EventPickerProps {
  value: string;
  /** Always an Event Tracker name, or "" for no event. */
  onChange: (name: string, event?: PickerEvent) => void;
  placeholder?: string;
  className?: string;
  /** Label for the explicit "no event" choice. */
  noneLabel?: string;
}

/** Same cache as the Event Planner, so new tracker events show up without a reload. */
const TRACKER_QUERY_KEY = ["event-planner"];

// Module-level cache so multiple pickers on a page share one fetch.
let cachedEvents: AsanaEvent[] | null = null;
let inflight: Promise<AsanaEvent[]> | null = null;

function mergeEventCatalogs(asana: AsanaEvent[], app: AsanaEvent[]): AsanaEvent[] {
  const byName = new Map<string, AsanaEvent>();
  // App Events first so in-app catalog wins on name collisions, then fill from Asana.
  for (const e of app) {
    const key = e.name.trim().toLowerCase();
    if (!key) continue;
    const have = byName.get(key);
    byName.set(key, have && !e.gid.startsWith("planner:") ? have : { ...have, ...e, portcos: [...new Set([...(have?.portcos || []), ...e.portcos])] });
  }
  for (const e of asana) {
    const key = e.name.trim().toLowerCase();
    if (!key) continue;
    const have = byName.get(key);
    if (!have) byName.set(key, e);
    else {
      // Same event in both: keep the app copy but never drop Asana's PortCo tags.
      const portcos = Array.from(new Set([...(have.portcos || []), ...(e.portcos || [])].filter(Boolean)));
      byName.set(key, { ...e, ...have, date: have.date || e.date, portcos });
    }
  }
  return [...byName.values()];
}

/** Tracker event URID for a picked name (its own name or a merged older name). */
export async function plannerUridFor(name: string): Promise<string> {
  const events = trackerPickerEvents((await fetchPlannerFn()).events);
  return resolveTrackerEvent(name, events)?.urid || "";
}

/** Shared Asana + in-app event catalog (cached per session). */
export async function loadEvents(): Promise<AsanaEvent[]> {

  if (cachedEvents) return cachedEvents;
  if (inflight) return inflight;
  inflight = Promise.all([
    fetchAsanaEvents().catch((): AsanaEvent[] => []),
    fetchAppEvents().catch((): AsanaEvent[] => []),
    fetchPlannerFn().then((r) => r.events).catch(() => []),
  ])
    .then(([asana, app, planner]) => {
      // Event Planner names are canonical: they win so tags match attendee lists.
      const plannerAsEvents: AsanaEvent[] = planner.filter((e) => e.name).map((e) => ({
        gid: `planner:${e.urid}`, name: e.name, date: e.start, portcos: e.portcos, sectors: e.sectors,
        status: e.start && e.start < new Date().toISOString().slice(0, 10) ? "completed" : "planned", type: "conference",
      }));
      cachedEvents = mergeEventCatalogs(asana, [...app, ...plannerAsEvents]);
      return cachedEvents;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function EventPicker({ value, onChange, placeholder = "Pick an event…", className, noneLabel = "No event" }: EventPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { data, isLoading } = useQuery({ queryKey: TRACKER_QUERY_KEY, queryFn: () => fetchPlannerFn(), staleTime: 60_000 });
  // Only Event Tracker events can be picked — no typed names, no Asana-only names.
  const loaded = useMemo(() => trackerPickerEvents(data?.events ?? []), [data]);
  const current = useMemo(() => resolveTrackerEvent(value, loaded), [value, loaded]);

  const { upcoming, past } = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const up: PickerEvent[] = [];
    const ps: PickerEvent[] = [];
    for (const e of loaded) {
      if ((e.date || "") >= today) up.push(e);
      else ps.push(e);
    }
    up.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    ps.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return { upcoming: up, past: ps };
  }, [loaded]);

  const handleSelect = (e?: PickerEvent) => {
    onChange(e ? e.name : "", e);
    setOpen(false);
    setQuery("");
  };

  const item = (e: PickerEvent) => {
    const alias = aliasHit(e, query);
    return (
      <CommandItem key={e.urid} value={`${e.name} ${e.urid}`} keywords={pickerKeywords(e)} onSelect={() => handleSelect(e)}>
        <Check className={cn("mr-2 h-3.5 w-3.5", current?.urid === e.urid ? "opacity-100" : "opacity-0")} />
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">{e.name}</div>
          <div className="text-[10px] text-muted-foreground truncate">
            {e.date || "No date"}{alias && <> · also known as “{alias}”</>}
          </div>
        </div>
      </CommandItem>
    );
  };

  // A stored value that isn't (or is no longer) a tracker event shows as such.
  const label = current?.name || value;
  const legacy = !!value && !current && !isLoading;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-9 w-full justify-between font-normal text-sm", !value && "text-muted-foreground", className)}
        >
          <span className="truncate">
            {label || placeholder}
            {legacy && <span className="ml-1 text-[10px] text-destructive">(not in Event Tracker)</span>}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[280px] p-0" align="start">
        <Command
          shouldFilter
          // Plain "contains every word" matching on name + older names (fuzzy matching surfaced unrelated events).
          filter={(v, search, keywords) => {
            const hay = [v, ...(keywords || [])].join(" ").toLowerCase();
            return search.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w)) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search Event Tracker events…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Loading events…" : "No matching event. Add it to the Event Tracker first."}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none__" keywords={[noneLabel, "none", "no event"]} onSelect={() => handleSelect()}>
                <Ban className={cn("mr-2 h-3.5 w-3.5", !value ? "opacity-100" : "opacity-40")} />
                <span className="text-sm">{noneLabel}</span>
              </CommandItem>
            </CommandGroup>
            {upcoming.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Upcoming">{upcoming.map(item)}</CommandGroup>
              </>
            )}
            {past.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Past">{past.map(item)}</CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { INDUSTRIES, SEGMENTS, SOURCE_TYPES, type FeedCard } from "@/lib/signal-feed";
import { DATE_WINDOWS, DEFAULT_DAYS, type SignalsSearch } from "@/lib/signals-page";
import { cn } from "@/lib/utils";

type ListKey = "seg" | "ind" | "pc" | "src";

export function SignalFilters({
  search,
  onChange,
  query,
  onQuery,
  cards,
  portcos,
}: {
  search: SignalsSearch;
  onChange: (patch: Partial<SignalsSearch>) => void;
  query: string;
  onQuery: (q: string) => void;
  /** Cards inside the current date window — used for option counts. */
  cards: FeedCard[];
  portcos: string[];
}) {
  const [pcQuery, setPcQuery] = useState("");
  const counts = useMemo(() => {
    const c = { seg: new Map<string, number>(), ind: new Map<string, number>(), pc: new Map<string, number>(), src: new Map<string, number>() };
    const bump = (m: Map<string, number>, k?: string) => k && m.set(k, (m.get(k) || 0) + 1);
    for (const x of cards) {
      bump(c.seg, x.segmentBucket);
      bump(c.ind, x.industry);
      bump(c.pc, x.company.trim().toLowerCase());
      bump(c.src, x.sourceType);
    }
    return c;
  }, [cards]);

  const toggle = (key: ListKey, value: string) => {
    const cur = new Set(search[key] || []);
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    onChange({ [key]: cur.size ? [...cur] : undefined });
  };

  const active = (search.seg?.length || 0) + (search.ind?.length || 0) + (search.pc?.length || 0) + (search.src?.length || 0) + (query ? 1 : 0);
  const days = search.days ?? DEFAULT_DAYS;
  // PortCos with signals first, then the rest alphabetically.
  const pcList = useMemo(() => {
    const words = pcQuery.trim().toLowerCase();
    return portcos
      .filter((p) => !words || p.toLowerCase().includes(words))
      .sort((a, b) => (counts.pc.get(b.toLowerCase()) || 0) - (counts.pc.get(a.toLowerCase()) || 0) || a.localeCompare(b));
  }, [portcos, pcQuery, counts]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Filters</h2>
          {active > 0 && <Badge variant="secondary">{active}</Badge>}
        </div>
        {active > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { onQuery(""); onChange({ seg: undefined, ind: undefined, pc: undefined, src: undefined, q: undefined }); }}>
            <X className="h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search signals" placeholder="Search signals…" value={query} onChange={(e) => onQuery(e.target.value)} className="h-9 pl-8" />
      </div>

      <Group title="Date">
        <div className="flex flex-wrap gap-1.5">
          {[...DATE_WINDOWS, { value: "all" as const, label: "All time" }].map((w) => (
            <button
              key={String(w.value)}
              type="button"
              onClick={() => onChange({ days: w.value === DEFAULT_DAYS ? undefined : w.value })}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs",
                days === w.value ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Segment">
        {[...SEGMENTS, "Other"].map((s) => (
          <CheckRow key={s} label={s} count={counts.seg.get(s)} checked={!!search.seg?.includes(s)} onChange={() => toggle("seg", s)} />
        ))}
      </Group>

      <Group title="Source type">
        {SOURCE_TYPES.filter((s) => s !== "LinkedIn").map((s) => (
          <CheckRow key={s} label={s} count={counts.src.get(s)} checked={!!search.src?.includes(s)} onChange={() => toggle("src", s)} />
        ))}
      </Group>

      <Group title="Industry">
        {INDUSTRIES.map((s) => (
          <CheckRow key={s} label={s} count={counts.ind.get(s)} checked={!!search.ind?.includes(s)} onChange={() => toggle("ind", s)} />
        ))}
      </Group>

      <Group title="PortCo">
        <Input aria-label="Find a PortCo" placeholder="Find a PortCo…" value={pcQuery} onChange={(e) => setPcQuery(e.target.value)} className="mb-1.5 h-8 text-xs" />
        <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
          {pcList.map((p) => (
            <CheckRow key={p} label={p} count={counts.pc.get(p.toLowerCase())} checked={!!search.pc?.includes(p)} onChange={() => toggle("pc", p)} />
          ))}
          {pcList.length === 0 && <p className="text-xs text-muted-foreground">No PortCo matches.</p>}
        </div>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function CheckRow({ label, count, checked, onChange }: { label: string; count?: number; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <span className={cn("flex-1 truncate", !count && !checked && "text-muted-foreground")}>{label}</span>
      {count ? <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span> : null}
    </label>
  );
}

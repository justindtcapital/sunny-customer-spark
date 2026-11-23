// Spreadsheet-style column header: click to sort up/down and filter by the
// column's values (pick lists) or by "contains" text (free-text columns).
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Filter, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { filterActive, type ColumnFilter } from "@/lib/table-filter";

type MenuProps = {
  label: string;
  mode: "values" | "text";
  sortDir: 1 | -1 | null;
  onSort: (dir: 1 | -1 | null) => void;
  filter: ColumnFilter | undefined;
  onFilter: (f: ColumnFilter | undefined) => void;
  /** Values (with counts) in rows matching the other columns' filters. */
  counts: () => Array<{ value: string; count: number }>;
};

export function ColumnHeaderMenu({ label, mode, sortDir, onSort, filter, onFilter, counts }: MenuProps) {
  const [open, setOpen] = useState(false);
  const active = filterActive(filter);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`${label}: sort and filter`}
          className={cn("inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted hover:text-foreground", (active || sortDir) && "text-foreground")}>
          {label}
          {sortDir === 1 && <ArrowUp className="h-3 w-3" />}
          {sortDir === -1 && <ArrowDown className="h-3 w-3" />}
          {active ? <Filter className="h-3 w-3 fill-primary text-primary" aria-label="Filtered" /> : <ChevronDown className="h-3 w-3 opacity-60" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2 text-xs">
        {open && <MenuBody label={label} mode={mode} sortDir={sortDir} onSort={onSort} filter={filter} onFilter={onFilter} counts={counts} />}
      </PopoverContent>
    </Popover>
  );
}

function MenuBody({ label, mode, sortDir, onSort, filter, onFilter, counts }: MenuProps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo(() => counts(), []);
  const [find, setFind] = useState("");
  const ticked = filter?.kind === "values" ? filter.values : [];
  const visible = list.filter((v) => !find.trim() || v.value.toLowerCase().includes(find.trim().toLowerCase()));
  const toggle = (value: string) => {
    const next = ticked.includes(value) ? ticked.filter((v) => v !== value) : [...ticked, value];
    onFilter(next.length ? { kind: "values", values: next } : undefined);
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1">
        <Button size="sm" variant={sortDir === 1 ? "secondary" : "ghost"} className="h-7 justify-start text-xs" onClick={() => onSort(sortDir === 1 ? null : 1)}><ArrowUp className="mr-1 h-3 w-3" />Sort A → Z</Button>
        <Button size="sm" variant={sortDir === -1 ? "secondary" : "ghost"} className="h-7 justify-start text-xs" onClick={() => onSort(sortDir === -1 ? null : -1)}><ArrowDown className="mr-1 h-3 w-3" />Sort Z → A</Button>
      </div>
      <div className="border-t border-border pt-2">
        <p className="mb-1 font-medium text-muted-foreground">Filter {label}</p>
        {mode === "text" ? (
          <Input autoFocus className="h-7 text-xs" placeholder="Contains…" value={filter?.kind === "text" ? filter.text : ""}
            onChange={(e) => onFilter(e.target.value ? { kind: "text", text: e.target.value } : undefined)} />
        ) : (
          <>
            {list.length > 8 && <Input autoFocus className="mb-1 h-7 text-xs" placeholder="Find a value…" value={find} onChange={(e) => setFind(e.target.value)} />}
            <div className="max-h-60 space-y-0.5 overflow-y-auto" role="group" aria-label={`${label} values`}>
              {visible.map((v) => (
                <label key={v.value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted">
                  <Checkbox checked={ticked.includes(v.value)} onCheckedChange={() => toggle(v.value)} />
                  <span className={cn("flex-1 truncate", v.value === "(blank)" && "italic text-muted-foreground")}>{v.value}</span>
                  <span className="text-muted-foreground">{v.count}</span>
                </label>
              ))}
              {visible.length === 0 && <p className="px-1 py-1 text-muted-foreground">No values.</p>}
            </div>
          </>
        )}
      </div>
      {filterActive(filter) && (
        <Button size="sm" variant="ghost" className="h-7 w-full justify-start text-xs" onClick={() => onFilter(undefined)}><X className="mr-1 h-3 w-3" />Clear filter</Button>
      )}
    </div>
  );
}

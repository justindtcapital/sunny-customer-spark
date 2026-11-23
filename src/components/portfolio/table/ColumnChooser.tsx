// Pick which columns a table shows; the choice is remembered for each teammate on this device.
import { useEffect, useState } from "react";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/auth-context";

export interface ColumnOption { key: string; label: string; archived?: boolean }

/** `renamed` maps retired column keys to their new keys so saved choices survive a rename. */
export function useColumnChoice(table: string, defaults: string[], renamed: Record<string, string> = {}) {
  const { email } = useAuth();
  const storageKey = `vp.table-columns.${table}.${email || "me"}`;
  const [cols, setCols] = useState<string[]>(defaults);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) { const v = JSON.parse(raw); if (Array.isArray(v)) setCols([...new Set(v.filter((x): x is string => typeof x === "string").map((x) => renamed[x] ?? x))]); }
    } catch { /* keep defaults */ }
  }, [storageKey]);
  const save = (next: string[]) => {
    setCols(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  };
  return [cols, save, () => save(defaults)] as const;
}

export function ColumnChooser({ options, value, onChange, onReset }: { options: ColumnOption[]; value: string[]; onChange: (v: string[]) => void; onReset: () => void }) {
  const kept = options.filter((o) => !o.archived);
  const archived = options.filter((o) => o.archived);
  const toggle = (k: string, on: boolean) => onChange(on ? [...value.filter((x) => x !== k), k] : value.filter((x) => x !== k));
  const row = (o: ColumnOption) => (
    <label key={o.key} className="flex items-center gap-2 py-0.5 text-xs">
      <Checkbox checked={value.includes(o.key)} onCheckedChange={(c) => toggle(o.key, c === true)} />
      {o.label}
    </label>
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs"><Columns3 className="mr-1.5 h-3.5 w-3.5" />Columns ({value.length})</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70vh] w-72 overflow-y-auto p-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Fields</p>
        {kept.map(row)}
        {archived.length > 0 && (
          <>
            <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Archived from Asana (view only)</p>
            {archived.map(row)}
          </>
        )}
        <Button variant="ghost" size="sm" className="mt-2 h-7 w-full text-xs" onClick={onReset}>Reset to default</Button>
      </PopoverContent>
    </Popover>
  );
}

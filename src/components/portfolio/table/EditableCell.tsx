// One spreadsheet-style cell: click to edit, saved when you leave it (Enter saves, Esc cancels).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type CellKind = "enum" | "multi_enum" | "number" | "date" | "text" | "readonly";
const NONE = "__none__";

export function EditableCell({ kind, value, options = [], onSave, className, render, toDraft = (v) => v, fromDraft = (d) => d.trim() }: {
  kind: CellKind;
  value: string;
  options?: readonly string[];
  onSave?: (next: string | string[]) => Promise<boolean>;
  className?: string;
  /** Custom display (formatted number, colored pill); unset values always show as an empty cell. */
  render?: (value: string) => ReactNode;
  /** Typed fields: stored value → editable text, and back (e.g. ownership edited as a percent). */
  toDraft?: (value: string) => string;
  fromDraft?: (draft: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(kind === "multi_enum" ? value : toDraft(value));
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!editing) setDraft(kind === "multi_enum" ? value : toDraft(value)); }, [value, editing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = async (next: string | string[]) => {
    const same = Array.isArray(next) ? next.join(", ") === value : next.trim() === value.trim();
    if (same || !onSave) { setEditing(false); return; }
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (ok) setEditing(false);
  };

  const display = (
    <span className="block min-h-4 truncate">{value ? (render ? render(value) : value) : "\u00a0"}</span>
  );
  if (kind === "readonly" || !onSave) return <div className={cn("px-2 py-1.5 text-xs", className)} title={value}>{display}</div>;
  if (saving) return <div className={cn("flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground", className)}><Loader2 className="h-3 w-3 animate-spin" />Saving</div>;

  if (kind === "enum") {
    return (
      <Select value={value || NONE} onValueChange={(v) => void commit(v === NONE ? "" : v)}>
        <SelectTrigger className={cn("h-8 rounded-none border-0 bg-transparent px-2 text-xs shadow-none hover:bg-accent/40 focus:ring-1 [&>svg]:opacity-0 hover:[&>svg]:opacity-50", className)} title={value}>
          <span className="min-w-0 flex-1 text-left">{display}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} className="text-xs italic text-muted-foreground">Clear</SelectItem>
          {value && !options.includes(value) && <SelectItem value={value} className="text-xs">{value}</SelectItem>}
          {options.map((o) => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (kind === "multi_enum") {
    const sel = value ? value.split(/\s*,\s*/).filter(Boolean) : [];
    return (
      <Popover open={pickerOpen} onOpenChange={(open) => { setPickerOpen(open); if (!open) { const next = draft ? draft.split(/\s*,\s*/).filter(Boolean) : []; void commit(next); } else setDraft(value); }}>
        <PopoverTrigger asChild>
          <button type="button" className={cn("w-full px-2 py-1.5 text-left text-xs hover:bg-accent/40", className)} title={value}>{display}</button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-1 p-2" align="start">
          {options.map((o) => {
            const cur = draft ? draft.split(/\s*,\s*/).filter(Boolean) : [];
            return (
              <label key={o} className="flex items-center gap-2 text-xs">
                <Checkbox checked={cur.includes(o)} onCheckedChange={(c) => setDraft((c ? [...cur, o] : cur.filter((x) => x !== o)).join(", "))} />
                {o}
              </label>
            );
          })}
          {sel.filter((s) => !options.includes(s)).map((s) => <p key={s} className="text-[11px] text-muted-foreground">Also set: {s}</p>)}
          <button
            type="button"
            disabled={!draft}
            onClick={() => { setDraft(""); setPickerOpen(false); void commit([]); }}
            className="mt-1 w-full border-t border-border pt-1.5 text-left text-xs italic text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Clear all
          </button>
        </PopoverContent>
      </Popover>
    );
  }
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className={cn("w-full px-2 py-1.5 text-left text-xs hover:bg-accent/40", className)} title={value}>
        {display}
      </button>
    );
  }
  return (
    <Input
      ref={inputRef}
      type={kind === "date" ? "date" : "text"}
      inputMode={kind === "number" ? "decimal" : undefined}
      className={cn("h-8 rounded-none px-2 text-xs", className)}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit(fromDraft(draft))}
      onKeyDown={(e) => {
        if (e.key === "Enter") void commit(fromDraft(draft));
        if (e.key === "Escape") { setDraft(toDraft(value)); setEditing(false); }
      }}
    />
  );
}

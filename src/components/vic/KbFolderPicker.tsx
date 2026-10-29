import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { listKbFoldersFn } from "@/utils/vic.functions";

/** Choose which Knowledge Base folders Vic searches (none = whole KB). */
export function KbFolderPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const list = useServerFn(listKbFoldersFn);
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || folders) return;
    void list().then((r) => { setFolders(r.folders); setError(r.error); }).catch(() => setError("Couldn't load folders."));
  }, [open, folders, list]);
  const label = value.length === 0 ? "All of KB" : `${value.length} folder${value.length === 1 ? "" : "s"}`;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" /> Knowledge: {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <button type="button" onClick={() => onChange([])} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted">
          <Check className={`h-3.5 w-3.5 ${value.length === 0 ? "" : "opacity-0"}`} /> Whole knowledge base
        </button>
        <div className="my-1 h-px bg-border" />
        {!folders && !error && <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>}
        {error && <div className="px-2 py-1.5 text-xs text-destructive">{error}</div>}
        <div className="max-h-64 overflow-y-auto">
          {folders?.map((f) => (
            <button key={f.id} type="button" onClick={() => toggle(f.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted">
              <Check className={`h-3.5 w-3.5 shrink-0 ${value.includes(f.id) ? "" : "opacity-0"}`} /> {f.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

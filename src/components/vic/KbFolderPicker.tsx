import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { listKbFoldersFn } from "@/utils/vic.functions";

/** Choose which Knowledge Base folders Vic searches (none = whole KB). */
export function KbFolderPicker({ value, onChange, placement = "composer" }: { value: string[]; onChange: (v: string[]) => void; placement?: "composer" | "sidebar" }) {
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
        <Button type="button" variant={value.length ? "secondary" : "ghost"} size="sm" className={placement === "sidebar" ? "h-auto min-h-10 w-full justify-start whitespace-normal text-left" : "h-8 gap-1.5 text-xs text-muted-foreground"}>
          <BookOpen className="h-3.5 w-3.5" /> {placement === "sidebar" ? <span>Knowledge<span className="block text-[11px] font-normal text-muted-foreground">{label}</span></span> : `Knowledge: ${label}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <Button type="button" variant="ghost" onClick={() => onChange([])} className="h-auto min-h-8 w-full justify-start whitespace-normal px-2 py-1.5 text-xs">
          <Check className={`h-3.5 w-3.5 ${value.length === 0 ? "" : "opacity-0"}`} /> Whole knowledge base
        </Button>
        <div className="my-1 h-px bg-border" />
        {!folders && !error && <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>}
        {error && <div className="px-2 py-1.5 text-xs text-destructive">{error}</div>}
        <div className="max-h-64 overflow-y-auto">
          {folders?.map((f) => (
            <Button key={f.id} type="button" variant="ghost" aria-pressed={value.includes(f.id)} onClick={() => toggle(f.id)} className="h-auto min-h-8 w-full justify-start whitespace-normal px-2 py-1.5 text-left text-xs">
              <Check className={`h-3.5 w-3.5 shrink-0 ${value.includes(f.id) ? "" : "opacity-0"}`} /> {f.name}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Check, Folder, RotateCw } from "lucide-react";
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
    if ((placement !== "sidebar" && !open) || folders) return;
    void list().then((r) => { setFolders(r.folders); setError(r.error); }).catch(() => setError("Couldn't load folders."));
  }, [open, folders, list, placement]);
  const label = value.length === 0 ? "All of KB" : `${value.length} folder${value.length === 1 ? "" : "s"}`;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  if (placement === "sidebar") return <section aria-label="Knowledge" className="space-y-2">
    <h2 className="text-xs font-semibold text-muted-foreground">Knowledge</h2>
    <div className="grid gap-1.5">
      <Button type="button" variant={value.length === 0 ? "secondary" : "outline"} aria-pressed={value.length === 0} onClick={() => onChange([])} className="h-auto min-h-10 w-full justify-start gap-2 whitespace-normal px-2.5 py-2 text-left text-xs">
        <BookOpen className="shrink-0" /><span className="min-w-0 flex-1">Whole knowledge base</span>{value.length === 0 && <Check className="h-3.5 w-3.5 shrink-0" />}
      </Button>
      {!folders && !error && <p className="text-xs text-muted-foreground">Loading folders…</p>}
      {error && <div className="space-y-1"><p role="alert" className="text-xs text-destructive">{error}</p><Button type="button" variant="outline" size="sm" onClick={() => { setError(""); void list().then((r) => { setFolders(r.folders); setError(r.error); }).catch(() => setError("Couldn't load folders.")); }}><RotateCw />Retry</Button></div>}
      {folders?.map((folder) => <Button key={folder.id} type="button" variant={value.includes(folder.id) ? "secondary" : "outline"} aria-pressed={value.includes(folder.id)} onClick={() => toggle(folder.id)} className="h-auto min-h-10 w-full justify-start gap-2 whitespace-normal px-2.5 py-2 text-left text-xs">
        <Folder className="shrink-0" /><span className="min-w-0 flex-1">{folder.name}</span>{value.includes(folder.id) && <Check className="h-3.5 w-3.5 shrink-0" />}
      </Button>)}
    </div>
  </section>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant={value.length ? "secondary" : "ghost"} size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" /> {`Knowledge: ${label}`}
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

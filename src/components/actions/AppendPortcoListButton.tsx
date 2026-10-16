import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchPortcoListFn } from "@/utils/actions.functions";
import { findPortco, formatPortcoList } from "@/lib/portco-list";

/** Appends approved PortCo bullets (name, website, one sentence) from the PortCo List sheet. */
export function AppendPortcoListButton({ preselected = [], onAppend, size = "sm" }: {
  preselected?: string[]; onAppend: (text: string) => void; size?: "sm" | "default";
}) {
  const fetchList = useServerFn(fetchPortcoListFn);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["portco-list"], queryFn: () => fetchList(), staleTime: 10 * 60_000, enabled: open });
  const list = data?.list ?? [];
  const initial = useMemo(() => preselected.map((p) => findPortco(list, p)?.name || p), [preselected, list]);
  const [picked, setPicked] = useState<string[] | null>(null);
  const chosen = picked ?? initial;
  const toggle = (n: string) => setPicked((chosen.includes(n) ? chosen.filter((x) => x !== n) : [...chosen, n]));
  const shown = list.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()));
  const apply = () => {
    const r = formatPortcoList(list, chosen);
    if (r.missing.length) toast.warning(`Not in the PortCo List: ${r.missing.join(", ")}`);
    if (!r.text) return;
    onAppend(r.text);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPicked(null); }}>
      <PopoverTrigger asChild>
        <Button type="button" size={size} variant="outline"><ListPlus className="h-4 w-4 mr-1" />Append PortCo list</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        {isLoading ? <p className="flex items-center gap-2 p-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading PortCo List…</p>
          : data?.error ? <p className="p-2 text-xs text-destructive">{data.error}</p>
          : <>
            <Input className="mb-2 h-8 text-xs" placeholder="Search PortCos" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-60 overflow-auto">
              {shown.map((e) => (
                <button key={e.name} type="button" onClick={() => toggle(e.name)} className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent">
                  <Checkbox checked={chosen.includes(e.name)} className="pointer-events-none mt-0.5" />
                  <span><b>{e.name}</b> <span className="text-muted-foreground">{e.summary.slice(0, 70)}{e.summary.length > 70 ? "…" : ""}</span></span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
              <span className="truncate text-[10px] text-muted-foreground">From {data?.file}</span>
              <Button size="sm" disabled={!chosen.length} onClick={apply}>Append {chosen.length || ""}</Button>
            </div>
          </>}
      </PopoverContent>
    </Popover>
  );
}

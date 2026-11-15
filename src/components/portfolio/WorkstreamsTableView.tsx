// Spreadsheet view of every workstream: filter, edit cells inline, add a workstream, choose columns.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EditableCell, type CellKind } from "@/components/portfolio/table/EditableCell";
import { ColumnChooser, useColumnChoice, type ColumnOption } from "@/components/portfolio/table/ColumnChooser";
import { createWorkstreamFn, updateWorkstreamFn } from "@/utils/asana.functions";
import { fetchPortcoTableFn } from "@/utils/portco-store.functions";
import { patchWorkstreamCache, useWorkstreams } from "@/lib/use-workstreams";
import { isWorkstreamCompleted, type Workstream } from "@/lib/workstream-parse";
import { OWNER_OPTIONS, WORKSTREAM_FIELD_DEFS } from "@/lib/portco-fields-schema";
import { PORTDEV_OPS } from "@/lib/portco-import";
import { priorityTone } from "@/components/portfolio/WorkstreamsPanel";
import { cn } from "@/lib/utils";

/** Workstream Priority as the same colored pill used on the company page. */
const renderPriority = (v: string) => <span className={cn("inline-block rounded-full border px-2 py-px text-[11px] font-medium", priorityTone(v))}>{v}</span>;

const DEFAULT_COLUMNS = ["Segment", "Owner", "Workstream Status", "Workstream Priority", "Sell-In Status", "Dell Targets", "Dell Stakeholders", "Completed"];
const ARCHIVED = "archived:";
const ALL = "__all__";

function kindOf(key: string): { kind: CellKind; options?: readonly string[] } {
  if (key === "Owner") return { kind: "enum", options: OWNER_OPTIONS };
  if (key === "Completed") return { kind: "enum", options: ["Yes", "No"] };
  if (key === "Name" || key === "Notes") return { kind: "text" };
  const d = WORKSTREAM_FIELD_DEFS.find((x) => x.name === key);
  return d ? { kind: d.type, options: d.options } : { kind: "readonly" };
}

export function WorkstreamsTableView({ companyNames }: { companyNames: string[] }) {
  const { workstreams, loading, refresh } = useWorkstreams();
  const loadArchives = useServerFn(fetchPortcoTableFn);
  const { data: archiveData } = useQuery({ queryKey: ["portco-table"], queryFn: () => loadArchives(), staleTime: 60_000 });
  const archives = archiveData?.workstreamArchives || {};
  const update = useServerFn(updateWorkstreamFn);
  const create = useServerFn(createWorkstreamFn);
  const [patched, setPatched] = useState<Record<string, Workstream>>({});
  const [cols, setCols, resetCols] = useColumnChoice("workstreams", DEFAULT_COLUMNS);
  const [q, setQ] = useState("");
  const [company, setCompany] = useState(ALL);
  const [segment, setSegment] = useState(ALL);
  const [owner, setOwner] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ company: "", segment: "GTM" as "GTM" | "BD", name: "" });
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => workstreams.map((w) => patched[w.gid] || w), [workstreams, patched]);
  const companies = useMemo(() => [...new Set([...companyNames, PORTDEV_OPS, ...list.map((w) => w.company)])].filter(Boolean).sort((a, b) => a.localeCompare(b)), [companyNames, list]);
  const options: ColumnOption[] = useMemo(() => {
    const archived = [...new Set(Object.values(archives).flatMap((a) => Object.keys(a)))].sort();
    return [
      { key: "Segment", label: "GTM / BD" }, { key: "Owner", label: "Owner" }, { key: "Completed", label: "Completed" },
      ...WORKSTREAM_FIELD_DEFS.map((d) => ({ key: d.name, label: d.name })), { key: "Notes", label: "Notes" },
      ...archived.map((a) => ({ key: ARCHIVED + a, label: a, archived: true })),
    ];
  }, [archives]);
  const shown = options.filter((o) => cols.includes(o.key));

  const valueOf = (w: Workstream, key: string): string => {
    if (key === "Company") return w.company;
    if (key === "Name") return w.name;
    if (key === "Segment") return w.segment;
    if (key === "Owner") return w.owner;
    if (key === "Notes") return w.notes;
    if (key === "Completed") return isWorkstreamCompleted(w) ? "Yes" : "No";
    if (key.startsWith(ARCHIVED)) return archives[w.gid]?.[key.slice(ARCHIVED.length)] || "";
    return w.fields[key] || "";
  };

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return list
      .filter((w) => showDone || !isWorkstreamCompleted(w))
      .filter((w) => company === ALL || w.company === company)
      .filter((w) => segment === ALL || w.segment === segment)
      .filter((w) => owner === ALL || (owner === "" ? !w.owner : w.owner === owner))
      .filter((w) => status === ALL || (w.workstreamStatus || "").split(/\s*,\s*/).includes(status))
      .filter((w) => !term || [w.company, w.name, w.notes, ...Object.values(w.fields)].some((v) => (v || "").toLowerCase().includes(term)))
      .sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name));
  }, [list, q, company, segment, owner, status, showDone]);

  const saveCell = async (w: Workstream, key: string, original: string, next: string | string[], undo = false): Promise<boolean> => {
    const value = Array.isArray(next) ? next : next.trim();
    const d = WORKSTREAM_FIELD_DEFS.find((x) => x.name === key);
    const payload = {
      gid: w.gid,
      changes: d ? [{ gid: d.name, type: d.type, original: d.type === "multi_enum" ? (original ? original.split(/\s*,\s*/) : []) : original, value }] : [],
      ...(key === "Owner" ? { owner: { original, value: String(value) } } : {}),
      ...(key === "Name" ? { title: { original, value: String(value) } } : {}),
      ...(key === "Notes" ? { notes: { original, value: String(value) } } : {}),
      ...(key === "Completed" ? { completed: value === "Yes" } : {}),
    };
    const res = await update({ data: payload }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
    if (!res.ok) { toast.error(res.error); return false; }
    patchWorkstreamCache(res.workstream);
    setPatched((p) => ({ ...p, [w.gid]: res.workstream }));
    const stored = valueOf(res.workstream, key);
    if (!undo) toast.success(`${w.name}: ${key} saved`, { action: { label: "Undo", onClick: () => void saveCell(res.workstream, key, stored, original, true) } });
    return true;
  };

  const addWorkstream = async () => {
    if (!draft.company || !draft.name.trim()) return;
    setBusy(true);
    const res = await create({ data: { company: draft.company, segment: draft.segment, name: draft.name.trim() } }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(`Added "${res.workstream.name}" to ${res.workstream.company}`);
    setDraft((d) => ({ ...d, name: "" }));
    setAdding(false);
    await refresh();
  };

  const owners = [...OWNER_OPTIONS];
  const statuses = WORKSTREAM_FIELD_DEFS.find((d) => d.name === "Workstream Status")!.options!;
  const filterSelect = (value: string, set: (v: string) => void, label: string, items: { value: string; label: string }[], width = "w-40") => (
    <Select value={value} onValueChange={set}>
      <SelectTrigger className={`h-8 ${width} text-xs`} aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL} className="text-xs">{label}: all</SelectItem>
        {items.map((i) => <SelectItem key={i.value || "none"} value={i.value || "__unassigned__"} className="text-xs">{i.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-8 pl-7 text-sm" placeholder="Search workstreams" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {filterSelect(company, setCompany, "Company", companies.map((c) => ({ value: c, label: c })), "w-48")}
        {filterSelect(segment, setSegment, "GTM / BD", [{ value: "GTM", label: "GTM" }, { value: "BD", label: "BD" }, { value: "Other", label: "Other" }], "w-32")}
        {filterSelect(owner === "" ? "__unassigned__" : owner, (v) => setOwner(v === "__unassigned__" ? "" : v), "Owner", [...owners.map((o) => ({ value: o, label: o })), { value: "", label: "Unassigned" }])}
        {filterSelect(status, setStatus, "Status", statuses.map((s) => ({ value: s, label: s })), "w-44")}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={showDone} onCheckedChange={(v) => setShowDone(v === true)} /> Show completed
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAdding((a) => !a)}><Plus className="mr-1 h-3.5 w-3.5" />Add workstream</Button>
          <ColumnChooser options={options} value={cols} onChange={setCols} onReset={resetCols} />
        </div>
      </div>
      {adding && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
          <Select value={draft.company || undefined} onValueChange={(v) => setDraft((d) => ({ ...d, company: v }))}>
            <SelectTrigger className="h-8 w-52 text-xs"><SelectValue placeholder="PortCo or PortDev Ops" /></SelectTrigger>
            <SelectContent>{companies.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
          </Select>
          <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
            {(["GTM", "BD"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setDraft((d) => ({ ...d, segment: s }))} className={`rounded px-2.5 py-1 ${draft.segment === s ? "bg-secondary text-secondary-foreground" : ""}`}>{s}</button>
            ))}
          </div>
          <Input className="h-8 min-w-[220px] flex-1 text-xs" placeholder="Workstream name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") void addWorkstream(); }} />
          <Button size="sm" className="h-8 text-xs" disabled={busy || !draft.company || !draft.name.trim()} onClick={() => void addWorkstream()}>{busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Add</Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{rows.length} workstream{rows.length === 1 ? "" : "s"} · click a cell to edit</p>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 whitespace-nowrap border-b border-border bg-muted/60 px-2 py-2 text-left text-[11px] font-semibold text-muted-foreground">Company</th>
              <th className="whitespace-nowrap border-b border-border bg-muted/60 px-2 py-2 text-left text-[11px] font-semibold text-muted-foreground">Workstream</th>
              {shown.map((o) => <th key={o.key} className="whitespace-nowrap border-b border-border bg-muted/60 px-2 py-2 text-left text-[11px] font-semibold text-muted-foreground">{o.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={shown.length + 2} className="p-6 text-center text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>}
            {!loading && rows.map((w) => (
              <tr key={w.gid} className="border-b border-border last:border-0 hover:bg-accent/20">
                <td className="sticky left-0 z-10 min-w-[150px] border-r border-border bg-card px-2 py-1.5 font-medium text-foreground">{w.company}</td>
                <td className="min-w-[220px] max-w-[320px] border-r border-border p-0"><EditableCell kind="text" value={w.name} onSave={(next) => saveCell(w, "Name", w.name, next)} /></td>
                {shown.map((o) => {
                  const k = kindOf(o.key);
                  const v = valueOf(w, o.key);
                  const editable = k.kind !== "readonly" && o.key !== "Segment";
                  return (
                    <td key={o.key} className="min-w-[130px] max-w-[260px] border-r border-border p-0 last:border-r-0">
                      <EditableCell kind={editable ? k.kind : "readonly"} options={k.options} value={v} render={o.key === "Workstream Priority" ? renderPriority : undefined} onSave={editable ? (next) => saveCell(w, o.key, v, next) : undefined} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Spreadsheet view of PortCo investment details: one row per company, editable cells, column chooser.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { PortcoLogo } from "@/components/portfolio/PortcoLogo";
import { EditableCell, type CellKind } from "@/components/portfolio/table/EditableCell";
import { ColumnChooser, useColumnChoice, type ColumnOption } from "@/components/portfolio/table/ColumnChooser";
import { fetchPortcoTableFn, saveProfileCellFn, type PortcoTableProfile } from "@/utils/portco-store.functions";
import { OWNER_OPTIONS, PROFILE_FIELD_DEFS } from "@/lib/portco-fields-schema";
import type { PortfolioCompany } from "@/lib/types";

const DEFAULT_COLUMNS = ["Owner", "DTC Priority", "Lead Investor", "Company Stage", "DTC Investment ($M)", "DTC Ownership", "GTM Marketing/PMF", "Sales Maturity", "Help / Influence"];
const ARCHIVED = "archived:";
const QUERY_KEY = ["portco-table"];

function kindOf(key: string): { kind: CellKind; options?: readonly string[] } {
  if (key === "Owner") return { kind: "enum", options: OWNER_OPTIONS };
  if (key.startsWith(ARCHIVED)) return { kind: "readonly" };
  const d = PROFILE_FIELD_DEFS.find((x) => x.name === key);
  return d ? { kind: d.type, options: d.options } : { kind: "readonly" };
}

export function PortcoTableView({ companies, onOpenCompany, onProfileSaved }: {
  companies: PortfolioCompany[];
  onOpenCompany: (c: PortfolioCompany) => void;
  onProfileSaved: (company: PortfolioCompany, field: string, value: string) => void;
}) {
  const load = useServerFn(fetchPortcoTableFn);
  const save = useServerFn(saveProfileCellFn);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: QUERY_KEY, queryFn: () => load(), staleTime: 60_000 });
  const [cols, setCols, resetCols] = useColumnChoice("portcos", DEFAULT_COLUMNS);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "Company", dir: 1 });

  const profileFor = useMemo(() => {
    const byUrid = new Map<string, PortcoTableProfile>(), byName = new Map<string, PortcoTableProfile>();
    for (const p of data?.profiles || []) { if (p.urid) byUrid.set(p.urid, p); byName.set(p.company.trim().toLowerCase(), p); }
    return (c: PortfolioCompany) => (c.urid && byUrid.get(c.urid)) || byName.get(c.name.trim().toLowerCase());
  }, [data]);

  const options: ColumnOption[] = useMemo(() => {
    const archived = [...new Set((data?.profiles || []).flatMap((p) => Object.keys(p.archived)))].sort();
    return [{ key: "Owner", label: "Owner" }, ...PROFILE_FIELD_DEFS.map((d) => ({ key: d.name, label: d.name })), ...archived.map((a) => ({ key: ARCHIVED + a, label: a, archived: true }))];
  }, [data]);
  const shown = options.filter((o) => cols.includes(o.key));

  const valueOf = (c: PortfolioCompany, key: string): string => {
    const p = profileFor(c);
    if (key === "Company") return c.name;
    if (key === "Owner") return p?.owner || "";
    if (key.startsWith(ARCHIVED)) return p?.archived[key.slice(ARCHIVED.length)] || "";
    return p?.fields[key] || "";
  };

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const isNum = PROFILE_FIELD_DEFS.find((d) => d.name === sort.key)?.type === "number";
    return companies
      .filter((c) => !term || c.name.toLowerCase().includes(term) || shown.some((o) => valueOf(c, o.key).toLowerCase().includes(term)))
      .sort((a, b) => {
        const x = valueOf(a, sort.key), y = valueOf(b, sort.key);
        if (!x && y) return 1;
        if (x && !y) return -1;
        const r = isNum ? Number(x) - Number(y) : x.localeCompare(y, undefined, { numeric: true });
        return r * sort.dir || a.name.localeCompare(b.name);
      });
  }, [companies, q, sort, data, cols]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCell = async (c: PortfolioCompany, field: string, original: string, next: string | string[], undo = false): Promise<boolean> => {
    const res = await save({ data: { urid: c.urid, company: c.name, field, original, value: next } }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
    if (!res.ok) { toast.error(res.error); return false; }
    qc.setQueryData(QUERY_KEY, (old: typeof data) => old && ({ ...old, profiles: [...old.profiles.filter((p) => p !== profileFor(c)), res.profile] }));
    const stored = field === "Owner" ? res.profile.owner : res.profile.fields[field] || "";
    onProfileSaved(c, field, stored);
    if (!undo) toast.success(`${c.name}: ${field} saved`, { action: { label: "Undo", onClick: () => void saveCell(c, field, stored, original, true) } });
    return true;
  };

  const header = (key: string, label: string, sticky = false) => (
    <th key={key} className={`whitespace-nowrap border-b border-border bg-muted/60 px-2 py-2 text-left text-[11px] font-semibold text-muted-foreground ${sticky ? "sticky left-0 z-20" : ""}`}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-8 pl-7 text-sm" placeholder="Search the table" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="text-xs text-muted-foreground">{rows.length} compan{rows.length === 1 ? "y" : "ies"} · click a cell to edit</span>
        <div className="ml-auto"><ColumnChooser options={options} value={cols} onChange={setCols} onReset={resetCols} /></div>
      </div>
      {data?.error && <p className="text-xs text-destructive">Couldn't load PortCo details: {data.error}</p>}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {header("Company", "Company", true)}
              {shown.map((o) => header(o.key, o.label))}
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={shown.length + 1} className="p-6 text-center text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>}
            {!isLoading && rows.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-accent/20">
                <td className="sticky left-0 z-10 min-w-[180px] border-r border-border bg-card px-2 py-1">
                  <button type="button" onClick={() => onOpenCompany(c)} className="flex items-center gap-2 text-left text-xs font-medium text-foreground hover:text-primary">
                    <PortcoLogo name={c.name} website={c.website} size="sm" />
                    <span className="truncate">{c.name}</span>
                  </button>
                </td>
                {shown.map((o) => {
                  const k = kindOf(o.key);
                  const v = valueOf(c, o.key);
                  return (
                    <td key={o.key} className="min-w-[140px] max-w-[260px] border-r border-border p-0 last:border-r-0">
                      <EditableCell kind={k.kind} options={k.options} value={v} onSave={k.kind === "readonly" ? undefined : (next) => saveCell(c, o.key, v, next)} />
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

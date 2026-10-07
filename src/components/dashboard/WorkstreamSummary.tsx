import { useMemo, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { WorkstreamRow } from "@/components/portfolio/WorkstreamsPanel";
import { useWorkstreams } from "@/lib/use-workstreams";
import { workstreamBarStatus, type Workstream } from "@/lib/workstream-parse";
import { ownerMatches, priorityRank } from "@/lib/action-owners";
import { companyLogoSources, resolveCompanyLogoDomain } from "@/lib/domain-utils";
import { cleanPriority, type MatrixPoint } from "@/lib/portco-matrix";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  keys: string[];
  scopeLabel: string;
  actionOwner?: string;
  /** Matrix points, for company names + logos. */
  points: MatrixPoint[];
}

function CompanyLogo({ name, website }: { name: string; website: string }) {
  const [idx, setIdx] = useState(0);
  const resolved = resolveCompanyLogoDomain({ website });
  const sources =
    resolved && resolved.confidence === "high"
      ? companyLogoSources(resolved.domain, resolved.confidence)
      : [];
  const src = sources[idx];
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card">
      {src ? (
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setIdx((i) => i + 1)}
        />
      ) : (
        <span className="text-xs font-semibold text-foreground">
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}

function FilterSelect({
  value,
  onChange,
  allLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: string[];
}) {
  return (
    <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
      <SelectTrigger className="h-8 w-36 text-xs bg-card">
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MultiSelectFilter({
  selected,
  onChange,
  allLabel,
  options,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
  allLabel: string;
  options: string[];
}) {
  const allOn = selected.length === 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-36 justify-between text-xs font-normal bg-card"
        >
          <span className="truncate">
            {allOn
              ? allLabel
              : selected.length === 1
                ? selected[0]
                : `${selected.length} selected`}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
          onClick={() => onChange([])}
        >
          <Check className={cn("h-3.5 w-3.5", allOn ? "opacity-100" : "opacity-0")} />
          {allLabel}
        </button>
        <div className="my-1 h-px bg-border" />
        <div className="max-h-56 overflow-y-auto">
          {options.map((o) => {
            const on = selected.includes(o);
            return (
              <button
                key={o}
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
                onClick={() =>
                  onChange(on ? selected.filter((s) => s !== o) : [...selected, o])
                }
              >
                <Check className={cn("h-3.5 w-3.5", on ? "opacity-100" : "opacity-0")} />
                {o}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const byPriority = (a: Workstream, b: Workstream) =>
  Number(a.completed) - Number(b.completed) ||
  priorityRank(a.workstreamPriority) - priorityRank(b.workstreamPriority) ||
  a.name.localeCompare(b.name);

export function WorkstreamSummary({ keys, scopeLabel, actionOwner = "", points }: Props) {
  const { workstreams, loading } = useWorkstreams();
  const keySet = useMemo(() => new Set(keys), [keys]);
  const pointByKey = useMemo(() => new Map(points.map((p) => [p.key, p])), [points]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [priority, setPriority] = useState("");

  const base = useMemo(
    () =>
      workstreams.filter(
        (w) => keySet.has(w.companyKey) && ownerMatches(w.owner, actionOwner),
      ),
    [workstreams, keySet, actionOwner],
  );
  const nameOf = (w: Workstream) => pointByKey.get(w.companyKey)?.name || w.company;

  const companyOpts = useMemo(
    () => [...new Set(base.map(nameOf))].sort((a, b) => a.localeCompare(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, pointByKey],
  );
  // Priority quick-picks (Needle mover, Nurture, Back burner…) for the PortCo filter.
  const priorityGroups = useMemo(() => {
    const names = new Set(companyOpts);
    const map = new Map<string, string[]>();
    for (const p of points) {
      const name = p.name;
      if (!names.has(name)) continue;
      const pr = cleanPriority(p.priority);
      if (!pr) continue;
      map.set(pr, [...(map.get(pr) ?? []), name]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [points, companyOpts]);
  const statusOpts = useMemo(
    () => [...new Set(base.map(workstreamBarStatus))].sort((a, b) => a.localeCompare(b)),
    [base],
  );
  const priorityOpts = useMemo(
    () =>
      [...new Set(base.map((w) => w.workstreamPriority || "Not set"))].sort(
        (a, b) => priorityRank(a) - priorityRank(b) || a.localeCompare(b),
      ),
    [base],
  );

  const groups = useMemo(() => {
    const items = base.filter(
      (w) =>
        (companies.length === 0 || companies.includes(nameOf(w))) &&
        (statuses.length === 0 || statuses.includes(workstreamBarStatus(w))) &&
        (!priority || (w.workstreamPriority || "Not set") === priority),
    );
    const map = new Map<string, Workstream[]>();
    for (const w of items) {
      const list = map.get(w.companyKey) ?? [];
      list.push(w);
      map.set(w.companyKey, list);
    }
    return [...map.entries()]
      .map(([key, list]) => ({ key, items: list.sort(byPriority) }))
      .sort((a, b) => {
        const best = (l: Workstream[]) => byPriority(l[0]!, l[0]!) || priorityRank(l[0]!.workstreamPriority);
        return (
          best(a.items) - best(b.items) ||
          (pointByKey.get(a.key)?.name || a.key).localeCompare(pointByKey.get(b.key)?.name || b.key)
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, companies, statuses, priority, pointByKey]);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-sm font-semibold text-foreground">Major workstreams</h2>
          <p className="text-xs text-muted-foreground">
            {scopeLabel}
            {actionOwner && !scopeLabel.includes(actionOwner) ? ` · ${actionOwner}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-40 justify-between text-xs font-normal bg-card"
              >
                <span className="truncate">
                  {companies.length === 0
                    ? "All PortCos"
                    : companies.length === 1
                      ? companies[0]
                      : `${companies.length} PortCos`}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-1">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
                onClick={() => setCompanies([])}
              >
                <Check className={cn("h-3.5 w-3.5", companies.length === 0 ? "opacity-100" : "opacity-0")} />
                All PortCos
              </button>
              {priorityGroups.map(([pr, names]) => {
                const active =
                  names.length > 0 &&
                  companies.length === names.length &&
                  names.every((n) => companies.includes(n));
                return (
                  <button
                    key={pr}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
                    onClick={() => setCompanies(active ? [] : names)}
                  >
                    <Check className={cn("h-3.5 w-3.5", active ? "opacity-100" : "opacity-0")} />
                    {pr}
                  </button>
                );
              })}
              <div className="my-1 h-px bg-border" />
              <div className="max-h-56 overflow-y-auto">
                {companyOpts.map((name) => {
                  const on = companies.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
                      onClick={() =>
                        setCompanies(on ? companies.filter((c) => c !== name) : [...companies, name])
                      }
                    >
                      <Check className={cn("h-3.5 w-3.5", on ? "opacity-100" : "opacity-0")} />
                      {name}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <FilterSelect value={status} onChange={setStatus} allLabel="All statuses" options={statusOpts} />
          <FilterSelect value={priority} onChange={setPriority} allLabel="All priorities" options={priorityOpts} />
        </div>
      </div>
      <Card className="border-border">
        <CardContent className="p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-6">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading workstreams…
            </div>
          ) : groups.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6">No workstreams match.</p>
          ) : (
            <div className="divide-y divide-border">
              {groups.map(({ key, items }) => {
                const p = pointByKey.get(key);
                const name = p?.name || items[0]!.company;
                const open = items.filter((w) => !w.completed).length;
                return (
                  <div key={key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <CompanyLogo name={name} website={p?.website || ""} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-display text-sm font-semibold text-foreground">{name}</h3>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {open} active · {items.length - open} complete
                        </span>
                      </div>
                      {items.map((w) => (
                        <WorkstreamRow key={w.gid} w={w} showSegment />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

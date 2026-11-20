import { cn } from "@/lib/utils";

/** One row of filter chips: "All" plus each option with a count. Empty selection = all. */
export function FacetChips({
  label,
  options,
  value,
  onChange,
  counts,
  hideEmpty = false,
}: {
  label: string;
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
  counts?: Map<string, number>;
  /** Hide options with no matches (unless selected). */
  hideEmpty?: boolean;
}) {
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);
  const shown = options.filter((o) => !hideEmpty || value.includes(o) || (counts?.get(o) || 0) > 0);
  const chip = (active: boolean, disabled = false) =>
    cn(
      "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted",
      disabled && !active && "opacity-40",
    );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <button type="button" className={chip(value.length === 0)} onClick={() => onChange([])}>
        All
      </button>
      {shown.map((o) => {
        const n = counts?.get(o) || 0;
        return (
          <button key={o} type="button" aria-pressed={value.includes(o)} className={chip(value.includes(o), !!counts && n === 0)} onClick={() => toggle(o)}>
            {o}
            {counts && <span className="ml-1 opacity-70">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

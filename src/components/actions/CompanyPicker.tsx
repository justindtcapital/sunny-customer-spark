import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { companyKey, exactCompany, rankCompanies, type CompanyOption } from "@/lib/company-picker";

/**
 * Searchable PortCo / Partner picker. Matching ignores spaces and case, and a listed
 * company is always saved with its exact name; other companies can still be typed in.
 */
export function CompanyPicker({ id, value, options, onChange }: { id?: string; value: string; options: CompanyOption[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ranked = useMemo(() => rankCompanies(query, options), [query, options]);
  const exact = exactCompany(query, options);
  const current = exactCompany(value, options);
  const commit = (v: string) => { onChange(v); setQuery(""); setOpen(false); };
  const groups = (["PortCo", "Partner"] as const).map((k) => [k, ranked.filter((o) => o.kind === k)] as const).filter(([, l]) => l.length);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value || "Pick a PortCo or partner"}</span>
          <span className="ml-2 flex shrink-0 items-center gap-1">
            {current && <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">{current.kind}</span>}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search PortCos and partners…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No PortCo or partner matches.</CommandEmpty>
            {groups.map(([kind, list]) => (
              <CommandGroup key={kind} heading={kind === "PortCo" ? "PortCos" : "Partners"}>
                {list.slice(0, 50).map((o) => (
                  <CommandItem key={`${kind}:${o.name}`} value={`${kind}:${o.name}`} onSelect={() => commit(o.name)}>
                    <Check className={cn("mr-2 h-4 w-4", companyKey(value) === companyKey(o.name) ? "opacity-100" : "opacity-0")} />
                    {o.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {query.trim() && !exact && (
              <CommandGroup heading="Other company">
                <CommandItem value={`other:${query}`} onSelect={() => commit(query.trim())}>Use “{query.trim()}”</CommandItem>
              </CommandGroup>
            )}
            {value && (
              <CommandGroup>
                <CommandItem value="clear" onSelect={() => commit("")} className="text-muted-foreground">Clear company</CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

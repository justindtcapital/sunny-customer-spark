import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { fetchTargetCampaigns } from "@/utils/sheets.functions";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// Module-level cache so several dialogs share one Sheets read per session.
let cached: string[] | null = null;
let inflight: Promise<string[]> | null = null;

async function loadCampaigns(): Promise<string[]> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = fetchTargetCampaigns()
    .then((list) => {
      cached = list || [];
      return cached;
    })
    .catch(() => [] as string[])
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Drop the cache so a freshly written campaign shows up next time. */
export function invalidateCampaignCache() {
  cached = null;
}

// Campaign picker: suggests campaigns already used on the Targets tab (that
// column IS the vocabulary — no separate catalog) while always allowing a
// write-in value via "Use …".
export function CampaignCombobox({
  value,
  onChange,
  placeholder = "Pick or type a campaign",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>(cached ?? []);

  useEffect(() => {
    let alive = true;
    loadCampaigns().then((list) => {
      if (alive) setSuggestions(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q ? suggestions.filter((s) => s.toLowerCase().includes(q)) : suggestions;
  const exact = suggestions.some((s) => s.toLowerCase() === q);

  const commit = (v: string) => {
    onChange(v);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-9 w-full justify-between text-xs font-normal", className)}
        >
          <span
            className={cn("flex items-center gap-1.5 truncate", !value && "text-muted-foreground")}
          >
            <Megaphone className="h-3.5 w-3.5 shrink-0 opacity-60" />
            {value || placeholder}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type a campaign…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {query.trim() && !exact && (
              <CommandItem value={`__use__${query}`} onSelect={() => commit(query.trim())}>
                <Check className="mr-2 h-3.5 w-3.5 opacity-0" />
                Use “{query.trim()}”
              </CommandItem>
            )}
            {filtered.length === 0 && !query.trim() && (
              <CommandEmpty>No campaigns yet — type one.</CommandEmpty>
            )}
            {filtered.length > 0 && (
              <CommandGroup heading="Previous campaigns">
                {filtered.map((s) => (
                  <CommandItem key={s} value={s} onSelect={() => commit(s)}>
                    <Check
                      className={cn("mr-2 h-3.5 w-3.5", value === s ? "opacity-100" : "opacity-0")}
                    />
                    {s}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {value && (
              <>
                <CommandSeparator />
                <CommandItem
                  value="__clear__"
                  onSelect={() => commit("")}
                  className="text-muted-foreground"
                >
                  <Check className="mr-2 h-3.5 w-3.5 opacity-0" />
                  Clear campaign
                </CommandItem>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

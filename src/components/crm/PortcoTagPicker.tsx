import { useState } from "react";
import { Building2, Check, ChevronsUpDown, X } from "lucide-react";
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

interface Props {
  /** Selected portfolio company names. */
  value: string[];
  onChange: (value: string[]) => void;
  /** Portfolio company names to offer. */
  options: string[];
  placeholder?: string;
  className?: string;
  /** When set, selected names show as chips below; clicking one calls this (e.g. open its PortCo page). */
  onOpen?: (name: string) => void;
}

// Optional multi-select of portfolio companies a target list is built for.
// Names (not ids) are stored so the value round-trips straight into the Sheets
// "PortCo Tags" column.
export function PortcoTagPicker({
  value,
  onChange,
  options,
  placeholder = "Tag portfolio companies (optional)",
  className,
  onOpen,
}: Props) {
  const [open, setOpen] = useState(false);

  const toggle = (name: string) => {
    onChange(value.includes(name) ? value.filter((v) => v !== name) : [...value, name]);
  };

  const label =
    value.length === 0 ? placeholder : onOpen ? `${value.length} selected — click to add or remove` : value.join(", ");

  return (
    <div className="space-y-1.5">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-9 w-full justify-between text-xs font-normal", className)}
        >
          <span
            className={cn(
              "flex items-center gap-1.5 truncate",
              value.length === 0 && "text-muted-foreground",
            )}
          >
            <Building2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
            {label}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search portfolio companies…" />
          <CommandList>
            <CommandEmpty>No portfolio companies found.</CommandEmpty>
            <CommandGroup>
              {options.map((name) => (
                <CommandItem key={name} value={name} onSelect={() => toggle(name)}>
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      value.includes(name) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {name}
                </CommandItem>
              ))}
            </CommandGroup>
            {value.length > 0 && (
              <>
                <CommandSeparator />
                <CommandItem
                  value="__clear__"
                  onSelect={() => onChange([])}
                  className="text-muted-foreground"
                >
                  <Check className="mr-2 h-3.5 w-3.5 opacity-0" />
                  Clear tags
                </CommandItem>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    {onOpen && value.length > 0 && (
      <div className="flex flex-wrap gap-1.5">
        {value.map((name) => (
          <span key={name} className="inline-flex items-center rounded-md border border-border bg-muted/40 text-xs">
            <button type="button" className="px-2 py-1 hover:text-primary hover:underline" onClick={() => onOpen(name)} title={`Open ${name}`}>
              {name}
            </button>
            <button type="button" className="pr-1.5 text-muted-foreground hover:text-destructive" onClick={() => toggle(name)} aria-label={`Remove ${name}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    )}
    </div>
  );
}

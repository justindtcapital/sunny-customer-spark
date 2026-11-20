import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { fetchContacts, fetchPortfolioCompanies, fetchTargets } from "@/utils/sheets.functions";
import { markPortCoContacts } from "@/lib/contact-kind";
import { contactTier } from "@/lib/network-tiers";
import { MARKETS, marketFor, PRIMARY_DOMAINS, primaryDomainFor } from "@/lib/network-pyramid";
import { personKeyOf, type CampaignRecord, type CandidatePerson } from "@/lib/campaigns";
import {
  EMPTY_NETWORK_FILTER,
  facetCounts,
  filterAudience,
  SENIORITIES,
  seniorityOf,
  type AudiencePerson,
  type NetworkFilter,
} from "@/lib/campaign-audience";
import { FacetChips } from "./FacetChips";
import { PeopleTable } from "./PeopleTable";

const TIERS = ["Council", "Hot", "Warm", "Cold", "Prospect", "PortCo"] as const;
type Row = AudiencePerson & { person: CandidatePerson; tags: string[]; key: string };

/** Refine Network & Prospecting by tier, domain, market, seniority and company — live. */
export function NetworkAudience({ campaign, onAdd }: { campaign: CampaignRecord; onAdd: (p: CandidatePerson[]) => void }) {
  const contactsQ = useQuery({ queryKey: ["campaign-contacts"], queryFn: () => fetchContacts(), staleTime: 60_000 });
  const targetsQ = useQuery({ queryKey: ["campaign-targets"], queryFn: () => fetchTargets(), staleTime: 60_000 });
  const portfolioQ = useQuery({ queryKey: ["campaign-portcos"], queryFn: () => fetchPortfolioCompanies() });
  const [f, setF] = useState<NetworkFilter>(EMPTY_NETWORK_FILTER);
  const [onlyTagged, setOnlyTagged] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const set = <K extends keyof NetworkFilter>(k: K) => (v: NetworkFilter[K]) => {
    setPicked(new Set());
    setF((cur) => ({ ...cur, [k]: v }));
  };

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const names = (portfolioQ.data || []).map((p) => p.name);
    for (const c of markPortCoContacts(contactsQ.data || [], names)) {
      const person: CandidatePerson = {
        name: c.name, email: (c.email || "").split(/[,;]/)[0]?.trim() || "", title: c.title, company: c.company,
        linkedin: c.linkedinUrl || "", location: c.location || c.address, sector: c.sector, origin: "network", urid: c.urid,
      };
      out.push({
        person, key: `network:${personKeyOf(person)}`, name: c.name, company: c.company || "", email: person.email, title: c.title || "",
        tier: contactTier(c) ?? "PortCo", domain: primaryDomainFor(c.primaryArea, c.areasOfInterest), market: marketFor(person.location),
        seniority: seniorityOf(c.title || ""), tags: [...(c.eventsAttended || []), ...(c.eventsInvited || []), ...(c.portCoIntros || [])],
      });
    }
    for (const t of targetsQ.data || []) {
      const person: CandidatePerson = {
        name: t.name, email: t.email, title: t.title, company: t.company, linkedin: t.linkedinUrl,
        location: t.location, sector: t.sector, origin: "prospect", urid: t.urid,
      };
      out.push({
        person, key: `prospect:${personKeyOf(person)}`, name: t.name, company: t.company || "", email: t.email || "", title: t.title || "",
        tier: "Prospect", domain: primaryDomainFor(undefined, [t.sector || ""]), market: marketFor(t.location),
        seniority: seniorityOf(t.title || ""), tags: [t.event || "", ...(t.portcoTags || [])],
      });
    }
    return out;
  }, [contactsQ.data, targetsQ.data, portfolioQ.data]);

  const tagSet = useMemo(() => new Set([...campaign.events, ...campaign.portcos].map((x) => x.toLowerCase())), [campaign]);
  const pool = useMemo(
    () => (onlyTagged ? rows.filter((r) => r.tags.some((t) => tagSet.has(t.toLowerCase()))) : rows),
    [rows, onlyTagged, tagSet],
  );
  const filtered = useMemo(() => filterAudience(pool, f), [pool, f]);
  const shown = filtered.slice(0, 300);
  const companyCounts = useMemo(() => facetCounts(pool, f, "companies"), [pool, f]);
  const companyOptions = useMemo(
    () => [...companyCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    [companyCounts],
  );
  const byPerson = useMemo(() => new Map(filtered.map((r) => [r.person, r])), [filtered]);
  const loading = contactsQ.isLoading || targetsQ.isLoading;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-7" placeholder="Name, company, email" value={f.search} onChange={(e) => set("search")(e.target.value)} />
        </div>
        <Input placeholder="Title contains" value={f.title} onChange={(e) => set("title")(e.target.value)} />
        <CompanyMultiPick options={companyOptions} value={f.companies} onChange={set("companies")} />
      </div>
      <div className="space-y-1.5">
        <FacetChips label="Tier" options={TIERS} value={f.tiers} onChange={set("tiers")} counts={facetCounts(pool, f, "tiers")} />
        <FacetChips label="Domain" options={PRIMARY_DOMAINS} value={f.domains} onChange={set("domains")} counts={facetCounts(pool, f, "domains")} />
        <FacetChips label="Market" options={MARKETS} value={f.markets} onChange={set("markets")} counts={facetCounts(pool, f, "markets")} hideEmpty />
        <FacetChips label="Seniority" options={SENIORITIES} value={f.seniority} onChange={set("seniority")} counts={facetCounts(pool, f, "seniority")} />
      </div>
      {tagSet.size > 0 && (
        <label className="flex items-center gap-1.5 text-xs">
          <Switch checked={onlyTagged} onCheckedChange={(v) => { setPicked(new Set()); setOnlyTagged(v); }} /> Only people tied to this
          campaign's event/PortCos
        </label>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {loading ? "Loading…" : `${filtered.length} match${filtered.length === 1 ? "" : "es"}${filtered.length > 300 ? " (showing 300)" : ""}`}
          {(f !== EMPTY_NETWORK_FILTER || onlyTagged) && (
            <button
              type="button"
              className="ml-2 text-primary hover:underline"
              onClick={() => { setF(EMPTY_NETWORK_FILTER); setOnlyTagged(false); setPicked(new Set()); }}
            >
              Reset filters
            </button>
          )}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onAdd(filtered.map((r) => r.person))} disabled={!filtered.length}>
            Add all {filtered.length}
          </Button>
          <Button
            size="sm"
            disabled={!picked.size}
            onClick={() => {
              onAdd(filtered.filter((r) => picked.has(r.key)).map((r) => r.person));
              setPicked(new Set());
            }}
          >
            Add selected ({picked.size})
          </Button>
        </div>
      </div>
      <PeopleTable
        people={shown.map((r) => r.person)}
        badge={(p) => byPerson.get(p)?.tier || p.origin}
        selectable={{
          isSelected: (p) => { const r = byPerson.get(p); return !!r && picked.has(r.key); },
          toggle: (p) => {
            const r = byPerson.get(p);
            if (!r) return;
            setPicked((prev) => {
              const n = new Set(prev);
              if (n.has(r.key)) n.delete(r.key);
              else n.add(r.key);
              return n;
            });
          },
        }}
      />
    </div>
  );
}

function CompanyMultiPick({
  options,
  value,
  onChange,
}: {
  options: [string, number][];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const has = (n: string) => value.some((v) => v.toLowerCase() === n.toLowerCase());
  const toggle = (n: string) => onChange(has(n) ? value.filter((v) => v.toLowerCase() !== n.toLowerCase()) : [...value, n]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="h-9 w-full justify-between text-xs font-normal">
          <span className={cn("flex items-center gap-1.5 truncate", !value.length && "text-muted-foreground")}>
            <Building2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
            {value.length ? (value.length <= 2 ? value.join(", ") : `${value.length} companies`) : "Companies (any)"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search companies…" />
          <CommandList>
            <CommandEmpty>No companies found.</CommandEmpty>
            <CommandGroup>
              {value.length > 0 && (
                <CommandItem value="__clear__" onSelect={() => onChange([])} className="text-muted-foreground">
                  <Check className="mr-2 h-3.5 w-3.5 opacity-0" /> Any company
                </CommandItem>
              )}
              {options.slice(0, 400).map(([name, n]) => (
                <CommandItem key={name} value={name} onSelect={() => toggle(name)}>
                  <Check className={cn("mr-2 h-3.5 w-3.5", has(name) ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{name}</span>
                  <span className="ml-2 text-[10px] text-muted-foreground">{n}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

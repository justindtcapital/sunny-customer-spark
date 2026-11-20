import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Loader2, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { fetchContacts, fetchPortfolioCompanies } from "@/utils/sheets.functions";
import { MARKETS } from "@/lib/network-pyramid";
import { personKeyOf, type CampaignRecord, type CandidatePerson } from "@/lib/campaigns";
import {
  filterByRoles,
  filterPortcos,
  PORTCO_DOMAINS,
  portcoDomainOf,
  portcoMarketOf,
  portcoPeopleIndex,
  ROLE_GROUPS,
  roleGroupOf,
  type RoleGroup,
} from "@/lib/campaign-audience";
import { FacetChips } from "./FacetChips";
import { PeopleTable } from "./PeopleTable";

/**
 * Pick many portfolio companies at once (by domain, market or name), choose which roles
 * to reach, and stage everyone on record there in one click. The parent tags the campaign
 * with the chosen companies.
 */
export function PortcoAudience({
  campaign,
  onAdd,
  busy,
  skipKeys,
}: {
  campaign: CampaignRecord;
  /** People already in the campaign or staged — shown as already on the list, not re-added. */
  skipKeys: Set<string>;
  onAdd: (people: CandidatePerson[], portcos: string[]) => void;
  busy?: boolean;
}) {
  const contactsQ = useQuery({ queryKey: ["campaign-contacts"], queryFn: () => fetchContacts(), staleTime: 60_000 });
  const portfolioQ = useQuery({ queryKey: ["campaign-portcos"], queryFn: () => fetchPortfolioCompanies() });

  const companies = useMemo(() => {
    const seen = new Set<string>();
    return (portfolioQ.data || [])
      .filter((c) => c.name && !seen.has(c.name) && !!seen.add(c.name))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [portfolioQ.data]);
  const index = useMemo(() => portcoPeopleIndex(companies, contactsQ.data || []), [companies, contactsQ.data]);

  const [search, setSearch] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [markets, setMarkets] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>(() => campaign.portcos);
  const [roles, setRoles] = useState<RoleGroup[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const known = useMemo(() => new Set(companies.map((c) => c.name)), [companies]);
  const chosen = selected.filter((n) => known.has(n));
  const visible = filterPortcos(companies, { search, domains, markets });
  const count = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map<string, number>());
  const domainCounts = count(filterPortcos(companies, { search, domains: [], markets }).map(portcoDomainOf));
  const marketCounts = count(filterPortcos(companies, { search, domains, markets: [] }).map(portcoMarketOf));

  // Everyone on record at the chosen companies, then the role filter, then manual unticks.
  const atChosen = useMemo(() => {
    const out: CandidatePerson[] = [];
    const seen = new Set<string>();
    for (const name of chosen) {
      for (const c of index.get(name) || []) {
        const p: CandidatePerson = {
          name: c.name,
          email: (c.email || "").split(/[,;]/)[0]?.trim() || "",
          title: c.title || "",
          company: c.company || name,
          linkedin: c.linkedinUrl || "",
          location: c.location || c.address,
          sector: c.sector,
          origin: "network",
          urid: c.urid,
        };
        const k = personKeyOf(p);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(p);
      }
    }
    return out;
  }, [chosen, index]);
  const roleCounts = count(atChosen.map((p) => roleGroupOf(p.title)));
  const byRole = filterByRoles(atChosen, roles);
  const already = byRole.filter((p) => skipKeys.has(personKeyOf(p)));
  const ready = byRole.filter((p) => !excluded.has(personKeyOf(p)) && !skipKeys.has(personKeyOf(p)));
  const noEmail = ready.filter((p) => !p.email).length;
  const empty = chosen.filter((n) => !(index.get(n) || []).length);

  const toggleCo = (name: string) =>
    setSelected((cur) => (cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]));
  const allShownPicked = visible.length > 0 && visible.every((c) => chosen.includes(c.name));
  const loading = contactsQ.isLoading || portfolioQ.isLoading;

  if (loading)
    return (
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading portfolio companies…
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="relative max-w-sm">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-7" placeholder="Search portfolio companies" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <FacetChips label="Domain" options={PORTCO_DOMAINS} value={domains} onChange={setDomains} counts={domainCounts} hideEmpty />
        <FacetChips label="Market" options={MARKETS} value={markets} onChange={setMarkets} counts={marketCounts} hideEmpty />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-foreground">
            {chosen.length} of {companies.length} companies selected
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={!visible.length}
            onClick={() =>
              setSelected((cur) =>
                allShownPicked
                  ? cur.filter((n) => !visible.some((c) => c.name === n))
                  : Array.from(new Set([...cur, ...visible.map((c) => c.name)])),
              )
            }
          >
            {allShownPicked ? `Unselect these ${visible.length}` : `Select all ${visible.length} shown`}
          </Button>
          {chosen.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setSelected([])}>
              Clear selection
            </Button>
          )}
        </div>
        <div className="grid max-h-72 gap-1 overflow-auto rounded-md border border-border p-2 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((c) => {
            const n = (index.get(c.name) || []).length;
            return (
              <label
                key={c.name}
                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/60"
              >
                <Checkbox checked={chosen.includes(c.name)} onCheckedChange={() => toggleCo(c.name)} />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{c.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {portcoDomainOf(c)} · {n} {n === 1 ? "person" : "people"}
                </span>
              </label>
            );
          })}
          {!visible.length && <p className="col-span-full py-4 text-center text-xs text-muted-foreground">No companies match.</p>}
        </div>
        {chosen.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {chosen.map((n) => (
              <span key={n} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]">
                <Building2 className="h-3 w-3 opacity-60" />
                {n}
                <button type="button" aria-label={`Remove ${n}`} className="text-muted-foreground hover:text-destructive" onClick={() => toggleCo(n)}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {chosen.length > 0 && (
        <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
          <FacetChips label="Who" options={ROLE_GROUPS} value={roles} onChange={(v) => setRoles(v as RoleGroup[])} counts={roleCounts} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-foreground">
              <b>{chosen.length}</b> {chosen.length === 1 ? "company" : "companies"} → <b>{ready.length}</b>{" "}
              {ready.length === 1 ? "person" : "people"} ready
              {already.length > 0 && <span className="text-muted-foreground"> · {already.length} already on the list</span>}
              {noEmail > 0 && <span className="text-muted-foreground"> · {noEmail} without an email</span>}
            </span>
            <Button size="sm" disabled={!ready.length || busy} onClick={() => { onAdd(ready, chosen); setExcluded(new Set()); }}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
              Add {ready.length} {ready.length === 1 ? "person" : "people"}
            </Button>
          </div>
          {empty.length > 0 && (
            <p className="text-[11px] text-muted-foreground">No people on record yet at: {empty.join(", ")}.</p>
          )}
          <p className="text-[11px] text-muted-foreground">Adding also tags this campaign with the selected companies.</p>
          <PeopleTable
            people={byRole.filter((p) => !skipKeys.has(personKeyOf(p)))}
            badge={(p) => roleGroupOf(p.title)}
            selectable={{
              isSelected: (p) => !excluded.has(personKeyOf(p)),
              toggle: (p) =>
                setExcluded((prev) => {
                  const n = new Set(prev);
                  const k = personKeyOf(p);
                  if (n.has(k)) n.delete(k);
                  else n.add(k);
                  return n;
                }),
            }}
          />
        </div>
      )}
    </div>
  );
}

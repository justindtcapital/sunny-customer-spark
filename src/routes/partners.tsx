import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ContactDetail } from "@/components/crm/ContactDetail";
import { fetchContacts } from "@/utils/sheets.functions";
import { ACTION_OWNERS, ownerMatches } from "@/lib/action-owners";
import type { Contact } from "@/lib/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ExternalLink, Handshake, Loader2, MapPin, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PARTNER_CATEGORIES, detectPartners, partnerLogoUrl, type Partner, type PartnerCategory } from "@/lib/partners";
import { personInText } from "@/lib/network-notes";
import { useWorkstreams } from "@/lib/use-workstreams";
import { isWorkstreamCompleted } from "@/lib/workstream-parse";
import { loadPartners } from "@/lib/use-partners";
import { addPartnerFn, fetchPartnerDetailFn, fetchPartnersFn } from "@/utils/partners.functions";

export const Route = createFileRoute("/partners")({
  head: () => ({
    meta: [
      { title: "Partners — VenturePulse" },
      { name: "description", content: "Dell, resellers and integrators, tech partners and vendors, with their contacts and tagged activity." },
      { property: "og:title", content: "Partners — VenturePulse" },
      { property: "og:description", content: "Dell, resellers and integrators, tech partners and vendors, with their contacts and tagged activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PartnersPage,
});

function PartnersPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["partners"], queryFn: () => fetchPartnersFn(), staleTime: 30_000 });
  const [cat, setCat] = useState<PartnerCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const partners = q.data?.partners || [];
  const counts = q.data?.counts || {};
  const acts = q.data?.activity || {};
  const { workstreams } = useWorkstreams();
  const wsCount = useMemo(() => {
    const out: Record<string, number> = {};
    for (const w of workstreams) {
      if (isWorkstreamCompleted(w)) continue;
      for (const n of detectPartners([w.name, w.dellTargets, w.dellStakeholders, w.nextSteps, w.channel, w.category].join(" "), partners)) out[n] = (out[n] || 0) + 1;
    }
    return out;
  }, [workstreams, partners]);
  const shown = useMemo(() => partners.filter((p) =>
    (cat === "all" || p.category === cat) && (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))), [partners, cat, search]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold text-foreground"><Handshake className="h-5 w-5 text-primary" />Partners</h1>
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1" />Add partner</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...PARTNER_CATEGORIES] as const).map((c) => (
          <Button key={c} size="sm" variant={cat === c ? "default" : "outline"} onClick={() => setCat(c)}>
            {c === "all" ? "All" : c}
            <span className="ml-1.5 text-xs opacity-70">{c === "all" ? partners.length : partners.filter((p) => p.category === c).length}</span>
          </Button>
        ))}
        <div className="relative ml-auto w-64">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-9 pl-7 text-sm" placeholder="Search partners" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(360px,440px)_1fr]">
      <div className="space-y-3 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto lg:pr-1">
      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading partners…</div>
      ) : q.isError ? (
        <p className="text-sm text-destructive">Couldn't load partners: {(q.error as Error).message}</p>
      ) : (
        PARTNER_CATEGORIES.filter((c) => cat === "all" || c === cat).map((c) => {
          const list = shown.filter((p) => p.category === c);
          if (!list.length) return null;
          return (
            <section key={c} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c}</h2>
              <div className="space-y-1">
                {list.map((p) => (
                  <button key={p.name} type="button" onClick={() => setOpen(p.name)}
                    className={cn("flex w-full items-center gap-2.5 rounded-md border bg-card px-2.5 py-1.5 text-left hover:border-primary/50",
                      open === p.name ? "border-primary bg-primary/5" : "border-border")}>
                    <PartnerLogo partner={p} size={26} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                    <span className="flex shrink-0 gap-3 text-right">
                      <MiniStat n={counts[p.name] || 0} label="Contacts" />
                      <MiniStat n={wsCount[p.name] || 0} label="Streams" />
                      <MiniStat n={acts[p.name] || 0} label="Activity" />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })
      )}
      </div>
      <div className="rounded-lg border border-border bg-card lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto">
        {open ? <PartnerPane name={open} /> : (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Select a partner to see its details.</div>
        )}
      </div>
      </div>
      <AddPartnerDialog open={adding} onOpenChange={setAdding} onAdded={async () => { await loadPartners(true); await qc.invalidateQueries({ queryKey: ["partners"] }); }} />
    </div>
  );
}

function PartnerLogo({ partner, size = 36 }: { partner: Pick<Partner, "name" | "website">; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = partnerLogoUrl(partner.website);
  return src && !failed ? (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background" style={{ width: size, height: size }}>
      <img src={src} alt={`${partner.name} logo`} className="h-3/5 w-3/5 object-contain" onError={() => setFailed(true)} />
    </span>
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary" style={{ width: size, height: size }}>{partner.name.slice(0, 2).toUpperCase()}</span>
  );
}

function MiniStat({ n, label }: { n: number; label: string }) {
  return (
    <span className="w-12">
      <span className={cn("block text-sm font-semibold leading-none", n === 0 && "text-muted-foreground")}>{n}</span>
      <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </span>
  );
}

function Stat({ n, label, active, onClick }: { n: number; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("rounded-md border px-3 py-2 text-left transition-colors hover:border-primary/60", active ? "border-primary bg-primary/5" : "border-border")}>
      <div className="text-2xl font-bold leading-none">{n}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
    </button>
  );
}

function Collapsible({ title, count, children, defaultOpen = true }: { title: string; count: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-border">
      <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left" onClick={() => setOpen(!open)}>
        <span className="text-sm font-semibold">{title}</span>
        <span className="flex items-center gap-2 text-2xl font-bold">{count}<ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} /></span>
      </button>
      {open && <div className="border-t border-border p-3">{children}</div>}
    </section>
  );
}

function PartnerPane({ name }: { name: string }) {
  const q = useQuery({ queryKey: ["partner", name], queryFn: () => fetchPartnerDetailFn({ data: { name } }) });
  const d = q.data;
  const net = d?.contacts.filter((c) => c.where === "Network").length || 0;
  const { workstreams } = useWorkstreams();
  const ws = useMemo(() => {
    if (!d?.partner) return [];
    const p = d.partner;
    return workstreams.filter((w) => detectPartners([w.name, w.dellTargets, w.dellStakeholders, w.nextSteps, w.channel, w.category].join(" "), [p]).length > 0);
  }, [workstreams, d?.partner]);
  const activeWs = ws.filter((w) => !isWorkstreamCompleted(w)).length;
  const [view, setView] = useState<"contacts" | "workstreams" | "notes" | "emails">("contacts");
  const [onlyWithWs, setOnlyWithWs] = useState(false);
  const contactRows = useMemo(() => (d?.contacts || []).map((c) => {
    const linked = workstreams.filter((w) => w.dellStakeholders && personInText({ name: c.name, email: c.email }, w.dellStakeholders));
    return { c, linked, active: linked.filter((w) => !isWorkstreamCompleted(w)).length };
  }), [workstreams, d?.contacts]);
  const withActive = useMemo(() => contactRows.filter((r) => r.active > 0), [contactRows]);
  const shownContacts = onlyWithWs ? withActive : contactRows;
  const contactsQ = useQuery({ queryKey: ["campaign-contacts"], queryFn: () => fetchContacts(), staleTime: 60_000 });
  const [openContact, setOpenContact] = useState<Contact | null>(null);
  const openNetwork = (email: string, cname: string) => {
    const all = contactsQ.data || [];
    const c = all.find((x) => email && x.email?.toLowerCase() === email.toLowerCase()) || all.find((x) => x.name === cname);
    if (c) setOpenContact(c);
    else toast.info("Still loading contacts — try again in a moment.");
  };
  return (
    <div className="p-4">
        <div className="flex items-center gap-3">
          {d?.partner ? <PartnerLogo partner={d.partner} size={44} /> : null}
          <h2 className="text-lg font-semibold">{name}</h2>
        </div>
        {q.isLoading || !d ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{d.partner?.category}</Badge>
              {d.partner?.website && <a href={d.partner.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Website <ExternalLink className="h-3 w-3" /></a>}
            </div>
            {d.partner?.location && <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{d.partner.location}</p>}
            {d.partner?.summary ? <p className="text-sm">{d.partner.summary}</p> : <p className="text-xs text-muted-foreground">No summary yet{d.partner?.website ? "" : " — add a website to generate one"}.</p>}
            {d.partner?.notes && <p className="text-sm text-muted-foreground">{d.partner.notes}</p>}
            <div className="grid grid-cols-4 gap-2">
              <Stat n={d.contacts.length} label="Contacts" active={view === "contacts"} onClick={() => setView("contacts")} />
              <Stat n={activeWs} label="Active workstreams" active={view === "workstreams"} onClick={() => setView("workstreams")} />
              <Stat n={d.activity.filter((a) => a.source === "Note").length} label="Notes" active={view === "notes"} onClick={() => setView("notes")} />
              <Stat n={d.activity.filter((a) => a.source === "Email").length} label="BD/GTM emails" active={view === "emails"} onClick={() => setView("emails")} />
            </div>
            {view === "contacts" && <Collapsible title="Key contacts" count={shownContacts.length}>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => setOnlyWithWs(false)}
                  className={cn("rounded-full border px-2.5 py-1 text-[11px] transition-colors", !onlyWithWs ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground hover:border-primary/50")}>
                  All contacts ({contactRows.length})
                </button>
                <button type="button" onClick={() => setOnlyWithWs(true)}
                  className={cn("rounded-full border px-2.5 py-1 text-[11px] transition-colors", onlyWithWs ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground hover:border-primary/50")}>
                  Only with active workstreams ({withActive.length})
                </button>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">{net} in Network · {d.contacts.length - net} in Prospecting. They stay on those pages too.</p>
              {shownContacts.length === 0 ? <p className="text-xs text-muted-foreground">{contactRows.length === 0 ? `No contacts at ${name} yet. They'll show up here as soon as one is uploaded or added.` : `No contact at ${name} sits on an active workstream yet.`}</p> : (
                <ul className="divide-y divide-border">
                  {shownContacts.map(({ c, linked }) => (
                    <li key={`${c.where}:${c.email || c.name}`} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                      <span className="flex-1 truncate">
                        {c.where === "Network" ? (
                          <button type="button" className="font-medium text-primary hover:underline" onClick={() => openNetwork(c.email, c.name)}>{c.name || c.email}</button>
                        ) : (
                          <Link to="/targeting" search={{ target: c.email || `${c.name.toLowerCase()}|${c.company.toLowerCase()}` }} className="font-medium text-primary hover:underline">{c.name || c.email}</Link>
                        )}
                        {c.title && <span className="text-muted-foreground">, {c.title}</span>}
                        {c.email && <span className="text-xs text-muted-foreground">, {c.email}</span>}
                      </span>
                      <Badge variant="outline" className="text-[10px]">{c.where}</Badge>
                      {linked.length > 0 && (
                        <div className="basis-full flex flex-wrap gap-1 pl-1">
                          {linked.map((w) => (
                            <Link key={w.gid} to="/my-actions" search={{ tab: "actions", ws: w.gid, owner: ACTION_OWNERS.find((o) => ownerMatches(w.owner, o.name))?.name }} className="rounded border border-border px-1.5 py-0.5 text-[10px] text-primary hover:underline">{w.company} · {w.name || w.rawName}</Link>
                          ))}
                        </div>)}
                    </li>
                  ))}
                </ul>
              )}
            </Collapsible>}
            {view === "workstreams" && <Collapsible title="Workstreams" count={ws.length}>
              {ws.length === 0 ? <p className="text-xs text-muted-foreground">No PortCo workstreams mention {name} yet.</p> : (
                <ul className="divide-y divide-border">
                  {ws.map((w) => (
                    <li key={w.gid} className="py-1.5 text-sm">
                      <Link to="/my-actions" search={{ tab: "actions", ws: w.gid, owner: ACTION_OWNERS.find((o) => ownerMatches(w.owner, o.name))?.name }}
                        className="block truncate font-medium text-primary hover:underline" title="Open in My Actions">{w.name}</Link>
                      <div className="mt-0.5 flex justify-end gap-1.5">
                        <Badge variant="outline" className="text-[10px]">{w.company}</Badge>
                        <Badge variant="outline" className="text-[10px]">{w.segment}</Badge>
                        {w.workstreamStatus && <Badge variant="secondary" className="text-[10px]">{isWorkstreamCompleted(w) ? "Completed" : w.workstreamStatus}</Badge>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Collapsible>}
            {(view === "notes" || view === "emails") && <Collapsible title={view === "notes" ? "Notes" : "BD / GTM emails"} count={d.activity.filter((a) => a.source === (view === "notes" ? "Note" : "Email")).length}>
              {d.activity.filter((a) => a.source === (view === "notes" ? "Note" : "Email")).length === 0 ? <p className="text-xs text-muted-foreground">Nothing tagged yet. Tag {name} when reviewing notes or activity in My Actions.</p> : (
                <ul className="space-y-2">
                  {d.activity.filter((a) => a.source === (view === "notes" ? "Note" : "Email")).map((a) => (
                    <li key={a.recordId} className="rounded-md bg-muted/30 p-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{a.date.slice(0, 10)}</span>
                        <span className="flex-1 truncate font-medium">{a.title}</span>
                        <Badge variant="outline" className="text-[10px]">{a.track}</Badge>
                        {a.url && <a href={a.url} target="_blank" rel="noreferrer" aria-label="Open source"><ExternalLink className="h-3.5 w-3.5 text-primary" /></a>}
                      </div>
                      {a.summary && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.summary}</p>}
                      {a.nextSteps.length > 0 && <ul className="mt-1 list-disc pl-4 text-xs">{a.nextSteps.slice(0, 4).map((s, i) => <li key={i}>{s}</li>)}</ul>}
                    </li>
                  ))}
                </ul>
              )}
            </Collapsible>}
          </div>
        )}
      <ContactDetail contact={openContact} open={!!openContact} onOpenChange={(o) => !o && setOpenContact(null)} onContactUpdate={setOpenContact} />
    </div>
  );
}

function AddPartnerDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PartnerCategory>("Resellers & Integrators");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await addPartnerFn({ data: { name, category, website, notes } });
      toast.success(`${name.trim()} added to Partners.`);
      await onAdded();
      setName(""); setWebsite(""); setNotes(""); onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add partner</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} />
          <Select value={category} onValueChange={(v) => setCategory(v as PartnerCategory)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PARTNER_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Website (optional)" value={website} onChange={(e) => setWebsite(e.target.value)} />
          <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || !name.trim()} onClick={save}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

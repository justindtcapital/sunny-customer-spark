// Dell Stakeholders cell: names link to saved Network people. Click to open a
// panel where each stakeholder can be opened, edited, re-picked or removed, and
// new ones found (Dell people ranked first) or added as new Dell contacts.
import { useMemo, useState } from "react";
import { ExternalLink, Loader2, Pencil, Plus, Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PeopleFinder } from "@/components/knowledge/PeopleFinder";
import { updatePersonFn } from "@/utils/knowledge.functions";
import { addContact } from "@/utils/sheets.functions";
import type { Contact } from "@/lib/types";
import { isDellContact } from "@/lib/dell-contacts";
import { addStakeholder, removeStakeholder, replaceStakeholder, resolveStakeholders, type StakeholderLink } from "@/lib/workstream-stakeholders";
import { cn } from "@/lib/utils";

const DELL_HINTS = ["Dell Technologies", "dell.com"];
type Finder = { mode: "add" } | { mode: "replace"; index: number; query: string };
type Draft = { name: string; title: string; company: string; email: string };

const isDell = (c: Contact) => isDellContact({ company: c.company, email: c.email, contactType: c.contactType || "" });

export function StakeholdersCell({ value, contacts, onSave, onContactsChanged }: {
  value: string;
  contacts: Contact[];
  onSave: (next: string) => Promise<boolean>;
  onContactsChanged: () => Promise<void> | void;
}) {
  const links = useMemo(() => resolveStakeholders(value, contacts), [value, contacts]);
  const [open, setOpen] = useState(false);
  const [finder, setFinder] = useState<Finder | null>(null);
  const [editing, setEditing] = useState<{ index: number; urid: string; before: Contact } | null>(null);
  const [creating, setCreating] = useState<{ index: number | null } | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", title: "", company: "", email: "" });
  const [busy, setBusy] = useState(false);

  const save = async (next: string) => {
    setBusy(true);
    try { return await onSave(next); } finally { setBusy(false); }
  };

  const pick = async (name: string) => {
    if (!finder) return;
    const next = finder.mode === "add" ? addStakeholder(value, name) : replaceStakeholder(value, finder.index, name);
    if (await save(next)) setFinder(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { before, urid, index } = editing;
    const changed: Partial<Draft> = {};
    if (draft.name.trim() !== before.name) changed.name = draft.name;
    if (draft.title.trim() !== (before.title || "")) changed.title = draft.title;
    if (draft.company.trim() !== before.company) changed.company = draft.company;
    if (draft.email.trim().toLowerCase() !== (before.email || "").toLowerCase()) changed.email = draft.email;
    setBusy(true);
    try {
      if (Object.keys(changed).length) {
        await updatePersonFn({ data: { urid, ...changed } });
        // A renamed person keeps their place on the workstream.
        if (changed.name) await onSave(replaceStakeholder(value, index, draft.name.trim()));
        await onContactsChanged();
        toast.success(`Saved ${draft.name.trim() || before.name}.`);
      }
      setEditing(null);
    } catch (e) {
      toast.error((e as Error).message || "Couldn't save that change.");
    } finally { setBusy(false); }
  };

  const createDell = async () => {
    if (!creating || !draft.name.trim()) return;
    setBusy(true);
    try {
      await addContact({ data: { name: draft.name.trim(), role: draft.title.trim(), company: draft.company.trim() || "Dell Technologies", email: draft.email.trim(), phone: "", location: "", prime: "", sector: "", temperature: "Cold", source: "Manual Entry", skipPortfolioSector: true } });
      const next = creating.index === null ? addStakeholder(value, draft.name.trim()) : replaceStakeholder(value, creating.index, draft.name.trim());
      await onSave(next);
      await onContactsChanged();
      toast.success(`${draft.name.trim()} added to the Network as a Dell contact.`);
      setCreating(null); setFinder(null);
    } catch (e) {
      toast.error((e as Error).message || "Couldn't add that person.");
    } finally { setBusy(false); }
  };

  const startEdit = (index: number, c: Contact) => {
    if (!c.urid) { toast.error("This person has no record ID yet — edit them from the Network page."); return; }
    setCreating(null); setFinder(null);
    setEditing({ index, urid: c.urid, before: c });
    setDraft({ name: c.name, title: c.title || "", company: c.company || "", email: c.email || "" });
  };
  const startCreate = (index: number | null, name: string) => {
    setEditing(null);
    setCreating({ index });
    setDraft({ name, title: "", company: "Dell Technologies", email: "" });
  };

  const draftForm = (onSubmit: () => void, label: string) => (
    <div className="space-y-1.5 rounded-md border border-border bg-muted/40 p-2">
      <div className="grid grid-cols-2 gap-1.5">
        {(["name", "title", "company", "email"] as const).map((f) => (
          <Input key={f} className="h-7 text-xs" aria-label={f} placeholder={f[0]!.toUpperCase() + f.slice(1)}
            value={draft[f]} onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))} />
        ))}
      </div>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditing(null); setCreating(null); }}>Cancel</Button>
        <Button size="sm" className="h-7 text-xs" disabled={busy || !draft.name.trim()} onClick={onSubmit}>{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : label}</Button>
      </div>
    </div>
  );

  const personLine = (c: Contact) => [c.title, c.company].filter(Boolean).join(" · ") || c.email || "—";

  const row = (l: StakeholderLink, i: number) => {
    const contact = l.status === "linked" ? l.contact : null;
    return (
      <li key={`${l.name}-${i}`} className="space-y-1.5">
        <div className="flex items-start gap-1.5 rounded px-1.5 py-1 hover:bg-muted/60">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-medium">{contact?.name || l.name}</span>
              {contact && <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">{isDell(contact) ? "Dell" : contact.kind || "Network"}</Badge>}
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {contact ? personLine(contact)
                : l.status === "ambiguous" ? `${l.candidates.length} saved people share this name — pick the right one`
                : "Not linked to anyone in the Network"}
            </p>
            {l.status === "ambiguous" && (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {l.candidates.map((c) => c.email ? (
                  <a key={c.urid || c.id} href={`/crm?contact=${encodeURIComponent(c.email)}`} target="_blank" rel="noreferrer" className="text-[10px] text-primary underline-offset-2 hover:underline">{personLine(c)}</a>
                ) : null)}
              </div>
            )}
          </div>
          {contact?.email && (
            <Button asChild size="icon" variant="ghost" className="h-6 w-6 shrink-0">
              <a href={`/crm?contact=${encodeURIComponent(contact.email)}`} target="_blank" rel="noreferrer" aria-label={`Open ${contact.name}`} title="Open in Network"><ExternalLink className="h-3 w-3" /></a>
            </Button>
          )}
          {contact ? (
            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" aria-label={`Edit ${contact.name}`} title="Edit person" onClick={() => startEdit(i, contact)}><Pencil className="h-3 w-3" /></Button>
          ) : (
            <Button size="sm" variant="outline" className="h-6 shrink-0 px-1.5 text-[10px]" onClick={() => { setEditing(null); setCreating(null); setFinder({ mode: "replace", index: i, query: l.name }); }}>
              <Search className="mr-1 h-3 w-3" />Find
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" aria-label={`Remove ${l.name}`} title="Remove from workstream" disabled={busy}
            onClick={() => void save(removeStakeholder(value, i))}><X className="h-3 w-3" /></Button>
        </div>
        {editing?.index === i && draftForm(() => void saveEdit(), "Save")}
        {finder?.mode === "replace" && finder.index === i && !creating && (
          <PeopleFinder initialQuery={finder.query} heard={l.name} hints={DELL_HINTS} allowNoEmail onPick={(m) => void pick(m.name)}
            onAddNew={(q) => startCreate(i, q)} onClose={() => setFinder(null)} />
        )}
        {creating?.index === i && draftForm(() => void createDell(), "Add Dell contact")}
      </li>
    );
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setFinder(null); setEditing(null); setCreating(null); } }}>
      <PopoverTrigger asChild>
        <button type="button" className="flex w-full items-center gap-1 overflow-hidden px-2 py-1.5 text-left text-xs hover:bg-accent/40" title={value || "Add Dell stakeholders"}>
          {links.length === 0 && <span className="min-h-4">{"\u00a0"}</span>}
          {links.map((l, i) => (
            <span key={`${l.name}-${i}`} className={cn("shrink-0 truncate rounded-full border px-1.5 py-px text-[11px]",
              l.status === "linked" ? "border-border bg-secondary/60 text-foreground" : "border-dashed border-muted-foreground/50 text-muted-foreground")}>
              {l.status === "linked" ? l.contact.name : l.name}
            </span>
          ))}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="max-h-[min(32rem,var(--radix-popover-content-available-height))] w-[26rem] max-w-[92vw] space-y-2 overflow-y-auto p-2"
        // Merge and other dialogs opened from the finder sit outside this panel; keep it open behind them.
        onInteractOutside={(e) => { const t = e.target as HTMLElement | null; if (t?.closest?.("[role='dialog'],[role='alertdialog'],[data-sonner-toaster]")) e.preventDefault(); }}>
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold text-muted-foreground">Dell stakeholders</p>
          {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        {links.length > 0 ? <ul className="max-h-80 space-y-1 overflow-y-auto">{links.map(row)}</ul>
          : <p className="px-1 text-[11px] text-muted-foreground">No stakeholders yet.</p>}
        {finder?.mode === "add" && !creating ? (
          <PeopleFinder initialQuery="" hints={DELL_HINTS} allowNoEmail onPick={(m) => void pick(m.name)}
            onAddNew={(q) => startCreate(null, q)} onClose={() => setFinder(null)} />
        ) : creating?.index === null ? draftForm(() => void createDell(), "Add Dell contact") : (
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditing(null); setFinder({ mode: "add" }); }}><Plus className="mr-1 h-3 w-3" />Add stakeholder</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => startCreate(null, "")}><UserPlus className="mr-1 h-3 w-3" />New Dell contact</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

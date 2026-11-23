// Inline people finder for review cards: opens right under the name being
// matched, ranks saved people (meeting companies first), flags records that
// look like the same person with a "Review & merge" button, and lets the
// reviewer fix a saved person's details without leaving the card.

import { useEffect, useMemo, useState } from "react";
import { Combine, Loader2, Pencil, Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchPeopleFn, updatePersonFn } from "@/utils/knowledge.functions";
import type { PersonMatch } from "@/utils/notes-inbox.server";
import { duplicateClusters } from "@/lib/people-finder";
import { emailIdentities } from "@/lib/import-dedupe";
import { personNameKey } from "@/lib/contact-identity";
import { MAX_MERGE } from "@/lib/contact-merge";
import { MergeContactsDialog } from "@/components/crm/MergeContactsDialog";

type Draft = { name: string; title: string; company: string; email: string };

export function PeopleFinder({ initialQuery, heard, hints, onPick, onAddNew, onClose }: {
  initialQuery: string;
  /** The name as heard in the note, shown as context. */
  heard?: string;
  /** Companies / email domains from this note, used to rank people higher. */
  hints: string[];
  onPick: (m: PersonMatch) => void;
  onAddNew?: (query: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<PersonMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [merge, setMerge] = useState<string[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", title: "", company: "", email: "" });
  const [saving, setSaving] = useState(false);
  const hintKey = hints.join("|");

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); setLoading(false); return; }
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      void searchPeopleFn({ data: { q: query, hints } })
        .then((r) => { if (live) setResults(r); })
        .catch(() => { if (live) setResults([]); })
        .finally(() => { if (live) setLoading(false); });
    }, 200);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, hintKey, refresh]);

  const clusters = useMemo(() => duplicateClusters(results), [results]);
  const inCluster = useMemo(() => new Set(clusters.flatMap((c) => c.people.map((p) => p.urid || ""))), [clusters]);
  const query = q.trim().toLowerCase();
  const exactHit = results.find((m) => m.where !== "Team" && (emailIdentities(m.email).includes(query) || personNameKey(m.name) === personNameKey(q)));

  async function saveEdit(urid: string, before: PersonMatch) {
    setSaving(true);
    try {
      const changed: Partial<Draft> = {};
      if (draft.name.trim() !== before.name) changed.name = draft.name;
      if (draft.title.trim() !== (before.title || "")) changed.title = draft.title;
      if (draft.company.trim() !== before.company) changed.company = draft.company;
      if (draft.email.trim().toLowerCase() !== before.email) changed.email = draft.email;
      if (Object.keys(changed).length) {
        await updatePersonFn({ data: { urid, ...changed } });
        toast.success(`Saved ${draft.name.trim() || before.name}.`);
      }
      setEditing(null);
      setRefresh((n) => n + 1);
    } catch (e) {
      toast.error((e as Error).message || "Couldn't save that change.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-1.5 space-y-2 rounded-md border border-border bg-muted/40 p-2 animate-in fade-in slide-in-from-top-1">
      <div className="flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input autoFocus className="h-7 flex-1 text-xs" aria-label="Find a person" placeholder="Name, email or company"
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }} />
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Searching" />}
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose} aria-label="Close finder"><X className="h-3.5 w-3.5" /></Button>
      </div>
      {heard && <p className="text-[11px] text-muted-foreground">Heard in this note as “{heard}”. Pick the right person, or fix the search.</p>}

      {clusters.map((c) => (
        <div key={c.people.map((p) => p.urid).join("|")} className="flex flex-wrap items-center gap-2 rounded border border-warning/50 bg-warning/10 px-2 py-1.5 text-[11px]">
          <Combine className="h-3.5 w-3.5 text-warning" />
          <span className="flex-1">{c.people.length} records look like the same person — {c.people[0]?.name} ({c.reason.toLowerCase()}).</span>
          <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setMerge(c.people.slice(0, MAX_MERGE).map((p) => p.urid!))}>Review &amp; merge</Button>
        </div>
      ))}

      {results.length > 0 && (
        <ul className="max-h-72 space-y-0.5 overflow-y-auto" aria-label="People found">
          {results.map((m) => {
            const key = `${m.where}:${m.urid || m.email || m.name}`;
            const isEditing = !!m.urid && editing === m.urid;
            return (
              <li key={key} className={cn("rounded", inCluster.has(m.urid || "") && "bg-warning/5")}>
                <div className="flex items-center gap-1">
                  <button type="button" disabled={!m.email}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                    onClick={() => onPick(m)} title={m.email ? `Use ${m.name}` : "No email saved — edit to add one"}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.name || m.email}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {[m.title, m.company].filter(Boolean).join(" · ") || "—"}{m.email && ` · ${m.email}`}
                      </span>
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">{m.email ? m.where : "No email"}</Badge>
                  </button>
                  {m.urid && m.where !== "Team" && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={`Edit ${m.name}`}
                      onClick={() => { setEditing(isEditing ? null : m.urid!); setDraft({ name: m.name, title: m.title || "", company: m.company, email: m.email }); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {isEditing && (
                  <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
                    {(["name", "title", "company", "email"] as const).map((f) => (
                      <Input key={f} className="h-7 w-40 text-xs" aria-label={f} placeholder={f[0]!.toUpperCase() + f.slice(1)}
                        value={draft[f]} onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))} />
                    ))}
                    <Button size="sm" className="h-7" disabled={saving || !draft.name.trim()} onClick={() => void saveEdit(m.urid!, m)}>
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {q.trim().length >= 2 && !loading && results.length === 0 && <p className="px-1 text-[11px] text-muted-foreground">No one saved matches “{q.trim()}”.</p>}

      {onAddNew && q.trim().length >= 2 && !loading && (
        exactHit
          ? <p className="px-1 text-[11px] text-muted-foreground">{exactHit.email ? `${exactHit.name} is already saved — pick them above instead of adding a copy.` : `${exactHit.name} is saved without an email — use the pencil to add one, then pick them.`}</p>
          : <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAddNew(q.trim())}><UserPlus className="mr-1 h-3 w-3" /> Not listed — add as a new contact</Button>
      )}

      {merge && (
        <MergeContactsDialog open urids={merge} onOpenChange={(o) => { if (!o) setMerge(null); }}
          onMerged={() => setRefresh((n) => n + 1)} />
      )}
    </div>
  );
}

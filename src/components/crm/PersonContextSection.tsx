// Recent notes & conversations + connected workstreams for one person.
// Shared by the Network contact panel and the Prospecting drawer.

import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ExternalLink, Loader2, MessageSquare, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fetchPersonContextFn } from "@/utils/knowledge.functions";
import type { PersonContextItem } from "@/utils/notes-inbox.server";
import { useWorkstreams } from "@/lib/use-workstreams";
import { personInText } from "@/lib/network-notes";

const cache = new Map<string, PersonContextItem[]>();

export function PersonContextSection({ name, email }: { name: string; email: string }) {
  const key = `${(email || "").toLowerCase()}|${(name || "").toLowerCase()}`;
  const [items, setItems] = useState<PersonContextItem[] | null>(cache.get(key) ?? null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (cache.has(key)) { setItems(cache.get(key)!); return; }
    let live = true;
    setItems(null);
    fetchPersonContextFn({ data: { name, email } })
      .then((r) => { cache.set(key, r); if (live) setItems(r); })
      .catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [key, name, email]);

  const { workstreams: allWorkstreams } = useWorkstreams();
  const workstreams = useMemo(() => {
    const m = new Map<string, { name: string; portco: string; status: string; last: string; stakeholder?: boolean }>();
    for (const i of items || []) {
      if (!i.workstream) continue;
      const k = `${i.portco}::${i.workstream}`;
      if (!m.has(k)) m.set(k, { name: i.workstream, portco: i.portco, status: i.workstreamStatus, last: i.date });
    }
    // Workstreams where this person is listed under Stakeholders & contacts.
    for (const w of allWorkstreams) {
      if (!w.dellStakeholders || !personInText({ name, email }, w.dellStakeholders)) continue;
      const k = `${w.company}::${w.name || w.rawName}`;
      const existing = m.get(k);
      if (existing) existing.stakeholder = true;
      else m.set(k, { name: w.name || w.rawName, portco: w.company, status: w.workstreamStatus, last: w.lastActivity || "", stakeholder: true });
    }
    return [...m.values()];
  }, [items, allWorkstreams, name, email]);

  const shown = showAll ? items || [] : (items || []).slice(0, 3);
  const nwk = (items || []).filter((i) => i.track === "Network").length;

  return (
    <section className="border-b border-border pb-6 space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <MessageSquare className="h-3 w-3" /> Recent Notes & Conversations
          </h3>
          {items && items.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{items.length} total{nwk ? ` · ${nwk} NWK` : ""}</span>
          )}
        </div>
        {items === null ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading notes…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No meeting notes or tracked emails mention this person yet. Tag them while reviewing on the Dashboard.</p>
        ) : (
          <div className="space-y-2">
            {shown.map((i) => (
              <div key={i.recordId} className="rounded border border-border bg-muted/30 px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-muted-foreground">{i.date}</span>
                  <Badge variant="outline" className="h-4 px-1 text-[9px]">{i.source}</Badge>
                  <Badge variant={i.track === "Network" ? "secondary" : "outline"} className="h-4 px-1 text-[9px]">{i.track === "Network" ? "NWK" : i.track}</Badge>
                  {!i.reviewed && <span className="text-[9px] text-muted-foreground">awaiting review</span>}
                  {i.sourceUrl && (
                    <a href={i.sourceUrl} target="_blank" rel="noreferrer" className="ml-auto text-primary" aria-label="Open source"><ExternalLink className="h-3 w-3" /></a>
                  )}
                </div>
                <div className="mt-0.5 text-xs font-medium">{i.title}</div>
                {i.summary && <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{i.summary}</p>}
                {i.portco && <div className="mt-1 text-[10px] text-muted-foreground">{i.portco}</div>}
              </div>
            ))}
            {items.length > 3 && (
              <button type="button" className="flex items-center gap-1 text-xs text-primary" onClick={() => setShowAll((s) => !s)}>
                <ChevronDown className={cn("h-3 w-3 transition-transform", showAll && "rotate-180")} />
                {showAll ? "Show fewer" : `Show all ${items.length}`}
              </button>
            )}
          </div>
        )}
      </div>

      {workstreams.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <Workflow className="h-3 w-3" /> Connected Workstreams · {workstreams.length}
          </h3>
          <div className="space-y-1.5">
            {workstreams.map((w) => (
              <div key={`${w.portco}:${w.name}`} className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{w.name}</div>
                  <div className="text-[10px] text-muted-foreground">{w.portco || "No PortCo"} · last mention {w.last}</div>
                </div>
                {w.status && <Badge variant="outline" className="text-[9px]">{w.status === "create-new" ? "New" : w.status}</Badge>}
                <Link to="/dashboard" search={{ section: "workstreams" }} className="text-[11px] text-primary hover:underline">Open</Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

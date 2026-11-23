import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignalCard } from "@/components/signals/SignalCard";
import type { DraftTarget } from "@/components/signals/SignalSuggestions";
import { SignalRadar } from "@/components/signals/SignalRadar";
import { matchesRadar, radarKeys } from "@/lib/signal-radar";
import { AddSignalDialog } from "@/components/signals/AddSignalDialog";
import { BroadcastDialog } from "@/components/crm/BroadcastDialog";
import { EmailDraftDialog } from "@/components/crm/EmailDraftDialog";
import { filterSignals, validateSignalsSearch, type SignalsSearch } from "@/lib/signals-page";
import type { FeedCard } from "@/lib/signal-feed";
import type { Contact } from "@/lib/types";
import type { ScoredTarget } from "@/utils/broadcast.functions";
import { fetchSignalsFeed } from "@/utils/signals.functions";

const TITLE = "Signals — Venture Pulse";
const DESCRIPTION = "PortCo and industry news, blogs and reports in one feed, with filters and one-click broadcast to LinkedIn, contacts or news@.";

export const Route = createFileRoute("/signals")({
  validateSearch: (search: Record<string, unknown>): SignalsSearch => validateSignalsSearch(search),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignalsPage,
});

const PAGE = 40;

function SignalsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const feed = useQuery({ queryKey: ["signals-feed"], queryFn: () => fetchSignalsFeed(), staleTime: 60_000 });

  const [query, setQuery] = useState(search.q || "");
  const [shown, setShown] = useState(PAGE);
  const [expanded, setExpanded] = useState<string | null>(search.open ? `s:${search.open}` : null);
  const [addOpen, setAddOpen] = useState(false);
  const [broadcastCard, setBroadcastCard] = useState<FeedCard | null>(null);
  const [draftContact, setDraftContact] = useState<Contact | null>(null);
  const [draftSeed, setDraftSeed] = useState({ purpose: "", notes: "" });

  const patch = (p: Partial<SignalsSearch>) => {
    setShown(PAGE);
    navigate({ search: (prev) => ({ ...prev, ...p }), replace: true });
  };

  // Debounce the search box into the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.q || "") !== query.trim()) patch({ q: query.trim() || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const cards = feed.data?.cards ?? [];
  const keyOf = (c: FeedCard) => (c.storedId ? `s:${c.storedId}` : c.id);
  const keys = useMemo(() => radarKeys(feed.data?.portcos ?? [], feed.data?.watch ?? []), [feed.data]);
  const filtered = useMemo(() => {
    const list = filterSignals(cards, search).filter((c) => (search.open && c.storedId === search.open) || matchesRadar(c, search, keys));
    // A deep-linked signal is pinned to the top.
    if (!search.open) return list;
    const i = list.findIndex((c) => c.storedId === search.open);
    return i > 0 ? [list[i], ...list.slice(0, i), ...list.slice(i + 1)] : list;
  }, [cards, search, keys]);
  // Radar counts follow every filter except the radar selection itself.
  const forRadar = useMemo(() => filterSignals(cards, { ...search, open: undefined }), [cards, search]);

  // Open + scroll to a deep-linked signal once the feed arrives.
  const scrolled = useRef<string | null>(null);
  useEffect(() => {
    if (!search.open || !feed.data || scrolled.current === search.open) return;
    scrolled.current = search.open;
    setExpanded(`s:${search.open}`);
    requestAnimationFrame(() => document.getElementById(`signal-${search.open}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [search.open, feed.data]);

  const emailTarget = (t: ScoredTarget) => {
    const card = broadcastCard;
    setDraftContact({
      id: `signal-${t.email}`, name: t.name, title: t.title, company: t.company, email: t.email,
      phone: "", address: "", prime: "", sector: "", areasOfInterest: [], temperature: "Warm",
      portCoIntros: [], eventsAttended: [], eventsInvited: [], interactions: [],
    });
    setDraftSeed({
      purpose: card ? `${card.company}: ${card.headline}${t.reason ? ` — ${t.reason}` : ""}` : "",
      notes: card?.sourceUrl && !card.sourceIsSearch ? `Reference: ${card.sourceUrl}` : "",
    });
  };

  // "V.I.C. suggests" → the same reviewed email draft dialog, seeded with V.I.C.'s reason.
  const draftFor = (t: DraftTarget) => {
    setDraftContact({
      id: `signal-${t.email || t.name}`, name: t.name, title: t.title, company: t.company, email: t.email,
      phone: "", address: "", prime: "", sector: "", areasOfInterest: [], temperature: "Warm",
      portCoIntros: [], eventsAttended: [], eventsInvited: [], interactions: [],
    });
    setDraftSeed({ purpose: t.purpose, notes: t.notes });
  };

  return (
    <div className="w-full min-w-0 p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-primary" />
          <h1 className="font-display text-2xl font-semibold text-foreground">Signals</h1>
        </div>
        {feed.data && (
          <span className="text-sm text-muted-foreground">
            {filtered.length} of {feed.data.total}{feed.data.truncated ? ` (newest ${feed.data.cards.length} loaded)` : ""}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add a signal</Button>
        </div>
      </div>

      <SignalRadar cards={forRadar} keys={keys} search={search} onChange={patch} query={query} onQuery={setQuery} portcos={feed.data?.portcos ?? []} />

      <div>

        <main className="min-w-0 space-y-2">
          {feed.isLoading && (
            <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading signals…</p>
          )}
          {feed.isError && (
            <div className="rounded-xl border border-border bg-card p-4 text-sm">
              <p className="flex items-center gap-2 font-medium text-foreground"><AlertTriangle className="h-4 w-4 text-destructive" /> Signals are unavailable right now.</p>
              <p className="mt-1 text-muted-foreground">{feed.error instanceof Error ? feed.error.message : "Please try again in a minute."}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => feed.refetch()}>Try again</Button>
            </div>
          )}
          {feed.data && filtered.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No signals match these filters. Try a longer date range or clear the filters.
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 [&>div>*]:h-full">
          {filtered.slice(0, shown).map((c) => (
            <div key={keyOf(c)} className={expanded === keyOf(c) ? "lg:col-span-2" : undefined}>
            <SignalCard
              key={keyOf(c)}
              card={c}
              expanded={expanded === keyOf(c)}
              onToggle={() => setExpanded((e) => (e === keyOf(c) ? null : keyOf(c)))}
              onBroadcast={() => setBroadcastCard(c)}
              onDraft={draftFor}
            />
            </div>
          ))}
          </div>
          {filtered.length > shown && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>Show more ({filtered.length - shown} left)</Button>
            </div>
          )}
        </main>
      </div>


      <AddSignalDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        portcos={feed.data?.portcos ?? []}
        onSaved={async (id) => {
          scrolled.current = null;
          await qc.invalidateQueries({ queryKey: ["signals-feed"] });
          navigate({ search: (prev) => ({ ...prev, open: id }), replace: true });
        }}
      />
      <BroadcastDialog open={!!broadcastCard} onOpenChange={(o) => !o && setBroadcastCard(null)} card={broadcastCard} onEmailTarget={emailTarget} />
      <EmailDraftDialog
        open={!!draftContact}
        onOpenChange={(o) => !o && setDraftContact(null)}
        contact={draftContact}
        initialPurpose={draftSeed.purpose}
        initialNotes={draftSeed.notes}
      />
    </div>
  );
}

import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, CalendarPlus, Check, ChevronRight, Loader2, Mail, MessageSquare, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VicMark } from "@/components/vic/VicMark";
import { useAuth } from "@/lib/auth-context";
import { canonicalOwnerName } from "@/lib/user-ownership";
import { createVicThread } from "@/lib/vic-client";
import { defaultFollowUpDate, signalTopic, type PersonSuggestion, type PortcoSuggestion } from "@/lib/signal-match";
import { readableSummary } from "@/lib/signals-page";
import type { FeedCard } from "@/lib/signal-feed";
import { suggestSignalMatchesFn } from "@/utils/signals.functions";
import { createVicFollowUpFn } from "@/utils/vic.functions";

export interface DraftTarget { name: string; title: string; company: string; email: string; purpose: string; notes: string }

interface FollowUpSeed { key: string; title: string; portco: string; person: string; details: string }

const sourceNote = (card: FeedCard) => (card.sourceUrl && !card.sourceIsSearch ? `Reference: ${card.sourceUrl}` : "");

export function SignalSuggestions({ card, onDraft }: { card: FeedCard; onDraft: (t: DraftTarget) => void }) {
  const suggest = useServerFn(suggestSignalMatchesFn);
  const signalKey = card.storedId || card.id;
  const q = useQuery({
    queryKey: ["signal-matches", signalKey],
    queryFn: () => suggest({ data: { company: card.company, headline: card.headline, summary: card.summary, body: card.body, sourceType: card.sourceType, sourceUrl: card.sourceIsSearch ? "" : card.sourceUrl || "" } }),
    enabled: false, // runs only when someone asks — opening a card costs nothing
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [followUp, setFollowUp] = useState<FollowUpSeed | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [asking, setAsking] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const toggle = (k: string) => setOpenRow((o) => (o === k ? null : k));
  const navigate = useNavigate();
  const topic = signalTopic({ company: card.company, headline: card.headline, summary: readableSummary(card.summary) });

  const askVic = async (target: string, why: string) => {
    if (asking) return;
    setAsking(target);
    try {
      const id = await createVicThread();
      const msg = [
        `About this signal — ${card.company}: ${topic}`,
        readableSummary(card.summary),
        card.sourceUrl && !card.sourceIsSearch ? `Source: ${card.sourceUrl}` : "",
        "",
        `You suggested ${target}: ${why}`,
        "Help me action this — draft the outreach and propose any follow-up for me to review.",
      ].filter((l, i, a) => l || (i > 0 && a[i - 1])).join("\n");
      sessionStorage.setItem(`vic-pending:${id}`, msg);
      void navigate({ to: "/vic/$threadId", params: { threadId: id } });
    } catch (e) { toast.error((e as Error).message || "Couldn't open V.I.C."); setAsking(null); }
  };

  const data = q.data;
  const empty = data?.ok && data.portcos.length === 0 && data.people.length === 0;

  return (
    <section className="rounded-lg border border-primary/20 bg-primary/5 p-3" aria-label="V.I.C. suggests">
      <div className="mb-2 flex items-center gap-2">
        <VicMark className="h-4 w-4 text-primary" />
        <h4 className="whitespace-nowrap text-sm font-semibold text-foreground">V.I.C. suggests</h4>
        {data?.ok && data.note && <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:inline">— {data.note}</span>}
        {!q.isFetching && q.data && (
          <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={() => { setOpenRow(null); void q.refetch(); }}>
            <RefreshCw className="h-3 w-3" /> Rethink
          </Button>
        )}
      </div>

      {!q.data && !q.isFetching && !q.isError && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void q.refetch()}><Users className="h-4 w-4" /> Who might care?</Button>
          <span className="text-xs text-muted-foreground">V.I.C. picks the PortCos and people this news matters to.</span>
        </div>
      )}

      {q.isFetching && (
        <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> V.I.C. is reading this signal against your PortCos and network…</p>
      )}
      {!q.isFetching && (q.isError || (data && !data.ok)) && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-destructive">{data && !data.ok ? data.error : "V.I.C. couldn't read this signal right now. Try again in a minute."}</p>
          {!data && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void q.refetch()}>Try again</Button>}
        </div>
      )}
      {!q.isFetching && empty && <p className="text-xs text-muted-foreground">{data.note || "Nothing in your PortCos or network is a strong fit for this one."}</p>}

      {!q.isFetching && data?.ok && data.portcos.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Building2 className="h-3.5 w-3.5" /> PortCos that fit this news</p>
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
            {data.portcos.map((p) => (
              <PortcoRow key={p.name} p={p} open={openRow === `pc:${p.name}`} onToggle={() => toggle(`pc:${p.name}`)} done={done.has(`pc:${p.name}`)} asking={asking === p.name}
                onDraft={() => onDraft({
                  name: p.founderName || p.name, title: p.founderName ? `${p.name} founder` : "", company: p.name, email: p.founderEmail,
                  purpose: `Heads-up for ${p.name} on ${card.company ? `${card.company} news` : "industry news"}: ${topic} Why it matters to ${p.name}: ${p.why}`,
                  notes: [p.talkingPoint && `Talking point: ${p.talkingPoint}`, sourceNote(card)].filter(Boolean).join("\n"),
                })}
                onFollowUp={() => setFollowUp({ key: `pc:${p.name}`, title: `Discuss with ${p.name}: ${topic}`.slice(0, 300), portco: p.name, person: p.founderName, details: p.why })}
                onAsk={() => void askVic(p.name, p.why)} />
            ))}
          </ul>
        </div>
      )}

      {!q.isFetching && data?.ok && data.people.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Users className="h-3.5 w-3.5" /> People who might care</p>
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
            {data.people.map((p) => (
              <PersonRow key={p.id} p={p} open={openRow === `p:${p.id}`} onToggle={() => toggle(`p:${p.id}`)} done={done.has(`p:${p.id}`)} asking={asking === p.name}
                onDraft={() => onDraft({
                  name: p.name, title: p.title, company: p.company, email: p.email,
                  purpose: `Share ${card.company ? `${card.company} news` : "industry news"} with ${p.name}: ${topic} Why they'd care: ${p.why}`,
                  notes: [p.opener && `Opening line: ${p.opener}`, sourceNote(card)].filter(Boolean).join("\n"),
                })}
                onFollowUp={() => setFollowUp({ key: `p:${p.id}`, title: `Share with ${p.name}: ${topic}`.slice(0, 300), portco: "", person: p.name, details: p.why })}
                onAsk={() => void askVic(`${p.name}${p.company ? ` (${p.company})` : ""}`, p.why)} />
            ))}
          </ul>
        </div>
      )}

      <FollowUpDialog seed={followUp} signalKey={signalKey} onClose={() => setFollowUp(null)} onSaved={(k) => setDone((s) => new Set(s).add(k))} />
    </section>
  );
}

function Actions({ email, done, asking, onDraft, onFollowUp, onAsk }: { email: boolean; done: boolean; asking: boolean; onDraft: () => void; onFollowUp: () => void; onAsk: () => void }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onDraft} title={email ? undefined : "No email on file — you can add one in the draft"}>
        <Mail className="h-3.5 w-3.5" /> Draft email
      </Button>
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onFollowUp} disabled={done}>
        {done ? <><Check className="h-3.5 w-3.5" /> Follow-up added</> : <><CalendarPlus className="h-3.5 w-3.5" /> Add follow-up</>}
      </Button>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onAsk} disabled={asking}>
        {asking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />} Work on it with V.I.C.
      </Button>
    </div>
  );
}

type RowProps = { open: boolean; onToggle: () => void; done: boolean; asking: boolean; onDraft: () => void; onFollowUp: () => void; onAsk: () => void };

/** Shortlist row: name + gist; clicking opens the full reason and the actions. */
function Row({ open, onToggle, head, short, children }: { open: boolean; onToggle: () => void; head: ReactNode; short: string; children: ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-muted/50">
        <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">{head}</div>
          {!open && short && <p className="mt-0.5 truncate text-xs text-muted-foreground">{short}</p>}
        </div>
      </button>
      {open && <div className="px-2.5 pb-2.5 pl-8">{children}</div>}
    </li>
  );
}

function PortcoRow({ p, open, onToggle, ...a }: { p: PortcoSuggestion } & RowProps) {
  return (
    <Row open={open} onToggle={onToggle} short={p.short} head={<>
      <span className="text-sm font-semibold text-foreground">{p.name}</span>
      <Badge variant="secondary" className="font-normal">{p.angle}</Badge>
      {a.done && <Check className="h-3.5 w-3.5 text-primary" aria-label="Follow-up added" />}
    </>}>
      {p.founderName && <p className="text-[11px] text-muted-foreground">Founder on file: {p.founderName}</p>}
      <p className="mt-1 text-sm text-foreground">{p.why}</p>
      {p.talkingPoint && <p className="mt-1 text-xs italic text-muted-foreground">“{p.talkingPoint}”</p>}
      <Actions email={!!p.founderEmail} {...a} />
    </Row>
  );
}

function PersonRow({ p, open, onToggle, ...a }: { p: PersonSuggestion } & RowProps) {
  const prime = canonicalOwnerName(p.prime);
  return (
    <Row open={open} onToggle={onToggle} short={p.short} head={<>
      <span className="text-sm font-semibold text-foreground">{p.name}</span>
      {p.tier !== "Unrated" && <Badge variant="outline" className="font-normal">{p.tier}</Badge>}
      {p.company && <span className="text-xs text-muted-foreground">{p.company}</span>}
      {a.done && <Check className="h-3.5 w-3.5 text-primary" aria-label="Follow-up added" />}
    </>}>
      <p className="text-[11px] text-muted-foreground">{[p.title, prime && `DTC prime: ${prime}`].filter(Boolean).join(" · ")}</p>
      <p className="mt-1 text-sm text-foreground">{p.why}</p>
      {p.opener && <p className="mt-1 text-xs italic text-muted-foreground">“{p.opener}”</p>}
      <Actions email={!!p.email} {...a} />
    </Row>
  );
}

function FollowUpDialog({ seed, signalKey, onClose, onSaved }: { seed: FollowUpSeed | null; signalKey: string; onClose: () => void; onSaved: (key: string) => void }) {
  const create = useServerFn(createVicFollowUpFn);
  const { email } = useAuth();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultFollowUpDate());
  const [busy, setBusy] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);
  if (seed && openFor !== seed.key) { setOpenFor(seed.key); setTitle(seed.title); setDate(defaultFollowUpDate()); }
  if (!seed && openFor) setOpenFor(null);

  const save = async () => {
    if (!seed || !email || !title.trim() || busy) return;
    setBusy(true);
    try {
      await create({ data: { title: title.trim(), date, owner: email, portco: seed.portco, person: seed.person, details: seed.details.slice(0, 2000), key: `signal:${signalKey}:${seed.key}`.slice(0, 100) } });
      toast.success(`Follow-up added to My Actions for ${date}`);
      onSaved(seed.key);
      onClose();
    } catch (e) { toast.error((e as Error).message || "Couldn't add the follow-up."); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={!!seed} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add follow-up</DialogTitle>
          <DialogDescription>Goes to your My Actions{seed?.portco ? `, tagged to ${seed.portco}` : seed?.person ? ` for ${seed.person}` : ""}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="sf-title">What to do</Label><Input id="sf-title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="sf-date">Due</Label><Input id="sf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          {!email && <p className="text-xs text-destructive">Sign in to add follow-ups.</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy || !email || !title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)}>{busy ? "Adding…" : "Add follow-up"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

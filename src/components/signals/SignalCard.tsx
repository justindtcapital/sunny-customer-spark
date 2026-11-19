import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownMessage } from "@/components/query/MarkdownMessage";
import { companyLogoSources } from "@/lib/domain-utils";
import { absoluteHttpUrl } from "@/lib/safe-url";
import { readableSummary } from "@/lib/signals-page";
import type { FeedCard } from "@/lib/signal-feed";
import { fetchSignalBody } from "@/utils/gemini.functions";
import { SignalSuggestions, type DraftTarget } from "@/components/signals/SignalSuggestions";
import { cn } from "@/lib/utils";

function SignalLogo({ card }: { card: FeedCard }) {
  const sources = useMemo(
    () => (card.logoDomain ? companyLogoSources(card.logoDomain, card.logoConfident ? "high" : "low") : []),
    [card.logoDomain, card.logoConfident],
  );
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [sources]);
  const src = sources[idx];
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10">
      {src ? (
        <img key={src} src={src} alt="" className="h-7 w-7 object-contain" onError={() => setIdx((i) => i + 1)} />
      ) : (
        <span className="text-sm font-semibold text-primary">{card.initial}</span>
      )}
    </div>
  );
}

export function SignalCard({
  card,
  expanded,
  onToggle,
  onBroadcast,
  onDraft,
}: {
  card: FeedCard;
  expanded: boolean;
  onToggle: () => void;
  onBroadcast: () => void;
  onDraft: (t: DraftTarget) => void;
}) {
  const [extra, setExtra] = useState<string | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);

  // The feed leaves long outreach text on the sheet; fetch it the first time the card opens.
  useEffect(() => {
    if (!expanded || !card.bodyElided || !card.storedId || extra !== null) return;
    let cancelled = false;
    setLoadingBody(true);
    fetchSignalBody({ data: { id: card.storedId } })
      .then((r) => { if (!cancelled) setExtra(r.body || ""); })
      .catch(() => { if (!cancelled) setExtra(""); })
      .finally(() => { if (!cancelled) setLoadingBody(false); });
    return () => { cancelled = true; };
  }, [expanded, card.bodyElided, card.storedId, extra]);

  const body = `${card.body || card.summary}${extra ? `\n\n${extra}` : ""}`;
  const summary = readableSummary(card.summary);
  const source = absoluteHttpUrl(card.sourceUrl);
  const doc = absoluteHttpUrl(card.docUrl);

  return (
    <article
      id={card.storedId ? `signal-${card.storedId}` : undefined}
      className={cn(
        "rounded-xl border border-border bg-card transition-shadow",
        expanded ? "shadow-md ring-2 ring-primary/30" : "hover:shadow-sm",
      )}
    >
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-start gap-3 p-4 text-left">
        <SignalLogo card={card} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{card.company}</span>
            <Badge variant="outline" className="font-normal">{card.sourceType}</Badge>
            {card.segmentBucket !== "Other" && <Badge variant="secondary" className="font-normal">{card.segmentBucket}</Badge>}
            {card.industry && <Badge variant="outline" className="font-normal">{card.industry}</Badge>}
            {(card.sourceCount ?? 1) > 1 && <span>· {card.sourceCount} sources</span>}
            {card.timeLabel && <span className="ml-auto whitespace-nowrap">{card.timeLabel}</span>}
          </div>
          <h3 className="text-[15px] font-semibold leading-snug text-foreground">{card.headline}</h3>
          {!expanded && summary && summary !== card.headline && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{summary}</p>
          )}
        </div>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border px-4 pb-4 pt-3 sm:pl-[4.25rem]">
          <MarkdownMessage text={body} />
          {loadingBody && (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading suggested outreach…</p>
          )}
          <SignalSuggestions card={card} onDraft={onDraft} />
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={onBroadcast}><Send className="h-4 w-4" /> Broadcast</Button>
            {source && (
              <Button size="sm" variant="outline" asChild>
                <a href={source} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" /> {card.sourceIsSearch ? "Find the source" : "Open source"}
                </a>
              </Button>
            )}
            {doc && doc !== source && (
              <Button size="sm" variant="outline" asChild>
                <a href={doc} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" /> Open in Drive</a>
              </Button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

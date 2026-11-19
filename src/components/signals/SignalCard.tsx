import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownMessage } from "@/components/query/MarkdownMessage";
import { companyLogoSources } from "@/lib/domain-utils";
import { absoluteHttpUrl } from "@/lib/safe-url";
import { readableSummary } from "@/lib/signals-page";
import { summaryBelowHeadline } from "@/lib/signal-headline";
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
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary/10">
      {src ? (
        <img key={src} src={src} alt="" className="h-5 w-5 object-contain" onError={() => setIdx((i) => i + 1)} />
      ) : (
        <span className="text-xs font-semibold text-primary">{card.initial}</span>
      )}
    </div>
  );
}

// Meta pills: kept deliberately tiny so the headline owns the tile.
const PILL = "h-4 rounded-sm px-1.5 py-0 text-[10px] font-normal leading-none";

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
  const summary = summaryBelowHeadline(readableSummary(card.summary), card.headline);
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
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-start gap-2.5 p-3 text-left">
        <SignalLogo card={card} />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-snug text-foreground">{card.headline}</h3>
          {!expanded && summary && (
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{summary}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1">
            {(card.sourceCount ?? 1) > 1 && (
              <span className="text-[10px] text-muted-foreground">{card.sourceCount} sources</span>
            )}
            <Badge variant="outline" className={PILL}>{card.sourceType}</Badge>
            {card.segmentBucket !== "Other" && <Badge variant="secondary" className={PILL}>{card.segmentBucket}</Badge>}
            {card.industry && <Badge variant="outline" className={PILL}>{card.industry}</Badge>}
            {card.timeLabel && <span className="text-[10px] whitespace-nowrap text-muted-foreground">{card.timeLabel}</span>}
          </div>
        </div>
        <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="space-y-2.5 border-t border-border px-3 pb-3 pt-2.5 sm:pl-[3.375rem]">
          <p className="text-xs font-medium text-muted-foreground">{card.company}</p>
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

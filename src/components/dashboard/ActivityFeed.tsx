import { useMemo } from "react";
import { Loader2, Megaphone, Handshake, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAsanaActivities } from "@/lib/use-activities";
import { portCoKey } from "@/lib/portco-canonical";
import type { AsanaActivity } from "@/lib/types";

interface Props {
  /** Portco keys currently in scope. */
  keys: string[];
  scopeLabel: string;
  /** Show the company name on each row (investor / firm-wide scope). */
  showCompany: boolean;
  /** True when the whole portfolio is in scope — no company filtering. */
  allScope: boolean;
}

function Row({ a, showCompany }: { a: AsanaActivity; showCompany: boolean }) {
  return (
    <div className="rounded-md border border-border px-2.5 py-2 hover:bg-accent/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
          {a.name || "Untitled activity"}
        </p>
        {a.url && (
          <a
            href={a.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground hover:text-primary shrink-0"
            aria-label="Open in Asana"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
        {[
          a.date,
          showCompany ? a.company : null,
          a.person,
          a.type,
          a.owner,
          a.status,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

function Box({
  title,
  icon,
  items,
  showCompany,
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  items: AsanaActivity[];
  showCompany: boolean;
  loading: boolean;
}) {
  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="font-display text-sm font-semibold text-foreground">{title}</h3>
          </div>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {items.length} logged
          </p>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-6">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading activity…
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6">No activity on record.</p>
        ) : (
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
            {items.map((a) => (
              <Row key={a.gid} a={a} showCompany={showCompany} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ActivityFeed({ keys, scopeLabel, showCompany, allScope }: Props) {
  const { activities, loading } = useAsanaActivities();
  const keySet = useMemo(() => new Set(keys), [keys]);

  const { gtm, bd } = useMemo(() => {
    const inScope = activities.filter(
      (a) => allScope || keySet.has(portCoKey(a.company || "")),
    );
    const byDateDesc = [...inScope].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return {
      gtm: byDateDesc.filter((a) => a.track === "GTM"),
      bd: byDateDesc.filter((a) => a.track !== "GTM"),
    };
  }, [activities, keySet, allScope]);

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-sm font-semibold text-foreground">
          Activity tracking
        </h2>
        <p className="text-xs text-muted-foreground">{scopeLabel}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Box
          title="Go-to-market activity"
          icon={<Megaphone className="h-4 w-4 text-primary" />}
          items={gtm}
          showCompany={showCompany}
          loading={loading}
        />
        <Box
          title="Business development & introductions"
          icon={<Handshake className="h-4 w-4 text-primary" />}
          items={bd}
          showCompany={showCompany}
          loading={loading}
        />
      </div>
    </section>
  );
}

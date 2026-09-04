import { useMemo } from "react";
import { Loader2, Rocket, Handshake } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { WorkstreamRow } from "@/components/portfolio/WorkstreamsPanel";
import { useWorkstreams } from "@/lib/use-workstreams";
import type { Workstream } from "@/lib/workstream-parse";

interface Props {
  /** Portco keys currently in scope. */
  keys: string[];
  scopeLabel: string;
  /** Show company names on each row (investor scope). */
  showCompany: boolean;
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
  items: Workstream[];
  showCompany: boolean;
  loading: boolean;
}) {
  const open = items.filter((w) => !w.completed);
  const done = items.length - open.length;
  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="font-display text-sm font-semibold text-foreground">{title}</h3>
          </div>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {open.length} active · {done} complete
          </p>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-6">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading workstreams…
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6">No workstreams on record.</p>
        ) : (
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
            {[...open, ...items.filter((w) => w.completed)].map((w) => (
              <WorkstreamRow key={w.gid} w={w} showCompany={showCompany} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WorkstreamSummary({ keys, scopeLabel, showCompany }: Props) {
  const { workstreams, loading } = useWorkstreams();
  const keySet = useMemo(() => new Set(keys), [keys]);

  const { gtm, bd } = useMemo(() => {
    const inScope = workstreams.filter((w) => keySet.has(w.companyKey));
    return {
      gtm: inScope.filter((w) => w.segment === "GTM"),
      bd: inScope.filter((w) => w.segment !== "GTM"),
    };
  }, [workstreams, keySet]);

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-sm font-semibold text-foreground">
          Major workstreams
        </h2>
        <p className="text-xs text-muted-foreground">{scopeLabel}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Box
          title="Go-to-market"
          icon={<Rocket className="h-4 w-4 text-primary" />}
          items={gtm}
          showCompany={showCompany}
          loading={loading}
        />
        <Box
          title="Business development"
          icon={<Handshake className="h-4 w-4 text-primary" />}
          items={bd}
          showCompany={showCompany}
          loading={loading}
        />
      </div>
    </section>
  );
}

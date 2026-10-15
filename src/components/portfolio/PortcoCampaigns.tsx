// Current campaigns tagged to a PortCo, as a collapsible stats box in the PortCo pane.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fetchCampaigns } from "@/utils/campaigns.functions";
import { portcoMatches } from "@/lib/use-knowledge";
import { StatSection } from "./StatSection";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  saved: "Saved",
  actioning: "Actioning",
  done: "Done",
};

export function PortcoCampaigns({ company }: { company: string }) {
  const q = useQuery({ queryKey: ["campaigns"], queryFn: () => fetchCampaigns(), staleTime: 30_000 });
  const tagged = (q.data?.campaigns || [])
    .filter((c) => c.portcos.some((p) => portcoMatches(p, company)))
    .sort((a, b) => (b.updated || b.created || "").localeCompare(a.updated || a.created || ""));
  const active = tagged.filter((c) => c.status !== "done");
  const people = active.reduce((n, c) => n + (c.memberCount || 0), 0);
  const byStatus: Record<string, number> = {};
  for (const c of active) byStatus[STATUS_LABEL[c.status] || c.status] = (byStatus[STATUS_LABEL[c.status] || c.status] || 0) + 1;

  return (
    <StatSection
      title="Current Campaigns"
      stats={[
        { label: "Active", value: q.isLoading ? "…" : active.length },
        { label: "People", value: people },
        { label: "All time", value: tagged.length },
      ]}
      dots={byStatus}
    >
      {active.length === 0 ? (
        <p className="text-xs text-muted-foreground">No active campaigns tagged to {company}</p>
      ) : (
        <div className="max-h-80 overflow-y-auto pr-1 space-y-1.5">
          {active.map((c) => (
            <div key={c.id} className="rounded border border-border px-2 py-1.5">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] shrink-0">{STATUS_LABEL[c.status] || c.status}</Badge>
                <span className="text-xs font-medium text-foreground truncate">{c.name}</span>
                <Link
                  to="/campaigns"
                  search={{ campaign: c.id }}
                  className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary hover:underline shrink-0"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {[c.purpose, `${c.memberCount || 0} people`, c.owner, c.events[0], (c.updated || c.created || "").slice(0, 10)]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              {c.portcos.length > 1 && (
                <div className="text-[10px] text-muted-foreground truncate">PortCos: {c.portcos.join(", ")}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </StatSection>
  );
}

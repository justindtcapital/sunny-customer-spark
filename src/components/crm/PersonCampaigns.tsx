import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fetchPersonCampaigns } from "@/utils/campaigns.functions";
import { targetKeyOf } from "@/lib/types";
import { RESULT_LABEL, type CampaignResult } from "@/lib/campaign-results";

/** Every Campaign Builder campaign this person belongs to. */
export function PersonCampaigns({ email, name, company }: { email?: string; name?: string; company?: string }) {
  const emails = (email || "")
    .split(/[,;]/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const keys = Array.from(new Set([...emails, targetKeyOf({ name, company })])).slice(0, 10);
  const q = useQuery({
    queryKey: ["person-campaigns", keys.join("·")],
    queryFn: () => fetchPersonCampaigns({ data: { keys } }),
    staleTime: 60_000,
  });
  const rows = q.data || [];
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
        <Megaphone className="h-3 w-3" /> Campaigns
      </p>
      <div className="space-y-1">
        {rows.map((c) => (
          <div key={c.id} className="flex items-center gap-2 text-xs">
            <span className="font-medium text-foreground">{c.name}</span>
            <span className="text-muted-foreground">{c.purpose}</span>
            <span className="text-muted-foreground">· added {c.added}</span>
            {c.sentDate && <span className="text-muted-foreground">· sent {c.sentDate}</span>}
            {c.result && (
              <span className="text-foreground" title={c.resultBy ? `Marked by ${c.resultBy}${c.resultAt ? ` on ${c.resultAt.slice(0, 10)}` : ""}` : undefined}>
                · <b>{RESULT_LABEL[c.result as CampaignResult] || c.result}</b>
                {c.resultBy && <span className="text-muted-foreground"> ({c.resultBy})</span>}
              </span>
            )}
            <Badge variant="outline" className="ml-auto text-[9px] capitalize">
              {c.status === "done" ? "actioned" : c.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { addCampaignMembers, fetchCampaigns } from "@/utils/campaigns.functions";
import { CampaignTypeBadge, statusLabel } from "@/components/campaigns/CampaignList";
import { isClosedStatus, ownerInitials } from "@/lib/campaign-results";
import { canonicalOwnerName } from "@/lib/user-ownership";
import { savePreload, toCampaignCandidate, type PreloadSource } from "@/lib/campaign-preload";
import { useAuth } from "@/lib/auth-context";

const NEW = "__new__";

/** Network bulk bar: put the selected people into an open campaign, or carry them into a new one. */
export function BulkAddToCampaignDialog({
  open,
  onOpenChange,
  people,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  people: PreloadSource[];
  onAdded?: () => void;
}) {
  const { email: userEmail } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const add = useServerFn(addCampaignMembers);
  const [choice, setChoice] = useState(NEW);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["campaigns"], queryFn: () => fetchCampaigns(), staleTime: 30_000, enabled: open });
  const openCampaigns = useMemo(
    () => (q.data?.campaigns || []).filter((c) => !isClosedStatus(c.status)).sort((a, b) => (b.updated || "").localeCompare(a.updated || "")),
    [q.data],
  );
  const count = people.length;
  const candidates = () => people.map(toCampaignCandidate);

  const confirm = async () => {
    if (choice === NEW) {
      savePreload(candidates());
      onOpenChange(false);
      onAdded?.();
      void navigate({ to: "/campaigns", search: { preload: "network" } });
      return;
    }
    const c = openCampaigns.find((x) => x.id === choice);
    if (!c) return;
    setBusy(true);
    try {
      const res = await add({
        data: { campaignId: c.id, campaignName: c.name, people: candidates(), event: c.events[0] || "", portcos: c.portcos, by: userEmail || "" },
      });
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
      await qc.invalidateQueries({ queryKey: ["campaign-members", c.id] });
      toast.success(
        `${res.added} added to ${c.name}` + (res.skipped ? ` · ${res.skipped} already in it` : ""),
        { action: { label: "Open campaign", onClick: () => void navigate({ to: "/campaigns", search: { campaign: c.id } }) } },
      );
      onOpenChange(false);
      onAdded?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add people to the campaign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add {count} {count === 1 ? "person" : "people"} to a campaign</DialogTitle>
          <DialogDescription>Pick a campaign that's already in flight, or start a new one. Their records stay as they are.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] space-y-1.5 overflow-auto pr-0.5" role="radiogroup" aria-label="Campaign">
          <button
            type="button"
            role="radio"
            aria-checked={choice === NEW}
            onClick={() => setChoice(NEW)}
            className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm ${choice === NEW ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
          >
            <Plus className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">New campaign</span>
            <span className="ml-auto text-[11px] text-muted-foreground">name it on the Campaigns page</span>
          </button>
          {q.isLoading && <p className="py-2 text-xs text-muted-foreground">Loading campaigns…</p>}
          {openCampaigns.map((c) => {
            const owner = canonicalOwnerName(c.owner || c.createdBy);
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={choice === c.id}
                onClick={() => setChoice(c.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-xs ${choice === c.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-sm font-medium text-foreground">{c.name}</span>
                  {owner && (
                    <span title={owner} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[9px] font-semibold text-secondary-foreground">
                      {ownerInitials(owner)}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                  <CampaignTypeBadge purpose={c.purpose} />
                  <span>{c.memberCount ?? 0} people</span>
                  <span className="ml-auto capitalize">{statusLabel(c.status)}</span>
                </div>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void confirm()} disabled={busy || !count || (choice !== NEW && !openCampaigns.some((c) => c.id === choice))}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {choice === NEW ? "Start new campaign" : `Add ${count}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

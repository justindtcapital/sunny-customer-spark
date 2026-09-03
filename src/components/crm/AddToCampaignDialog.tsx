import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { CampaignCombobox } from "@/components/crm/CampaignCombobox";
import { PortcoTagPicker } from "@/components/crm/PortcoTagPicker";
import { EventPicker } from "@/components/events/EventPicker";

export interface AddToCampaignResult {
  campaign: string;
  event: string;
  portcos: string[];
  followUp: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many targets the campaign will be written onto. */
  count: number;
  /** Portfolio company names offered as PortCo tags. */
  portcoNames?: string[];
  onSave: (result: AddToCampaignResult) => void | Promise<void>;
}

// Bulk "Add to campaign" for a targeting selection: pick (or write in) a
// campaign, optionally tie it to an event and portfolio companies, and
// optionally flag everyone for follow-up.
export function AddToCampaignDialog({
  open,
  onOpenChange,
  count,
  portcoNames = [],
  onSave,
}: Props) {
  const [campaign, setCampaign] = useState("");
  const [eventName, setEventName] = useState("");
  const [portcos, setPortcos] = useState<string[]>([]);
  const [followUp, setFollowUp] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCampaign("");
    setEventName("");
    setPortcos([]);
    setFollowUp(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !busy) reset();
    onOpenChange(next);
  };

  const submit = async () => {
    const name = campaign.trim();
    if (!name) return;
    setBusy(true);
    try {
      await onSave({ campaign: name, event: eventName.trim(), portcos, followUp });
      reset();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to campaign</DialogTitle>
          <DialogDescription>
            Group the {count} selected target{count !== 1 ? "s" : ""} under a campaign. Pick an
            existing campaign or write in a new one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
              Campaign
            </Label>
            <CampaignCombobox value={campaign} onChange={setCampaign} />
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
              Event (optional)
            </Label>
            {/* Picking an event pre-fills a follow-up campaign name, matching the
                CSV upload flow. */}
            <EventPicker
              value={eventName}
              onChange={(v) => {
                setEventName(v);
                if (v && !campaign.trim()) setCampaign(`Follow-up — ${v}`);
              }}
              placeholder="Tie this campaign to an event"
            />
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
              PortCo tags (optional)
            </Label>
            <PortcoTagPicker value={portcos} onChange={setPortcos} options={portcoNames} />
            <p className="text-[10px] text-muted-foreground mt-1">
              Who this campaign is on behalf of.
            </p>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
            <div>
              <Label className="text-[11px] font-semibold text-foreground">
                Flag these targets for follow-up
              </Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Each person gets a pending follow-up on their target card.
              </p>
            </div>
            <Switch checked={followUp} onCheckedChange={setFollowUp} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !campaign.trim()}>
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {busy ? "Saving…" : `Add ${count} target${count !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

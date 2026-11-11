import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveCampaignFn } from "@/utils/campaigns.functions";
import { canonicalOwnerName } from "@/lib/user-ownership";
import type { CampaignRecord } from "@/lib/campaigns";
import { CAMPAIGN_TYPES, CAMPAIGN_TYPE_LABEL, TYPE_DEFAULT_PURPOSE, campaignTypeOf, isClosedStatus, ownerInitials, type CampaignType } from "@/lib/campaign-results";

/** Semantic chart tokens per type (stripe + badge). */
export const TYPE_STYLE: Record<CampaignType, { stripe: string; badge: string }> = {
  Event: { stripe: "border-l-chart-1", badge: "bg-chart-1/15 text-chart-1 border-chart-1/30" },
  Network: { stripe: "border-l-chart-2", badge: "bg-chart-2/15 text-chart-2 border-chart-2/30" },
  BD: { stripe: "border-l-chart-4", badge: "bg-chart-4/15 text-chart-4 border-chart-4/30" },
};

export function CampaignTypeBadge({ purpose }: { purpose: string }) {
  const t = campaignTypeOf(purpose);
  return <Badge variant="outline" className={`text-[9px] px-1.5 ${TYPE_STYLE[t].badge}`}>{CAMPAIGN_TYPE_LABEL[t]}</Badge>;
}

export const statusLabel = (s: string) => (s === "done" ? "actioned" : s);

export interface LegacyLabel { name: string; count: number }

export function CampaignList({
  campaigns,
  legacy,
  loading,
  userEmail,
  selectedKey,
  onSelect,
  onSelectLegacy,
  onNew,
}: {
  campaigns: CampaignRecord[];
  legacy: LegacyLabel[];
  loading: boolean;
  userEmail: string;
  selectedKey: string;
  onSelect: (c: CampaignRecord) => void;
  onSelectLegacy: (name: string) => void;
  onNew: () => void;
}) {
  const save = useServerFn(saveCampaignFn);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"mine" | "others" | "all">("all");
  const [type, setType] = useState<CampaignType | "">("");
  const [showClosed, setShowClosed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CampaignType>("Event");
  const [busy, setBusy] = useState(false);
  const me = canonicalOwnerName(userEmail);

  const isMine = (c: CampaignRecord) =>
    (!!c.owner && canonicalOwnerName(c.owner) === me) || (!!c.createdBy && canonicalOwnerName(c.createdBy) === me);

  const visible = useMemo(
    () =>
      campaigns.filter(
        (c) =>
          isClosedStatus(c.status) === showClosed &&
          (filter === "all" || (filter === "mine" ? isMine(c) : !isMine(c))) &&
          (!type || campaignTypeOf(c.purpose) === type),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaigns, filter, type, showClosed, me],
  );
  const closedCount = campaigns.filter((c) => isClosedStatus(c.status)).length;
  const showLegacy = !showClosed && filter !== "mine" && (!type || type === "Network");

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await save({ data: { name, purpose: TYPE_DEFAULT_PURPOSE[newType], owner: me, by: userEmail } });
      if (!res.ok) return void toast.error(res.error);
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
      setNewName("");
      setAdding(false);
      onSelect({ ...res.campaign, memberCount: 0 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the campaign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 md:sticky md:top-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">{showClosed ? "Closed campaigns" : "Campaigns"}</p>
        <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-3 w-3 mr-1" /> Add new
        </Button>
      </div>
      {adding && (
        <form
          className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Campaign name, then Enter" className="h-8 text-xs" />
          <div className="flex gap-1.5">
            <Select value={newType} onValueChange={(v) => setNewType(v as CampaignType)}>
              <SelectTrigger className="h-7 text-[11px] flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>{CAMPAIGN_TYPES.map((t) => <SelectItem key={t} value={t}>{CAMPAIGN_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="submit" size="sm" className="h-7 px-2 text-[11px]" disabled={busy || !newName.trim()}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
            </Button>
          </div>
          <button type="button" className="text-[10px] text-muted-foreground underline" onClick={onNew}>Open full setup instead</button>
        </form>
      )}
      <div className="flex gap-1">
        {(["mine", "others", "all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} className="h-6 px-2 text-[11px] flex-1" onClick={() => setFilter(f)}>
            {f === "mine" ? "Mine" : f === "others" ? "Others'" : "All"}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {CAMPAIGN_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => setType((cur) => (cur === t ? "" : t))}
            className={`rounded-full border px-2 py-0.5 text-[10px] ${type === t ? TYPE_STYLE[t].badge + " font-semibold" : "border-border text-muted-foreground hover:bg-muted/50"}`}
          >
            {CAMPAIGN_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      {!visible.length && !(showLegacy && legacy.length) && (
        <p className="text-xs text-muted-foreground py-2">{loading ? "Loading…" : "No campaigns here."}</p>
      )}
      <div className="space-y-1.5 max-h-[calc(100vh-280px)] min-h-[200px] overflow-auto pr-0.5">
        {visible.map((c) => {
          const t = campaignTypeOf(c.purpose);
          const owner = canonicalOwnerName(c.owner || c.createdBy);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c)}
              className={`w-full text-left rounded-md border border-l-4 px-2.5 py-2 text-xs hover:bg-muted/50 ${TYPE_STYLE[t].stripe} ${
                selectedKey === c.id ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground truncate flex-1">{c.name}</span>
                {owner && (
                  <span
                    title={owner}
                    aria-label={`Owner ${owner}`}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[9px] font-semibold text-secondary-foreground"
                  >
                    {ownerInitials(owner)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground mt-1">
                <CampaignTypeBadge purpose={c.purpose} />
                <span>{c.memberCount ?? 0} people</span>
                <Badge variant="outline" className="ml-auto text-[9px] capitalize">{statusLabel(c.status)}</Badge>
              </div>
            </button>
          );
        })}
        {showLegacy &&
          legacy.map((l) => (
            <button
              key={`legacy:${l.name}`}
              type="button"
              onClick={() => onSelectLegacy(l.name)}
              className={`w-full text-left rounded-md border border-l-4 border-l-muted-foreground px-2.5 py-2 text-xs hover:bg-muted/50 ${
                selectedKey === `legacy:${l.name}` ? "border-primary" : "border-border"
              }`}
            >
              <div className="font-medium text-foreground truncate">{l.name}</div>
              <div className="text-muted-foreground mt-0.5">From Network/Prospecting · {l.count} people</div>
            </button>
          ))}
      </div>
      <label className="flex items-center justify-between gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
        Show closed ({closedCount})
        <Switch checked={showClosed} onCheckedChange={setShowClosed} />
      </label>
    </div>
  );
}

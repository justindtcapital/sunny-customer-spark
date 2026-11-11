import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { closeCampaign, fetchCampaignResults, saveCampaignFn, saveCampaignResults, setCampaignFollowUps } from "@/utils/campaigns.functions";
import { CAMPAIGN_TEAM, followUpDueDate, type CampaignMember, type CampaignRecord } from "@/lib/campaigns";
import { canonicalOwnerName } from "@/lib/user-ownership";
import { RESULT_LABEL, campaignTypeOf, isClosedStatus, type CampaignResult } from "@/lib/campaign-results";

type Mark = { result: CampaignResult | ""; followUpOwner: string; followUpDue: string };

export function CampaignResults({
  campaign,
  members,
  loadingMembers,
  userEmail,
  onCampaign,
  onClosed,
}: {
  campaign: CampaignRecord;
  members: CampaignMember[];
  loadingMembers: boolean;
  userEmail: string;
  onCampaign: (c: CampaignRecord) => void;
  onClosed: () => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveCampaignResults);
  const closeFn = useServerFn(closeCampaign);
  const followFn = useServerFn(setCampaignFollowUps);
  const saveCampaign = useServerFn(saveCampaignFn);
  const resultsQ = useQuery({
    queryKey: ["campaign-results", campaign.id],
    queryFn: () => fetchCampaignResults({ data: { campaignId: campaign.id } }),
  });
  const me = canonicalOwnerName(userEmail);
  const isOwner =
    (!!campaign.owner && canonicalOwnerName(campaign.owner) === me) ||
    (!!campaign.createdBy && canonicalOwnerName(campaign.createdBy) === me);
  const closed = isClosedStatus(campaign.status);
  const editable = isOwner && !closed;
  const isEvent = campaignTypeOf(campaign.purpose) === "Event";
  const options: CampaignResult[] = [isEvent ? "attending" : "interested", "follow-up", "declined", "no-reply"];

  const saved = useMemo(() => {
    const m = new Map<string, Mark>();
    for (const r of resultsQ.data || []) m.set(r.personKey, { result: r.result, followUpOwner: r.followUpOwner, followUpDue: r.followUpDue });
    return m;
  }, [resultsQ.data]);
  const [marks, setMarks] = useState<Map<string, Mark>>(new Map());
  useEffect(() => setMarks(new Map(saved)), [saved]);

  const [onlyUnmarked, setOnlyUnmarked] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "close" | "reopen">("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [eventName, setEventName] = useState(campaign.events[0] || "");

  const markOf = (k: string): Mark => marks.get(k) || { result: "", followUpOwner: "", followUpDue: "" };
  const setMark = (k: string, patch: Partial<Mark>) =>
    setMarks((cur) => {
      const next = new Map(cur);
      const prev = next.get(k) || { result: "", followUpOwner: "", followUpDue: "" };
      const m = { ...prev, ...patch };
      if (patch.result === "follow-up" && !m.followUpDue) {
        m.followUpDue = followUpDueDate(new Date(), 1, "weeks");
        m.followUpOwner = m.followUpOwner || canonicalOwnerName(campaign.owner || campaign.createdBy) || me;
      }
      next.set(k, m);
      return next;
    });

  const counts = useMemo(() => {
    const c: Record<string, number> = { unmarked: 0 };
    for (const m of members) {
      const r = markOf(m.personKey).result || "unmarked";
      c[r] = (c[r] || 0) + 1;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, marks]);

  const dirty = members.filter((m) => {
    const a = markOf(m.personKey), b = saved.get(m.personKey);
    return a.result !== (b?.result || "") || a.followUpDue !== (b?.followUpDue || "") || a.followUpOwner !== (b?.followUpOwner || "");
  });

  const persist = async () => {
    if (!dirty.length) return;
    await saveFn({ data: { campaignId: campaign.id, by: userEmail, marks: dirty.map((m) => ({ personKey: m.personKey, ...markOf(m.personKey) })) } });
    // New or changed follow-ups become dated follow-ups in My Actions, grouped by owner + date.
    const groups = new Map<string, CampaignMember[]>();
    for (const m of dirty) {
      const k = markOf(m.personKey);
      if (k.result !== "follow-up" || !k.followUpDue || !k.followUpOwner) continue;
      const g = `${k.followUpOwner}|${k.followUpDue}`;
      groups.set(g, [...(groups.get(g) || []), m]);
    }
    for (const [g, ppl] of groups) {
      const [owner, due] = g.split("|");
      await followFn({ data: { campaignId: campaign.id, campaignName: campaign.name, owner, due, people: ppl.map((p) => ({ personKey: p.personKey, kind: p.kind, email: p.email })) } });
    }
    await qc.invalidateQueries({ queryKey: ["campaign-results", campaign.id] });
    await qc.invalidateQueries({ queryKey: ["person-campaigns"] });
  };

  const save = async () => {
    setBusy("save");
    try {
      await persist();
      toast.success("Results saved — come back any time.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save results");
    } finally {
      setBusy("");
    }
  };

  const close = async () => {
    setBusy("close");
    try {
      await persist();
      const r = await closeFn({ data: { campaignId: campaign.id, by: userEmail, eventName: eventName || undefined } });
      const parts = [`${r.noReply} marked no reply`];
      if (r.attending) parts.unshift(r.eventMissing ? `${r.attending} attending — event "${r.event}" not found on the Events page, so nobody was registered` : `${r.registered} registered to ${r.event}${r.skipped ? ` (${r.skipped} already on the list)` : ""}`);
      toast.success(`Campaign closed. ${parts.join(" · ")}`);
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
      await qc.invalidateQueries({ queryKey: ["person-campaigns"] });
      onClosed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not close the campaign");
    } finally {
      setBusy("");
      setConfirmClose(false);
    }
  };

  const reopen = async () => {
    setBusy("reopen");
    try {
      const r = await saveCampaign({ data: { id: campaign.id, status: "actioning", by: userEmail } });
      if (!r.ok) return void toast.error(r.error);
      onCampaign({ ...r.campaign, memberCount: campaign.memberCount });
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
    } finally {
      setBusy("");
    }
  };

  const rows = members.filter((m) => !onlyUnmarked || !markOf(m.personKey).result);
  const loading = loadingMembers || resultsQ.isLoading;
  const attendingCount = counts[isEvent ? "attending" : "interested"] || 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {options.map((o) => (
          <span key={o} className="rounded-full border border-border px-2 py-0.5">
            <b className="text-foreground">{counts[o] || 0}</b> <span className="text-muted-foreground">{RESULT_LABEL[o].toLowerCase()}</span>
          </span>
        ))}
        <span className="rounded-full border border-dashed border-border px-2 py-0.5">
          <b className="text-foreground">{counts.unmarked}</b> <span className="text-muted-foreground">unmarked</span>
        </span>
        <label className="ml-auto flex items-center gap-2 text-muted-foreground">
          Only unmarked <Switch checked={onlyUnmarked} onCheckedChange={setOnlyUnmarked} />
        </label>
      </div>
      {!isOwner && <p className="text-[11px] text-muted-foreground">Only the campaign owner can change results.</p>}
      {closed && <p className="text-[11px] text-muted-foreground">This campaign is closed. Results are final.</p>}

      {loading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading people…</p>
      ) : !members.length ? (
        <p className="text-xs text-muted-foreground">Nobody is on this campaign yet.</p>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border max-h-[60vh] overflow-auto">
          {rows.map((m) => {
            const k = markOf(m.personKey);
            return (
              <div key={m.personKey} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                <div className="min-w-[180px] flex-1">
                  <div className="font-medium text-foreground">{m.name || m.email}</div>
                  <div className="text-muted-foreground truncate">{[m.title, m.company].filter(Boolean).join(" · ")}</div>
                </div>
                <div role="radiogroup" aria-label={`Result for ${m.name}`} className="flex flex-wrap gap-1">
                  {options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      role="radio"
                      aria-checked={k.result === o}
                      disabled={!editable}
                      onClick={() => setMark(m.personKey, { result: k.result === o ? "" : o })}
                      className={`rounded-full border px-2 py-0.5 text-[11px] disabled:cursor-default ${
                        k.result === o ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      {o === "declined" ? "Declined" : RESULT_LABEL[o]}
                    </button>
                  ))}
                </div>
                {k.result === "follow-up" && (
                  <div className="flex basis-full justify-end gap-1.5">
                    <Select value={k.followUpOwner} onValueChange={(v) => setMark(m.personKey, { followUpOwner: v })} disabled={!editable}>
                      <SelectTrigger className="h-7 w-[150px] text-[11px]"><SelectValue placeholder="Teammate" /></SelectTrigger>
                      <SelectContent>{CAMPAIGN_TEAM.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="date" value={k.followUpDue} disabled={!editable} onChange={(e) => setMark(m.personKey, { followUpDue: e.target.value })} className="h-7 w-[140px] text-[11px]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {closed && isOwner && (
          <Button variant="outline" disabled={!!busy} onClick={() => void reopen()}>
            {busy === "reopen" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />} Reopen
          </Button>
        )}
        {editable && (
          <>
            <Button variant="outline" disabled={!!busy || !dirty.length} onClick={() => void save()}>
              {busy === "save" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save and come back later
            </Button>
            <Button disabled={!!busy || !members.length} onClick={() => setConfirmClose(true)}>Close campaign</Button>
          </>
        )}
      </div>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close “{campaign.name}”?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {isEvent ? (
                  attendingCount ? (
                    campaign.events.length ? (
                      <p>{attendingCount} people marked Attending will be registered to the event (anyone already on its list is skipped).</p>
                    ) : (
                      <p>{attendingCount} people are marked Attending, but this campaign has no event linked, so nobody will be registered.</p>
                    )
                  ) : <p>Nobody is marked Attending.</p>
                ) : null}
                {campaign.events.length > 1 && isEvent && attendingCount > 0 && (
                  <Select value={eventName} onValueChange={setEventName}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Which event?" /></SelectTrigger>
                    <SelectContent>{campaign.events.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                <p>Follow-ups already created stay in My Actions.</p>
                <p>{counts.unmarked} unmarked people will be recorded as No reply.</p>
                <p>The campaign moves to the Closed list.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "close"}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy === "close"} onClick={(e) => { e.preventDefault(); void close(); }}>
              {busy === "close" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Close campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

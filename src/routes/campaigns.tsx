import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Linkedin,
  Loader2,
  Mail,
  Megaphone,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EventPicker } from "@/components/events/EventPicker";
import { PortcoTagPicker } from "@/components/crm/PortcoTagPicker";
import { useAuth } from "@/lib/auth-context";
import {
  CAMPAIGN_PURPOSES,
  CAMPAIGN_TEAM,
  fillTemplate,
  followUpDueDate,
  mailtoLink,
  mergeCandidates,
  parseCandidateCsv,
  personKeyOf,
  type CampaignChannel,
  type CampaignMember,
  type CampaignRecord,
  type CandidatePerson,
  type FollowUpUnit,
  summarizeMembers,
} from "@/lib/campaigns";
import { fetchContacts, fetchTargets, fetchPortfolioCompanies } from "@/utils/sheets.functions";
import { findProspects } from "@/utils/prospects.functions";
import {
  addCampaignMembers,
  draftCampaignTemplate,
  fetchCampaignMembers,
  fetchCampaigns,
  deleteCampaignFn,
  finishCampaign,
  logCampaignSend,
  personalizeCampaignMessages,
  saveCampaignFn,
  saveMemberDrafts,
  setCampaignFollowUps,
  uploadCampaignAttachment,
} from "@/utils/campaigns.functions";

export const Route = createFileRoute("/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaign Manager — VenturePulse" },
      {
        name: "description",
        content: "Build outreach campaigns from your network and prospects, draft with AI, and track sends and follow-ups.",
      },
      { property: "og:title", content: "Campaign Manager — VenturePulse" },
      {
        property: "og:description",
        content: "Build outreach campaigns from your network and prospects, draft with AI, and track sends and follow-ups.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignBuilderPage,
});

type Step = "start" | "build" | "confirm" | "decide" | "message" | "send";
const STEPS: { id: Step; label: string }[] = [
  { id: "start", label: "Campaign" },
  { id: "build", label: "Build list" },
  { id: "confirm", label: "Confirm list" },
  { id: "message", label: "Message" },
  { id: "send", label: "Send & follow up" },
];
const NEW = "__new__";

interface Draft {
  subject: string;
  body: string;
  linkedin: string;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
      {children}
    </Label>
  );
}

function CampaignBuilderPage() {
  const { email: userEmail } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("start");
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [staged, setStaged] = useState<CandidatePerson[]>([]);

  const campaignsQ = useQuery({ queryKey: ["campaigns"], queryFn: () => fetchCampaigns(), staleTime: 30_000 });
  const membersQ = useQuery({
    queryKey: ["campaign-members", campaign?.id],
    queryFn: () => fetchCampaignMembers({ data: { campaignId: campaign!.id } }),
    enabled: !!campaign?.id,
  });
  const members = membersQ.data || [];
  const memberKeys = useMemo(() => new Set(members.map((m) => m.personKey)), [members]);

  const refreshMembers = async () => {
    await qc.invalidateQueries({ queryKey: ["campaign-members", campaign?.id] });
    await qc.invalidateQueries({ queryKey: ["campaigns"] });
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Megaphone className="h-5 w-5 text-primary" />
          Campaign Manager
          {campaign && <span className="text-muted-foreground font-normal">· {campaign.name}</span>}
        </h1>
        {campaign && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCampaign(null);
              setStaged([]);
              setStep("start");
            }}
          >
            Start over
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {STEPS.map((s, i) => {
          const active = s.id === step || (step === "decide" && s.id === "confirm");
          return (
            <div
              key={s.id}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                active ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"
              }`}
            >
              <span>{i + 1}</span>
              {s.label}
            </div>
          );
        })}
      </div>

      {step === "start" && (
        <StartStep
          campaigns={campaignsQ.data?.campaigns || []}
          loading={campaignsQ.isLoading}
          userEmail={userEmail || ""}
          onReady={(c, next, prefill) => {
            setCampaign(c);
            setStaged(prefill || []);
            void qc.invalidateQueries({ queryKey: ["campaigns"] });
            setStep(next);
          }}
        />
      )}
      {step === "build" && campaign && (
        <BuildStep
          campaign={campaign}
          staged={staged}
          memberKeys={memberKeys}
          onStaged={setStaged}
          onBack={() => setStep("start")}
          onNext={() => setStep("confirm")}
        />
      )}
      {step === "confirm" && campaign && (
        <ConfirmStep
          campaign={campaign}
          staged={staged}
          members={members}
          onStaged={setStaged}
          userEmail={userEmail || ""}
          onBack={() => setStep("build")}
          onSaved={async () => {
            setStaged([]);
            await refreshMembers();
            setStep("decide");
          }}
        />
      )}
      {step === "decide" && campaign && (
        <div className="rounded-lg border border-border bg-card p-6 text-center space-y-4">
          <p className="text-sm text-foreground">
            The list for <b>{campaign.name}</b> is saved ({members.length} people).
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => setStep("build")}>
              <Plus className="h-4 w-4 mr-1" /> Add more people
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                toast.success("Saved. Open it from the campaign list any time.");
                setCampaign(null);
                setStep("start");
              }}
            >
              Save and action later
            </Button>
            <Button onClick={() => setStep("message")}>
              Action now <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
      {(step === "message" || step === "send") && campaign && (
        <ActionSteps
          step={step}
          campaign={campaign}
          members={members}
          loadingMembers={membersQ.isLoading}
          userEmail={userEmail || ""}
          onCampaign={setCampaign}
          onStep={setStep}
          onMembersChanged={refreshMembers}
          onDone={() => {
            setCampaign(null);
            setStep("start");
            void qc.invalidateQueries({ queryKey: ["campaigns"] });
          }}
        />
      )}
    </div>
  );
}

// ── Step 1 ────────────────────────────────────────────────────

function StartStep({
  campaigns,
  loading,
  userEmail,
  onReady,
}: {
  campaigns: CampaignRecord[];
  loading: boolean;
  userEmail: string;
  onReady: (c: CampaignRecord, next: Step, prefill?: CandidatePerson[]) => void;
}) {
  const save = useServerFn(saveCampaignFn);
  const contactsQ = useQuery({ queryKey: ["campaign-contacts"], queryFn: () => fetchContacts(), staleTime: 60_000 });
  const targetsQ = useQuery({ queryKey: ["campaign-targets"], queryFn: () => fetchTargets(), staleTime: 60_000 });
  const portfolioQ = useQuery({ queryKey: ["campaign-portcos"], queryFn: () => fetchPortfolioCompanies() });
  const portcoNames = useMemo(
    () => Array.from(new Set((portfolioQ.data || []).map((p) => p.name))).sort(),
    [portfolioQ.data],
  );
  const [choice, setChoice] = useState<string>(NEW);
  const [name, setName] = useState("");
  const [autoName, setAutoName] = useState("");
  const [legacy, setLegacy] = useState("");
  const [listFilter, setListFilter] = useState<"mine" | "others" | "all">("all");
  const [purpose, setPurpose] = useState("");
  const [eventName, setEventName] = useState("");
  const [portcos, setPortcos] = useState<string[]>([]);
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);

  const existing = campaigns.find((c) => c.id === choice) || null;
  const pick = (id: string) => {
    const next = id || NEW;
    setChoice(next);
    setLegacy("");
    setAutoName("");
    const c = campaigns.find((x) => x.id === next);
    setName(c?.name || "");
    setPurpose(c?.purpose || "");
    setEventName(c?.events[0] || "");
    setPortcos(c?.portcos || []);
    setOwner(c?.owner || "");
  };

  // Campaign labels already on Network / Prospecting records but not yet builder campaigns.
  const builderNames = useMemo(
    () => new Set(campaigns.map((c) => c.name.trim().toLowerCase())),
    [campaigns],
  );
  const legacyLabels = useMemo(() => {
    const counts = new Map<string, number>();
    const add = (v?: string) => {
      const n = (v || "").trim();
      if (!n || builderNames.has(n.toLowerCase())) return;
      counts.set(n, (counts.get(n) || 0) + 1);
    };
    (contactsQ.data || []).forEach((c) => add((c as ContactLike).campaign));
    (targetsQ.data || []).forEach((t) => add((t as TargetLike).campaign));
    return [...counts.entries()].map(([n, count]) => ({ name: n, count }));
  }, [contactsQ.data, targetsQ.data, builderNames]);

  const legacyPeople = useMemo(
    () => (legacy ? labelPeople(legacy, contactsQ.data || [], targetsQ.data || []) : null),
    [legacy, contactsQ.data, targetsQ.data],
  );

  const pickLegacy = (label: string) => {
    pick(NEW);
    setLegacy(label);
    setName(label);
    setPurpose((p) => p || "General outreach");
  };

  const me = userEmail.trim().toLowerCase();
  const visibleList = useMemo(() => {
    const builder = campaigns.map((c) => ({
      key: c.id,
      name: c.name,
      sub: c.purpose || "—",
      count: c.memberCount ?? 0,
      status: c.status as string,
      legacy: false,
      mine: (c.createdBy || "").trim().toLowerCase() === me,
    }));
    const old = legacyLabels
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((l) => ({
        key: `legacy:${l.name}`,
        name: l.name,
        sub: "From Network/Prospecting",
        count: l.count,
        status: "existing",
        legacy: true,
        mine: false,
      }));
    const all = [...builder, ...old];
    return listFilter === "all" ? all : all.filter((x) => (listFilter === "mine" ? x.mine : !x.mine));
  }, [campaigns, legacyLabels, listFilter, me]);

  const nameTaken =
    choice === NEW && campaigns.some((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());

  const attendees = useMemo(
    () => (eventName ? eventAttendees(eventName, contactsQ.data || [], targetsQ.data || []) : null),
    [eventName, contactsQ.data, targetsQ.data],
  );
  const pickEvent = (ev: string) => {
    setEventName(ev);
    if (!ev) return;
    // New campaigns get "<Event> - Follow-up" unless the name was typed by hand.
    if (choice === NEW && !legacy && (!name.trim() || name === autoName)) {
      const auto = /follow/i.test(purpose) || !purpose ? `${ev} - Follow-up` : ev;
      setName(auto);
      setAutoName(auto);
    }
    const a = eventAttendees(ev, contactsQ.data || [], targetsQ.data || []);
    if (a.portcos.length) setPortcos((cur) => Array.from(new Set([...cur, ...a.portcos])));
  };

  const go = async (next: Step) => {
    setBusy(true);
    try {
      const res = await save({
        data: {
          id: existing?.id,
          name: name.trim(),
          purpose,
          events: eventName ? [eventName] : [],
          portcos,
          owner,
          by: userEmail,
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const pre = [...(attendees?.people || []), ...(legacyPeople || [])];
      const prefill = next === "build" && pre.length ? mergeCandidates([], pre).list : undefined;
      onReady({ ...res.campaign, memberCount: existing?.memberCount }, next, prefill);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the campaign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 md:grid-cols-[1fr_320px]">
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div>
          <SectionLabel>Why are you building this campaign?</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {CAMPAIGN_PURPOSES.map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={purpose === p ? "default" : "outline"}
                onClick={() => setPurpose(p)}
              >
                {p}
              </Button>
            ))}
          </div>
        </div>

        {/event/i.test(purpose) && (
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <SectionLabel>Event</SectionLabel>
            <EventPicker value={eventName} onChange={pickEvent} placeholder="Pick the event" />
            {attendees && (
              <div className="text-[11px] text-muted-foreground space-y-1">
                <p>
                  {contactsQ.isLoading || targetsQ.isLoading
                    ? "Counting people tagged to this event…"
                    : `${attendees.people.length} people tagged to this event (${attendees.network} Network, ${attendees.prospect} Prospecting). They'll be pre-loaded into the list.`}
                </p>
                {attendees.portcos.length > 0 && (
                  <p>Portfolio companies: {attendees.portcos.join(", ")}</p>
                )}
                {attendees.people.length > 0 && (
                  <p className="line-clamp-3">
                    {attendees.people.map((p) => p.name).join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {choice && (
          <>
            <div>
              <SectionLabel>Campaign name</SectionLabel>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q4 Security Dinner"
                disabled={!!existing}
              />
              {existing && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Managing an existing campaign. Click <span className="font-medium">New</span> on the right to start a fresh one.
                </p>
              )}
              {legacyPeople && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Existing label from Network/Prospecting · {legacyPeople.length} people will be pre-loaded. Their records stay unchanged.
                </p>
              )}
              {nameTaken && <p className="text-[11px] text-destructive mt-1">That name is already used. Pick it from the list instead.</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {!/event/i.test(purpose) && (
                <div>
                  <SectionLabel>Event (optional)</SectionLabel>
                  <EventPicker value={eventName} onChange={pickEvent} placeholder="Tag an event" />
                </div>
              )}
              <div>
                <SectionLabel>Owner (optional)</SectionLabel>
                <Select value={owner || "none"} onValueChange={(v) => setOwner(v === "none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No owner</SelectItem>
                    {CAMPAIGN_TEAM.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <SectionLabel>Portfolio companies {/portco/i.test(purpose) ? "" : "(optional)"}</SectionLabel>
              <PortcoTagPicker value={portcos} onChange={setPortcos} options={portcoNames} />
            </div>

            {existing && (
              <CampaignOverview
                campaign={existing}
                userEmail={userEmail}
                onDeleted={() => pick("")}
              />
            )}

            <div className="flex justify-end gap-2 pt-2">
              {existing ? (
                <>
                  <Button variant="outline" disabled={busy} onClick={() => void go("build")}>
                    <Plus className="h-4 w-4 mr-1" /> Add more people
                  </Button>
                  <Button disabled={busy || !(existing.memberCount ?? 0)} onClick={() => void go("message")}>
                    {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Action it now <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </>
              ) : (
                <Button disabled={busy || !name.trim() || !purpose || nameTaken} onClick={() => void go("build")}>
                  {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Build the list <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-foreground">Current Campaigns</p>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => pick(NEW)}>
            <Plus className="h-3 w-3 mr-1" /> New
          </Button>
        </div>
        <div className="flex gap-1 mb-2">
          {(["mine", "others", "all"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={listFilter === f ? "default" : "outline"}
              className="h-6 px-2 text-[11px] flex-1"
              onClick={() => setListFilter(f)}
            >
              {f === "mine" ? "My campaigns" : f === "others" ? "Others'" : "All"}
            </Button>
          ))}
        </div>
        {visibleList.length === 0 && (
          <p className="text-xs text-muted-foreground">{loading ? "Loading…" : "No campaigns here."}</p>
        )}
        <div className="space-y-1.5 max-h-[520px] overflow-auto">
          {visibleList.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => (c.legacy ? pickLegacy(c.name) : pick(c.key))}
              className={`w-full text-left rounded-md border px-3 py-2 text-xs hover:bg-muted/50 ${
                (c.legacy ? legacy === c.name : choice === c.key) ? "border-primary" : "border-border"
              }`}
            >
              <div className="font-medium text-foreground truncate">{c.name}</div>
              <div className="flex items-center gap-2 text-muted-foreground mt-0.5">
                <span className="truncate">{c.sub}</span>·<span>{c.count} people</span>
                <Badge variant="outline" className="ml-auto text-[9px] capitalize">
                  {c.status}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Event attendees ────────────────────────────────────────

type ContactLike = {
  name: string; email?: string; title: string; company: string; linkedinUrl?: string; location?: string; address?: string;
  sector: string; urid?: string; eventsAttended?: string[]; eventsInvited?: string[]; campaignEvent?: string;
  portcoTags?: string[]; portCoIntros?: string[]; campaign?: string;
};
type TargetLike = {
  name: string; email: string; title: string; company: string; linkedinUrl: string; location?: string; sector: string;
  urid?: string; event?: string; portcoTags?: string[]; campaign?: string;
};

function eventAttendees(event: string, contacts: ContactLike[], targets: TargetLike[]) {
  const ev = event.trim().toLowerCase();
  const hit = (xs: (string | undefined)[]) => xs.some((x) => (x || "").trim().toLowerCase() === ev);
  const people: CandidatePerson[] = [];
  const portcos = new Set<string>();
  let network = 0;
  let prospect = 0;
  for (const c of contacts) {
    if (!hit([...(c.eventsAttended || []), ...(c.eventsInvited || []), c.campaignEvent])) continue;
    network++;
    (c.portcoTags || []).forEach((p) => p && portcos.add(p));
    people.push({
      name: c.name, email: (c.email || "").split(/[,;]/)[0].trim(), title: c.title, company: c.company,
      linkedin: c.linkedinUrl || "", location: c.location || c.address, sector: c.sector, origin: "network", urid: c.urid,
    });
  }
  for (const t of targets) {
    if (!hit([t.event])) continue;
    prospect++;
    (t.portcoTags || []).forEach((p) => p && portcos.add(p));
    people.push({
      name: t.name, email: t.email, title: t.title, company: t.company, linkedin: t.linkedinUrl,
      location: t.location, sector: t.sector, origin: "prospect", urid: t.urid,
    });
  }
  const merged = mergeCandidates([], people).list;
  return { people: merged, network, prospect, portcos: [...portcos].sort() };
}

/** People on Network/Prospecting carrying a legacy campaign label. */
function labelPeople(label: string, contacts: ContactLike[], targets: TargetLike[]): CandidatePerson[] {
  const l = label.trim().toLowerCase();
  const people: CandidatePerson[] = [];
  for (const c of contacts) {
    if ((c.campaign || "").trim().toLowerCase() !== l) continue;
    people.push({
      name: c.name, email: (c.email || "").split(/[,;]/)[0].trim(), title: c.title, company: c.company,
      linkedin: c.linkedinUrl || "", location: c.location || c.address, sector: c.sector, origin: "network", urid: c.urid,
    });
  }
  for (const t of targets) {
    if ((t.campaign || "").trim().toLowerCase() !== l) continue;
    people.push({
      name: t.name, email: t.email, title: t.title, company: t.company, linkedin: t.linkedinUrl,
      location: t.location, sector: t.sector, origin: "prospect", urid: t.urid,
    });
  }
  return mergeCandidates([], people).list;
}

// ── Campaign overview + delete ─────────────────────────────

function CampaignOverview({
  campaign,
  userEmail,
  onDeleted,
}: {
  campaign: CampaignRecord;
  userEmail: string;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const del = useServerFn(deleteCampaignFn);
  const q = useQuery({
    queryKey: ["campaign-members", campaign.id],
    queryFn: () => fetchCampaignMembers({ data: { campaignId: campaign.id } }),
  });
  const members = q.data || [];
  const s = summarizeMembers(members);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [removeNew, setRemoveNew] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const shown = members.filter((m) =>
    `${m.name} ${m.title} ${m.company} ${m.email}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const fmt = (d: string) => (d ? d.slice(0, 10) : "—");

  const doDelete = async () => {
    setDeleting(true);
    try {
      const r = await del({ data: { id: campaign.id, removeNewProspects: removeNew, by: userEmail } });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `Deleted "${r.name}": ${r.members} people untagged${r.prospectsRemoved ? `, ${r.prospectsRemoved} new prospects removed` : ""}`,
      );
      setOpen(false);
      onDeleted();
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
      await qc.invalidateQueries({ queryKey: ["person-campaigns"] });
      await qc.invalidateQueries({ queryKey: ["campaign-targets"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete campaign");
    } finally {
      setDeleting(false);
    }
  };

  const Stat = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-foreground leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>In this campaign</SectionLabel>
        <span className="text-[11px] text-muted-foreground">
          Created {fmt(campaign.created)}
          {campaign.createdBy ? ` by ${campaign.createdBy}` : ""} · Updated {fmt(campaign.updated)}
        </span>
      </div>
      {q.isLoading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading people…
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="People" value={s.total} sub={`${s.network} Network · ${s.prospect} Prospecting`} />
            <Stat label="Contacted" value={s.contacted} sub={s.total ? `${Math.round((s.contacted / s.total) * 100)}%` : ""} />
            <Stat label="Personalized" value={s.personalized} />
            <Stat
              label="Follow-ups"
              value={s.openFollowUps}
              sub={s.openFollowUps ? `Next ${s.nextFollowUp}${s.followUpOwners.length ? ` · ${s.followUpOwners.join(", ")}` : ""}` : ""}
            />
          </div>
          {members.length > 0 && (
            <>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people in this campaign" className="h-8 text-xs" />
              <div className="max-h-56 overflow-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">Name</th>
                      <th className="text-left px-2 py-1.5 font-medium">Title</th>
                      <th className="text-left px-2 py-1.5 font-medium">Company</th>
                      <th className="text-left px-2 py-1.5 font-medium">From</th>
                      <th className="text-left px-2 py-1.5 font-medium">Contacted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((m) => (
                      <tr key={m.personKey} className="border-t border-border">
                        <td className="px-2 py-1.5 text-foreground">
                          {m.name || m.email}
                          {m.email && <div className="text-[10px] text-muted-foreground">{m.email}</div>}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{m.title || "—"}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{m.company || "—"}</td>
                        <td className="px-2 py-1.5">
                          <Badge variant="outline" className="text-[9px]">
                            {m.kind === "network" ? "Network" : "Prospecting"}
                          </Badge>
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {m.sentDate ? `${fmt(m.sentDate)}${m.sentChannel ? ` · ${m.sentChannel}` : ""}` : "Not yet"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      <div className="flex justify-start">
        <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setConfirmName(""); setRemoveNew(false); } }}>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete campaign
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{campaign.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the campaign and untags all {s.total} people. Their Network and Prospecting records,
                their other campaigns, and outreach already logged are kept.
                {s.openFollowUps > 0 && ` ${s.openFollowUps} follow-ups set by this campaign will stay; clear them on each card if needed.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <label className="flex items-start gap-2 text-xs">
              <Checkbox checked={removeNew} onCheckedChange={(v) => setRemoveNew(!!v)} />
              <span>Also remove prospects this campaign added new (from search or upload) that aren't in any other campaign and were never contacted.</span>
            </label>
            <div>
              <Label className="text-xs">Type the campaign name to confirm</Label>
              <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={campaign.name} />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={deleting || confirmName.trim().toLowerCase() !== campaign.name.trim().toLowerCase()}
                onClick={() => void doDelete()}
              >
                {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Delete campaign
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// ── Step 2 ────────────────────────────────────────────────────

function BuildStep({
  campaign,
  staged,
  memberKeys,
  onStaged,
  onBack,
  onNext,
}: {
  campaign: CampaignRecord;
  staged: CandidatePerson[];
  memberKeys: Set<string>;
  onStaged: (s: CandidatePerson[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [tab, setTab] = useState<"internal" | "external" | "upload">("internal");
  const add = (incoming: CandidatePerson[]) => {
    const r = mergeCandidates(staged, incoming, memberKeys);
    onStaged(r.list);
    toast.success(`${r.added} added${r.skipped ? ` · ${r.skipped} already on the list` : ""}`);
  };
  const counts = staged.reduce<Record<string, number>>((acc, p) => {
    acc[p.origin] = (acc[p.origin] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-foreground">{staged.length} people staged</span>
        {Object.entries(counts).map(([k, v]) => (
          <Badge key={k} variant="outline" className="capitalize">
            {v} {k}
          </Badge>
        ))}
        {memberKeys.size > 0 && <span className="text-muted-foreground">· {memberKeys.size} already in this campaign</span>}
      </div>

      <div className="flex gap-2">
        {(
          [
            ["internal", "Our Network & Prospecting"],
            ["external", "Get more (Sumble / Apollo)"],
            ["upload", "Upload"],
          ] as const
        ).map(([id, label]) => (
          <Button key={id} size="sm" variant={tab === id ? "default" : "outline"} onClick={() => setTab(id)}>
            {label}
          </Button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        {tab === "internal" && <InternalSearch campaign={campaign} onAdd={add} />}
        {tab === "external" && <ExternalSearch onAdd={add} />}
        {tab === "upload" && <UploadPeople onAdd={add} />}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button disabled={staged.length === 0} onClick={onNext}>
          Review list ({staged.length}) <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function InternalSearch({ campaign, onAdd }: { campaign: CampaignRecord; onAdd: (p: CandidatePerson[]) => void }) {
  const contactsQ = useQuery({ queryKey: ["campaign-contacts"], queryFn: () => fetchContacts(), staleTime: 60_000 });
  const targetsQ = useQuery({ queryKey: ["campaign-targets"], queryFn: () => fetchTargets(), staleTime: 60_000 });
  const [useNetwork, setUseNetwork] = useState(true);
  const [useProspects, setUseProspects] = useState(true);
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  const [sector, setSector] = useState("");
  const [location, setLocation] = useState("");
  const [onlyTagged, setOnlyTagged] = useState(false);
  // Nothing is matched until Find is clicked; results use the criteria at that moment.
  const [applied, setApplied] = useState<null | { q: string; title: string; sector: string; location: string; onlyTagged: boolean; net: boolean; pro: boolean }>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const pool = useMemo<CandidatePerson[]>(() => {
    const out: CandidatePerson[] = [];
    if (applied?.net)
      for (const c of contactsQ.data || [])
        out.push({
          name: c.name,
          email: (c.email || "").split(/[,;]/)[0].trim(),
          title: c.title,
          company: c.company,
          linkedin: c.linkedinUrl || "",
          location: c.location || c.address,
          sector: c.sector,
          origin: "network",
          urid: c.urid,
          // tags for filtering
          ...({ _tags: [...(c.eventsAttended || []), ...(c.eventsInvited || []), ...(c.portCoIntros || [])] } as object),
        });
    if (applied?.pro)
      for (const t of targetsQ.data || [])
        out.push({
          name: t.name,
          email: t.email,
          title: t.title,
          company: t.company,
          linkedin: t.linkedinUrl,
          location: t.location,
          sector: t.sector,
          origin: "prospect",
          urid: t.urid,
          ...({ _tags: [t.event || "", ...(t.portcoTags || [])] } as object),
        });
    return out;
  }, [contactsQ.data, targetsQ.data, applied]);

  const tagSet = useMemo(
    () => new Set([...campaign.events, ...campaign.portcos].map((x) => x.toLowerCase())),
    [campaign],
  );
  const filtered = useMemo(() => {
    if (!applied) return [];
    const s = applied.q.trim().toLowerCase();
    const ti = applied.title.trim().toLowerCase();
    const se = applied.sector.trim().toLowerCase();
    const lo = applied.location.trim().toLowerCase();
    const onlyTagged = applied.onlyTagged;
    return pool.filter((p) => {
      if (s && !`${p.name} ${p.company} ${p.email}`.toLowerCase().includes(s)) return false;
      if (ti && !p.title.toLowerCase().includes(ti)) return false;
      if (se && !(p.sector || "").toLowerCase().includes(se)) return false;
      if (lo && !(p.location || "").toLowerCase().includes(lo)) return false;
      if (onlyTagged) {
        const tags = ((p as unknown as { _tags?: string[] })._tags || []).map((x) => x.toLowerCase());
        if (!tags.some((t) => tagSet.has(t))) return false;
      }
      return true;
    });
  }, [pool, applied, tagSet]);

  const keyOf = (p: CandidatePerson) => `${p.origin}:${personKeyOf(p)}`;
  const shown = filtered.slice(0, 300);
  const loading = contactsQ.isLoading || targetsQ.isLoading;
  const strip = (p: CandidatePerson): CandidatePerson => {
    const { ...rest } = p as CandidatePerson & { _tags?: string[] };
    delete (rest as { _tags?: string[] })._tags;
    return rest;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5">
          <Checkbox checked={useNetwork} onCheckedChange={(v) => setUseNetwork(!!v)} /> Network
        </label>
        <label className="flex items-center gap-1.5">
          <Checkbox checked={useProspects} onCheckedChange={(v) => setUseProspects(!!v)} /> Prospecting
        </label>
        {tagSet.size > 0 && (
          <label className="flex items-center gap-1.5">
            <Switch checked={onlyTagged} onCheckedChange={setOnlyTagged} /> People tied to this campaign's event/PortCos
          </label>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-7" placeholder="Name, company, email" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Input placeholder="Title contains" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="Sector contains" value={sector} onChange={(e) => setSector(e.target.value)} />
        <Input placeholder="Location contains" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{!applied ? "Choose where to look and any filters, then click Find." : loading ? "Loading…" : `${filtered.length} match${filtered.length === 1 ? "" : "es"}${filtered.length > 300 ? " (showing 300)" : ""}`}</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!useNetwork && !useProspects}
            onClick={() => {
              setPicked(new Set());
              setApplied({ q, title, sector, location, onlyTagged, net: useNetwork, pro: useProspects });
            }}
          >
            <Search className="h-3.5 w-3.5 mr-1" /> Find
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAdd(filtered.map(strip))} disabled={!filtered.length}>
            Add all {filtered.length}
          </Button>
          <Button
            size="sm"
            disabled={!picked.size}
            onClick={() => {
              onAdd(filtered.filter((p) => picked.has(keyOf(p))).map(strip));
              setPicked(new Set());
            }}
          >
            Add selected ({picked.size})
          </Button>
        </div>
      </div>
      <PeopleTable
        people={shown}
        selectable={{
          isSelected: (p) => picked.has(keyOf(p)),
          toggle: (p) =>
            setPicked((prev) => {
              const n = new Set(prev);
              const k = keyOf(p);
              if (n.has(k)) n.delete(k);
              else n.add(k);
              return n;
            }),
        }}
      />
    </div>
  );
}

const JOB_LEVELS = ["C-Suite", "VP", "Director", "Manager"];

function ExternalSearch({ onAdd }: { onAdd: (p: CandidatePerson[]) => void }) {
  const run = useServerFn(findProspects);
  const [engine, setEngine] = useState<"sumble" | "apollo">("sumble");
  const [focus, setFocus] = useState("");
  const [industry, setIndustry] = useState("");
  const [levels, setLevels] = useState<string[]>(["VP", "Director"]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<CandidatePerson[]>([]);

  const search = async () => {
    setBusy(true);
    try {
      const res = await run({
        data: {
          focus: engine === "sumble" ? focus : "",
          industry: engine === "sumble" ? industry : "",
          jobLevels: levels,
          jobFunctions: engine === "apollo" && focus ? [focus] : undefined,
          companyLimit: 10,
          perCompany: 3,
        },
      });
      if (!res.found) {
        toast.error(res.error || "Search failed");
        return;
      }
      setResults(
        res.prospects.map((p) => ({
          name: p.name,
          email: "",
          title: p.title,
          company: p.company,
          linkedin: p.linkedinUrl || "",
          location: p.location,
          sector: p.industry,
          origin: p.apolloId ? "apollo" : "sumble",
        })),
      );
      if (!res.prospects.length) toast.info("No people found. Try a broader search.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant={engine === "sumble" ? "default" : "outline"} onClick={() => setEngine("sumble")}>
          Sumble (by technology)
        </Button>
        <Button size="sm" variant={engine === "apollo" ? "default" : "outline"} onClick={() => setEngine("apollo")}>
          Apollo (by role)
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          placeholder={engine === "sumble" ? "Technology, e.g. Kubernetes" : "Job function, e.g. Security"}
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
        />
        {engine === "sumble" && (
          <Input placeholder="Industry (optional)" value={industry} onChange={(e) => setIndustry(e.target.value)} />
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {JOB_LEVELS.map((l) => (
            <label key={l} className="flex items-center gap-1">
              <Checkbox
                checked={levels.includes(l)}
                onCheckedChange={(v) => setLevels((prev) => (v ? [...prev, l] : prev.filter((x) => x !== l)))}
              />
              {l}
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-between">
        <Button size="sm" onClick={() => void search()} disabled={busy || (engine === "sumble" && !focus.trim() && !industry.trim())}>
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
          Search
        </Button>
        {results.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => onAdd(results)}>
            Add all {results.length}
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        New people found here are added to Prospecting when you confirm the list. Searches use Sumble or Apollo credits.
      </p>
      {results.length > 0 && <PeopleTable people={results} />}
    </div>
  );
}

function UploadPeople({ onAdd }: { onAdd: (p: CandidatePerson[]) => void }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseCandidateCsv(text), [text]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" asChild>
          <label className="cursor-pointer">
            <Upload className="h-4 w-4 mr-1" /> Choose CSV
            <input
              type="file"
              accept=".csv,text/csv,.tsv,text/plain"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setText(await f.text());
              }}
            />
          </label>
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Or paste below. Needs a header row: name (or first/last), email, company, title, linkedin.
        </span>
      </div>
      <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="name,email,company,title,linkedin" />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{parsed.length} people read</span>
        <Button size="sm" disabled={!parsed.length} onClick={() => onAdd(parsed)}>
          Add {parsed.length}
        </Button>
      </div>
      {parsed.length > 0 && <PeopleTable people={parsed.slice(0, 100)} />}
    </div>
  );
}

function PeopleTable({
  people,
  selectable,
  onRemove,
  badge,
}: {
  people: CandidatePerson[];
  selectable?: { isSelected: (p: CandidatePerson) => boolean; toggle: (p: CandidatePerson) => void };
  onRemove?: (p: CandidatePerson) => void;
  badge?: (p: CandidatePerson) => string;
}) {
  return (
    <div className="max-h-[420px] overflow-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted text-muted-foreground">
          <tr>
            {selectable && <th className="w-8" />}
            <th className="text-left px-2 py-1.5">Name</th>
            <th className="text-left px-2 py-1.5">Title</th>
            <th className="text-left px-2 py-1.5">Company</th>
            <th className="text-left px-2 py-1.5">Email</th>
            <th className="text-left px-2 py-1.5">Source</th>
            {onRemove && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {people.map((p, i) => (
            <tr key={`${personKeyOf(p)}-${i}`} className="border-t border-border">
              {selectable && (
                <td className="px-2">
                  <Checkbox checked={selectable.isSelected(p)} onCheckedChange={() => selectable.toggle(p)} />
                </td>
              )}
              <td className="px-2 py-1.5 font-medium text-foreground">
                {p.name}
                {p.linkedin && (
                  <a href={p.linkedin} target="_blank" rel="noreferrer" className="ml-1 inline-block text-primary">
                    <Linkedin className="h-3 w-3" />
                  </a>
                )}
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">{p.title}</td>
              <td className="px-2 py-1.5">{p.company}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{p.email || "—"}</td>
              <td className="px-2 py-1.5">
                <Badge variant="outline" className="text-[9px] capitalize">
                  {badge ? badge(p) : p.origin}
                </Badge>
              </td>
              {onRemove && (
                <td className="px-2">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onRemove(p)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              )}
            </tr>
          ))}
          {people.length === 0 && (
            <tr>
              <td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">
                No people.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Step 3 ────────────────────────────────────────────────────

function ConfirmStep({
  campaign,
  staged,
  members,
  onStaged,
  userEmail,
  onBack,
  onSaved,
}: {
  campaign: CampaignRecord;
  staged: CandidatePerson[];
  members: CampaignMember[];
  onStaged: (s: CandidatePerson[]) => void;
  userEmail: string;
  onBack: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const save = useServerFn(addCampaignMembers);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [prime, setPrime] = useState("");
  const filtered = staged.filter((p) =>
    `${p.name} ${p.company} ${p.title} ${p.email}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const newCount = staged.filter((p) => p.origin !== "network" && p.origin !== "prospect").length;

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await save({
        data: {
          campaignId: campaign.id,
          campaignName: campaign.name,
          people: staged,
          event: campaign.events[0] || "",
          portcos: campaign.portcos,
          prime,
          by: userEmail,
        },
      });
      toast.success(
        `${res.added} people added to ${campaign.name}${res.newProspects ? ` · ${res.newProspects} new in Prospecting` : ""}`,
      );
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the list");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-7" placeholder="Refine…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <span className="text-xs text-muted-foreground">
            {staged.length} to add · {members.length} already in campaign
          </span>
          {newCount > 0 && (
            <div className="ml-auto flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Contact Prime for {newCount} new prospects</span>
              <Select value={prime || "none"} onValueChange={(v) => setPrime(v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {["Julia", "Hillock", "Falloon", "Shane"].map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <PeopleTable
          people={filtered}
          onRemove={(p) => onStaged(staged.filter((x) => x !== p))}
          badge={(p) => (p.origin === "network" || p.origin === "prospect" ? p.origin : `new · ${p.origin}`)}
        />
        <p className="text-[11px] text-muted-foreground">
          People already in Network or Prospecting stay exactly as they are; only the campaign is added. New people
          are added to Prospecting tagged with this campaign. Earlier campaigns are never removed.
        </p>
      </div>
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Get more people
        </Button>
        <Button disabled={busy || !staged.length} onClick={() => void confirm()}>
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
          Confirm list
        </Button>
      </div>
    </div>
  );
}

// ── Steps 4–5 ─────────────────────────────────────────────────

function ActionSteps({
  step,
  campaign,
  members,
  loadingMembers,
  userEmail,
  onCampaign,
  onStep,
  onMembersChanged,
  onDone,
}: {
  step: Step;
  campaign: CampaignRecord;
  members: CampaignMember[];
  loadingMembers: boolean;
  userEmail: string;
  onCampaign: (c: CampaignRecord) => void;
  onStep: (s: Step) => void;
  onMembersChanged: () => Promise<void>;
  onDone: () => void;
}) {
  const draftFn = useServerFn(draftCampaignTemplate);
  const personalizeFn = useServerFn(personalizeCampaignMessages);
  const saveDraftsFn = useServerFn(saveMemberDrafts);
  const saveCampaign = useServerFn(saveCampaignFn);
  const uploadFn = useServerFn(uploadCampaignAttachment);
  const logSend = useServerFn(logCampaignSend);
  const followFn = useServerFn(setCampaignFollowUps);
  const finishFn = useServerFn(finishCampaign);

  const [channel, setChannel] = useState<CampaignChannel>(campaign.channel || "email");
  const [objective, setObjective] = useState("");
  const [keyMessage, setKeyMessage] = useState("");
  const [tone, setTone] = useState("Warm and professional");
  const [length, setLength] = useState("Short");
  const [eventDetails, setEventDetails] = useState("");
  const [ctas, setCtas] = useState<{ label: string; url: string }[]>([]);
  const [template, setTemplate] = useState<Draft>({
    subject: campaign.templateSubject,
    body: campaign.templateBody,
    linkedin: "",
  });
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const d: Record<string, Draft> = {};
    for (const m of members) if (m.subject || m.body) d[m.personKey] = { subject: m.subject, body: m.body, linkedin: "" };
    return d;
  });
  const [busy, setBusy] = useState<string>("");
  const [useApollo, setUseApollo] = useState(false);
  const [sentNow, setSentNow] = useState<Set<string>>(new Set());
  const [fuAmount, setFuAmount] = useState(1);
  const [fuUnit, setFuUnit] = useState<FollowUpUnit>("weeks");
  const [fuOwner, setFuOwner] = useState(campaign.owner || CAMPAIGN_TEAM[0]);
  const [fuPicked, setFuPicked] = useState<Set<string>>(new Set());

  const draftFor = (m: CampaignMember): Draft =>
    drafts[m.personKey] || {
      subject: fillTemplate(template.subject, m),
      body: fillTemplate(template.body, m),
      linkedin: fillTemplate(template.linkedin, m),
    };

  const runDraft = async () => {
    setBusy("draft");
    try {
      const res = await draftFn({
        data: {
          purpose: campaign.purpose,
          channel,
          objective,
          keyMessage,
          tone,
          length,
          events: campaign.events,
          eventDetails,
          portcos: campaign.portcos,
          ctas: ctas.filter((c) => c.url.trim()),
          senderName: userEmail ? userEmail.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "",
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTemplate({ subject: res.subject, body: res.body, linkedin: res.linkedin });
      setDrafts({});
      await saveCampaign({ data: { id: campaign.id, channel, templateSubject: res.subject, templateBody: res.body, status: "actioning" } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setBusy("");
    }
  };

  const runPersonalize = async () => {
    setBusy("personalize");
    try {
      const next: Record<string, Draft> = { ...drafts };
      for (let i = 0; i < members.length; i += 8) {
        const chunk = members.slice(i, i + 8);
        const res = await personalizeFn({
          data: {
            subject: template.subject,
            body: template.body,
            linkedin: template.linkedin,
            useApollo,
            people: chunk.map((m) => ({
              key: m.personKey,
              name: m.name,
              email: m.email,
              title: m.title,
              company: m.company,
              linkedin: m.linkedin,
            })),
          },
        });
        if (!res.ok) {
          toast.error(res.error);
          break;
        }
        for (const msg of res.messages) {
          const m = chunk.find((x) => x.personKey === msg.key);
          if (!m) continue;
          next[m.personKey] = {
            subject: msg.subject || fillTemplate(template.subject, m),
            body: msg.body || fillTemplate(template.body, m),
            linkedin: msg.linkedin || fillTemplate(template.linkedin, m),
          };
        }
        setDrafts({ ...next });
      }
      await saveDraftsFn({
        data: {
          campaignId: campaign.id,
          drafts: Object.entries(next).map(([personKey, d]) => ({ personKey, subject: d.subject, body: d.body })),
        },
      });
      toast.success("Personalized drafts ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Personalization failed");
    } finally {
      setBusy("");
    }
  };

  const uploadFile = async (f: File) => {
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Files must be under 10 MB.");
      return;
    }
    setBusy("upload");
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const res = await uploadFn({ data: { name: f.name, mimeType: f.type || "application/octet-stream", base64: btoa(bin) } });
      if (!res.ok || !res.url) {
        toast.error(res.ok ? "Upload worked but no link came back." : res.error);
        return;
      }
      setCtas((prev) => [...prev, { label: f.name, url: res.url }]);
      toast.success("File uploaded; link added to your calls to action");
    } finally {
      setBusy("");
    }
  };

  const saveTemplateAndContinue = async () => {
    setBusy("save");
    try {
      await saveCampaign({
        data: { id: campaign.id, channel, templateSubject: template.subject, templateBody: template.body, status: "actioning" },
      });
      onCampaign({ ...campaign, channel, templateSubject: template.subject, templateBody: template.body, status: "actioning" });
      const edited = Object.entries(drafts);
      if (edited.length)
        await saveDraftsFn({
          data: { campaignId: campaign.id, drafts: edited.map(([personKey, d]) => ({ personKey, subject: d.subject, body: d.body })) },
        });
      onStep("send");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy("");
    }
  };

  const doSend = async (m: CampaignMember, ch: "email" | "linkedin") => {
    const d = draftFor(m);
    if (ch === "email") {
      window.location.href = mailtoLink(m.email, d.subject, d.body);
    } else {
      await navigator.clipboard.writeText(d.linkedin || d.body).catch(() => undefined);
      if (m.linkedin) window.open(m.linkedin, "_blank", "noopener");
      toast.success("Message copied. Paste it into LinkedIn.");
    }
    setSentNow((prev) => new Set(prev).add(m.personKey));
    try {
      await logSend({
        data: {
          campaignId: campaign.id,
          campaignName: campaign.name,
          personKey: m.personKey,
          kind: m.kind,
          email: m.email,
          channel: ch,
          portcos: campaign.portcos,
          by: userEmail,
        },
      });
    } catch (e) {
      toast.error(`Couldn't log the send for ${m.name}: ${e instanceof Error ? e.message : "error"}`);
    }
  };

  const applyFollowUps = async () => {
    const people = members.filter((m) => fuPicked.size === 0 || fuPicked.has(m.personKey));
    const due = followUpDueDate(new Date(), fuAmount, fuUnit);
    setBusy("followup");
    try {
      const res = await followFn({
        data: {
          campaignId: campaign.id,
          campaignName: campaign.name,
          owner: fuOwner,
          due,
          people: people.map((m) => ({ personKey: m.personKey, kind: m.kind, email: m.email })),
        },
      });
      toast.success(`Follow-ups set for ${res.set} people, due ${due} (${fuOwner})${res.failed ? ` · ${res.failed} failed` : ""}`);
      await onMembersChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not set follow-ups");
    } finally {
      setBusy("");
    }
  };

  if (loadingMembers) return <p className="text-sm text-muted-foreground">Loading the campaign list…</p>;

  if (step === "message") {
    return (
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div>
            <SectionLabel>Channel</SectionLabel>
            <div className="flex gap-2">
              {(["email", "linkedin", "both"] as const).map((c) => (
                <Button key={c} size="sm" variant={channel === c ? "default" : "outline"} onClick={() => setChannel(c)}>
                  {c === "email" ? "Email" : c === "linkedin" ? "LinkedIn" : "Both"}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <SectionLabel>What's the objective?</SectionLabel>
            <Textarea rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="e.g. Invite CISOs to our Security dinner" />
          </div>
          <div>
            <SectionLabel>What are you trying to say?</SectionLabel>
            <Textarea rows={3} value={keyMessage} onChange={(e) => setKeyMessage(e.target.value)} />
          </div>
          {(campaign.events.length > 0 || /event|follow/i.test(campaign.purpose)) && (
            <div>
              <SectionLabel>Event details {campaign.events[0] ? `· ${campaign.events[0]}` : ""}</SectionLabel>
              <Textarea rows={2} value={eventDetails} onChange={(e) => setEventDetails(e.target.value)} placeholder="Date, place, what happened / what's planned" />
            </div>
          )}
          {campaign.portcos.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Blurbs with website links will be added for: {campaign.portcos.join(", ")}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <SectionLabel>Tone</SectionLabel>
              <Input value={tone} onChange={(e) => setTone(e.target.value)} />
            </div>
            <div>
              <SectionLabel>Length</SectionLabel>
              <Select value={length} onValueChange={setLength}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Short", "Medium", "Detailed"].map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <SectionLabel>Calls to action & links</SectionLabel>
            <div className="space-y-1.5">
              {ctas.map((c, i) => (
                <div key={i} className="flex gap-1.5">
                  <Input
                    className="h-8"
                    placeholder="Label (e.g. RSVP for dinner)"
                    value={c.label}
                    onChange={(e) => setCtas(ctas.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  />
                  <Input
                    className="h-8"
                    placeholder="https://…"
                    value={c.url}
                    onChange={(e) => setCtas(ctas.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCtas(ctas.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setCtas([...ctas, { label: "", url: "" }])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Link
                </Button>
                <Button size="sm" variant="outline" asChild disabled={busy === "upload"}>
                  <label className="cursor-pointer">
                    {busy === "upload" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Paperclip className="h-3.5 w-3.5 mr-1" />}
                    Upload material
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadFile(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </Button>
              </div>
            </div>
          </div>
          <Button className="w-full" onClick={() => void runDraft()} disabled={busy === "draft" || !objective.trim()}>
            {busy === "draft" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
            {template.body ? "Redraft with AI" : "Draft with AI"}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <p className="text-xs font-semibold text-foreground">
              Template <span className="font-normal text-muted-foreground">· use {"{{first_name}}"}, {"{{title}}"}, {"{{company}}"}</span>
            </p>
            {channel !== "linkedin" && (
              <>
                <Input placeholder="Subject" value={template.subject} onChange={(e) => setTemplate({ ...template, subject: e.target.value })} />
                <Textarea rows={10} placeholder="Email body" value={template.body} onChange={(e) => setTemplate({ ...template, body: e.target.value })} />
              </>
            )}
            {channel !== "email" && (
              <Textarea rows={4} placeholder="LinkedIn message" value={template.linkedin} onChange={(e) => setTemplate({ ...template, linkedin: e.target.value })} />
            )}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button size="sm" variant="outline" disabled={!template.body && !template.linkedin || busy === "personalize"} onClick={() => void runPersonalize()}>
                {busy === "personalize" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Personalize for {members.length} people
              </Button>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch checked={useApollo} onCheckedChange={setUseApollo} /> Pull work history from Apollo (uses credits)
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-2 max-h-[520px] overflow-auto">
            <p className="text-xs font-semibold text-foreground">Per-person drafts ({members.length})</p>
            {members.map((m) => {
              const d = draftFor(m);
              return (
                <details key={m.personKey} className="rounded-md border border-border px-3 py-2">
                  <summary className="cursor-pointer text-xs">
                    <b>{m.name}</b> <span className="text-muted-foreground">· {m.title} · {m.company}</span>
                    {drafts[m.personKey] && <Badge variant="outline" className="ml-2 text-[9px]">personalized</Badge>}
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {channel !== "linkedin" && (
                      <>
                        <Input className="h-8" value={d.subject} onChange={(e) => setDrafts({ ...drafts, [m.personKey]: { ...d, subject: e.target.value } })} />
                        <Textarea rows={6} value={d.body} onChange={(e) => setDrafts({ ...drafts, [m.personKey]: { ...d, body: e.target.value } })} />
                      </>
                    )}
                    {channel !== "email" && (
                      <Textarea rows={3} value={d.linkedin} onChange={(e) => setDrafts({ ...drafts, [m.personKey]: { ...d, linkedin: e.target.value } })} />
                    )}
                  </div>
                </details>
              );
            })}
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => onStep("decide")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button disabled={busy === "save" || (!template.body && !template.linkedin)} onClick={() => void saveTemplateAndContinue()}>
              {busy === "save" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Build send links <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // step === "send"
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="w-8" />
              <th className="text-left px-2 py-1.5">Person</th>
              <th className="text-left px-2 py-1.5">Status</th>
              <th className="text-right px-2 py-1.5">Send</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const d = draftFor(m);
              const sent = sentNow.has(m.personKey) || !!m.sentDate;
              return (
                <tr key={m.personKey} className="border-t border-border">
                  <td className="px-2">
                    <Checkbox
                      checked={fuPicked.has(m.personKey)}
                      onCheckedChange={(v) =>
                        setFuPicked((prev) => {
                          const n = new Set(prev);
                          if (v) n.add(m.personKey);
                          else n.delete(m.personKey);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <div className="font-medium text-foreground">{m.name}</div>
                    <div className="text-muted-foreground">
                      {m.title} · {m.company} · <span className="capitalize">{m.kind}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {sent ? (
                      <Badge variant="outline" className="text-[9px]">
                        Sent {m.sentDate || "today"}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Not sent</span>
                    )}
                    {m.followUpDue && <div className="text-[10px] text-muted-foreground mt-0.5">Follow up {m.followUpDue} · {m.followUpOwner}</div>}
                  </td>
                  <td className="px-2 py-2 text-right space-x-1 whitespace-nowrap">
                    {campaign.channel !== "linkedin" && (
                      <>
                        <Button size="sm" variant="outline" className="h-7" disabled={!m.email} onClick={() => void doSend(m, "email")}>
                          <Mail className="h-3.5 w-3.5 mr-1" /> Open email
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Copy email body"
                          onClick={() => {
                            void navigator.clipboard.writeText(d.body);
                            toast.success("Email body copied");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {campaign.channel !== "email" && (
                      <Button size="sm" variant="outline" className="h-7" onClick={() => void doSend(m, "linkedin")}>
                        <Linkedin className="h-3.5 w-3.5 mr-1" /> Copy & open LinkedIn
                        {!m.linkedin && <ExternalLink className="h-3 w-3 ml-1 opacity-40" />}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-end gap-3">
        <div>
          <SectionLabel>Follow up in</SectionLabel>
          <div className="flex gap-1.5">
            <Input type="number" min={1} className="h-8 w-16" value={fuAmount} onChange={(e) => setFuAmount(Number(e.target.value))} />
            <Select value={fuUnit} onValueChange={(v) => setFuUnit(v as FollowUpUnit)}>
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="days">days</SelectItem>
                <SelectItem value="weeks">weeks</SelectItem>
                <SelectItem value="months">months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <SectionLabel>For</SectionLabel>
          <Select value={fuOwner} onValueChange={setFuOwner}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAMPAIGN_TEAM.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" disabled={busy === "followup"} onClick={() => void applyFollowUps()}>
          {busy === "followup" && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Set follow-ups for {fuPicked.size || "everyone"} (due {followUpDueDate(new Date(), fuAmount, fuUnit)})
        </Button>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => onStep("message")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Edit messages
        </Button>
        <Button
          disabled={busy === "finish"}
          onClick={async () => {
            setBusy("finish");
            try {
              await finishFn({ data: { campaignId: campaign.id, by: userEmail } });
              toast.success(`${campaign.name} saved`);
              onDone();
            } finally {
              setBusy("");
            }
          }}
        >
          <Check className="h-4 w-4 mr-1" /> Finish
        </Button>
      </div>
    </div>
  );
}

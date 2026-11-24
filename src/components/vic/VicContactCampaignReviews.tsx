import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Checkbox } from "@/components/ui/checkbox";
import { addContact, addTarget, mergeContactFields } from "@/utils/sheets.functions";
import { fetchMergePreview, mergeContacts } from "@/utils/contact-merge.functions";
import { addCampaignMembers, saveCampaignFn, saveCampaignResults } from "@/utils/campaigns.functions";
import { mergeFields } from "@/lib/contact-merge";
import { CAMPAIGN_PURPOSES, type CampaignChannel } from "@/lib/campaigns";
import { RESULT_LABEL, RESULT_OPTIONS, type CampaignResult } from "@/lib/campaign-results";
import { ApproveRow, Card, field, useApprove } from "./VicReviewCards";

export function AddContactReview({ p }: {
  p: { list: "Network" | "Prospecting"; name: string; title: string; company: string; email: string; phone: string; location: string; linkedinUrl: string; sector: string; prime: string; temperature: string; source: string; reason: string };
}) {
  const saveNet = useServerFn(addContact);
  const savePro = useServerFn(addTarget);
  const [f, setF] = useState(p);
  const a = useApprove();
  const done = a.state === "done";
  const run = async () => {
    if (f.list === "Network") {
      await saveNet({ data: { name: f.name, role: f.title, company: f.company, email: f.email, phone: f.phone, location: f.location, prime: f.prime, sector: f.sector, temperature: f.temperature, source: f.source || "V.I.C.", linkedinUrl: f.linkedinUrl } });
      return `Added ${f.name} to Network (${f.temperature})`;
    }
    const parts = f.name.trim().split(/\s+/);
    const firstName = parts[0] || f.name;
    const lastName = parts.slice(1).join(" ");
    await savePro({ data: { firstName, lastName, company: f.company, role: f.title, linkedin: f.linkedinUrl, email: f.email, phone: f.phone, location: f.location, sector: f.sector, stage: "New", source: f.source || "V.I.C.", researchPurpose: f.reason || "Added via V.I.C.", reasonSurfaced: f.reason } });
    return `Added ${f.name} to Prospecting`;
  };
  return (
    <Card title={`Review: add ${f.name} to ${f.list}`}>
      <div className="grid grid-cols-2 gap-2">
        <select className={field} disabled={done} value={f.list} onChange={(e) => setF({ ...f, list: e.target.value as "Network" | "Prospecting" })}>
          <option value="Network">Network</option><option value="Prospecting">Prospecting</option>
        </select>
        {f.list === "Network" ? (
          <select className={field} disabled={done} value={f.temperature} onChange={(e) => setF({ ...f, temperature: e.target.value })}>
            {["Council", "Hot", "Warm", "Cold"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        ) : <input className={field} disabled={done} value={f.prime} onChange={(e) => setF({ ...f, prime: e.target.value })} placeholder="Owner" />}
        <input className={field} disabled={done} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Full name" />
        <input className={field} disabled={done} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email" />
        <input className={field} disabled={done} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Title" />
        <input className={field} disabled={done} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} placeholder="Company" />
        <input className={field} disabled={done} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Location" />
        <input className={field} disabled={done} value={f.linkedinUrl} onChange={(e) => setF({ ...f, linkedinUrl: e.target.value })} placeholder="LinkedIn URL" />
      </div>
      <ApproveRow a={a} run={run} label={`Add to ${f.list}`} />
    </Card>
  );
}

export function EditContactReview({ p }: {
  p: { urid: string; name: string; currentEmail: string; current: Record<string, string>; proposed: Record<string, string | undefined>; reason: string };
}) {
  const save = useServerFn(mergeContactFields);
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(p.proposed).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v || ""])),
  );
  const a = useApprove();
  const done = a.state === "done";
  const run = async () => {
    const r = await save({ data: { email: p.currentEmail, urid: p.urid, fields: vals, source: "user" } });
    if (!r.success) throw new Error("Couldn't update contact.");
    return `Updated ${p.name}`;
  };
  return (
    <Card title={`Review: edit ${p.name}`}>
      {p.reason && <p className="text-xs text-muted-foreground">{p.reason}</p>}
      <div className="space-y-1.5">
        {Object.entries(vals).map(([k, v]) => (
          <label key={k} className="block text-[11px] text-muted-foreground space-y-0.5">
            <span className="capitalize">{k} (was: {p.current[k] || "blank"})</span>
            <input className={field} disabled={done} value={v} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <ApproveRow a={a} run={run} label="Save contact changes" />
    </Card>
  );
}

export function MergeContactsReview({ p }: {
  p: { urids: string[]; keeperUrid: string; targetStatus: "Council" | "Hot" | "Warm" | "Cold" | "Prospecting"; reason: string; records: Array<{ urid: string; name: string; email: string; company: string; title: string; where: string; status: string }> };
}) {
  const preview = useServerFn(fetchMergePreview);
  const merge = useServerFn(mergeContacts);
  const [keeperUrid, setKeeperUrid] = useState(p.keeperUrid);
  const [status, setStatus] = useState(p.targetStatus);
  const a = useApprove();
  const done = a.state === "done";
  const run = async () => {
    const fresh = await preview({ data: { urids: p.urids } });
    const keeperIndex = Math.max(0, fresh.records.findIndex((r) => r.urid === keeperUrid));
    const choices = Object.fromEntries(mergeFields(fresh.headers, fresh.records, keeperIndex).map((f) => [f.key, f.defaultChoice]));
    const seen = Object.fromEntries(fresh.records.map((r) => [r.urid, r.fingerprint]));
    const res = await merge({ data: { operationId: crypto.randomUUID(), keeperUrid, urids: p.urids, choices, status, seen } });
    const blocked = res.outcomes.find((o) => o.status === "blocked" || o.status === "failed");
    if (blocked) throw new Error(blocked.reason || "Merge blocked.");
    return `Merged ${p.records.length} records into ${p.records.find((r) => r.urid === keeperUrid)?.name || "keeper"} (${status})`;
  };
  return (
    <Card title={`Review: merge ${p.records.length} duplicate records`}>
      {p.reason && <p className="text-xs text-muted-foreground">{p.reason}</p>}
      <div className="space-y-1">
        {p.records.map((r) => (
          <label key={r.urid} className="flex items-center gap-2 text-xs">
            <input type="radio" name={`keep-${p.urids[0]}`} disabled={done} checked={keeperUrid === r.urid} onChange={() => setKeeperUrid(r.urid)} />
            <span className="font-medium">{r.name}</span>
            <span className="text-muted-foreground truncate">{[r.email, r.company, r.status].filter(Boolean).join(" · ")}</span>
          </label>
        ))}
      </div>
      <label className="block text-[11px] text-muted-foreground space-y-0.5">
        <span>Resulting relationship status</span>
        <select className={field} disabled={done} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          {["Council", "Hot", "Warm", "Cold", "Prospecting"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <ApproveRow a={a} run={run} label="Approve merge (undoable)" />
    </Card>
  );
}

export function CreateCampaignReview({ p, me }: {
  p: { name: string; purpose: string; owner: string; channel: CampaignChannel; events: string[]; portcos: string[]; templateSubject: string; templateBody: string };
  me: string;
}) {
  const save = useServerFn(saveCampaignFn);
  const [f, setF] = useState(p);
  const a = useApprove();
  const done = a.state === "done";
  const run = async () => {
    const r = await save({ data: { ...f, status: "draft", by: me } });
    if (!r.ok) throw new Error(r.error);
    return `Created campaign "${r.campaign.name}"`;
  };
  return (
    <Card title="Review: create campaign">
      <input className={field} disabled={done} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Campaign name" />
      <div className="grid grid-cols-3 gap-2">
        <select className={field} disabled={done} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })}>
          {CAMPAIGN_PURPOSES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <input className={field} disabled={done} value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} placeholder="Owner" />
        <select className={field} disabled={done} value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value as CampaignChannel })}>
          <option value="email">Email</option><option value="linkedin">LinkedIn</option><option value="both">Both</option>
        </select>
      </div>
      {f.templateSubject && <input className={field} disabled={done} value={f.templateSubject} onChange={(e) => setF({ ...f, templateSubject: e.target.value })} placeholder="Subject template" />}
      {f.templateBody && <textarea className={`${field} min-h-[70px]`} disabled={done} value={f.templateBody} onChange={(e) => setF({ ...f, templateBody: e.target.value })} />}
      <ApproveRow a={a} run={run} label="Create campaign" />
    </Card>
  );
}

export function AddCampaignMembersReview({ p, me }: {
  p: { campaignId: string; campaignName: string; portcos: string[]; event: string; people: Array<{ urid?: string; name: string; email: string; title: string; company: string; linkedin: string; origin: "network" | "prospect" | "apollo" }> };
  me: string;
}) {
  const add = useServerFn(addCampaignMembers);
  const [picked, setPicked] = useState(() => new Set(p.people.map((_, i) => i)));
  const a = useApprove();
  const run = async () => {
    const people = p.people.filter((_, i) => picked.has(i));
    const r = await add({ data: { campaignId: p.campaignId, campaignName: p.campaignName, people, event: p.event || undefined, portcos: p.portcos, by: me } });
    return `Added ${r.added} to "${p.campaignName}"${r.skipped ? ` (${r.skipped} already in campaign)` : ""}`;
  };
  return (
    <Card title={`Review: add people to "${p.campaignName}"`}>
      <ul className="space-y-1">
        {p.people.map((x, i) => (
          <li key={`${x.email}-${i}`} className="flex items-center gap-2 text-xs">
            <Checkbox checked={picked.has(i)} disabled={a.state === "done"} onCheckedChange={() => setPicked((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })} />
            <span className="font-medium">{x.name}</span>
            <span className="text-muted-foreground truncate">{[x.title, x.company, x.email].filter(Boolean).join(" · ")}</span>
          </li>
        ))}
      </ul>
      {picked.size > 0 && <ApproveRow a={a} run={run} label={`Add ${picked.size} to campaign`} />}
    </Card>
  );
}

export function CampaignResultsReview({ p, me }: {
  p: { campaignId: string; campaignName: string; marks: Array<{ personKey: string; name: string; email: string; result: CampaignResult; followUpDue: string; followUpOwner: string }> };
  me: string;
}) {
  const save = useServerFn(saveCampaignResults);
  const [rows, setRows] = useState(p.marks);
  const [picked, setPicked] = useState(() => new Set(p.marks.map((_, i) => i)));
  const a = useApprove();
  const done = a.state === "done";
  const run = async () => {
    const marks = rows.filter((_, i) => picked.has(i)).map((r) => ({ personKey: r.personKey, result: r.result, followUpDue: r.followUpDue || undefined, followUpOwner: r.followUpOwner || undefined }));
    const res = await save({ data: { campaignId: p.campaignId, by: me, marks } });
    return `Saved ${res.saved} response${res.saved === 1 ? "" : "s"} in "${p.campaignName}"`;
  };
  return (
    <Card title={`Review: update responses in "${p.campaignName}"`}>
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.personKey} className="flex items-center gap-2 text-xs">
            <Checkbox checked={picked.has(i)} disabled={done} onCheckedChange={() => setPicked((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })} />
            <span className="font-medium flex-1 truncate">{r.name}</span>
            <select className="rounded border border-input bg-background px-1.5 py-0.5 text-xs" disabled={done} value={r.result} onChange={(e) => setRows((prev) => prev.map((x, idx) => idx === i ? { ...x, result: e.target.value as CampaignResult } : x))}>
              {RESULT_OPTIONS.map((o) => <option key={o} value={o}>{RESULT_LABEL[o]}</option>)}
            </select>
          </li>
        ))}
      </ul>
      {picked.size > 0 && <ApproveRow a={a} run={run} label={`Save ${picked.size} response${picked.size === 1 ? "" : "s"}`} />}
    </Card>
  );
}
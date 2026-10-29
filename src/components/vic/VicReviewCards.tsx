import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { bulkChangeRelationshipLevels } from "@/utils/relationship-levels.functions";
import { createVicFollowUpFn } from "@/utils/vic.functions";
import { completeHomeNoteFollowUp } from "@/utils/home.functions";
import { completeActionFn } from "@/utils/actions.functions";
import { addPlannerAttendeesFn } from "@/utils/event-planner.functions";

type Temp = "Council" | "Hot" | "Warm" | "Cold";
interface RelProposal {
  change: "promote" | "demote" | "prospecting";
  reason: string;
  contacts: { urid?: string; name: string; email: string; temperature: Temp }[];
}
const LABEL = { promote: "Promote", demote: "Demote", prospecting: "Move to Prospecting" } as const;

/** Review card for a proposed relationship change. Nothing runs until Approve. */
export function RelationshipReview({ proposal }: { proposal: RelProposal }) {
  const run = useServerFn(bulkChangeRelationshipLevels);
  const [picked, setPicked] = useState(() => new Set(proposal.contacts.map((_, i) => i)));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ label: string; status: string; reason: string }[] | null>(null);

  const approve = async () => {
    const contacts = proposal.contacts.filter((_, i) => picked.has(i));
    if (!contacts.length) return;
    setBusy(true);
    try {
      const r = await run({ data: { change: proposal.change, contacts } });
      const outcomes = (r as { outcomes?: { label: string; status: string; reason: string }[] }).outcomes || [];
      setResult(outcomes);
      toast.success(`${LABEL[proposal.change]}: ${outcomes.filter((o) => ["changed", "moved", "already_complete"].includes(o.status)).length} of ${contacts.length} done`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm space-y-2">
      <div className="font-medium">Review: {LABEL[proposal.change]} {proposal.contacts.length} contact{proposal.contacts.length === 1 ? "" : "s"}</div>
      <p className="text-xs text-muted-foreground">{proposal.reason}</p>
      <ul className="space-y-1">
        {proposal.contacts.map((c, i) => {
          const o = result?.find((x) => x.label === c.name);
          return (
            <li key={`${c.email}-${i}`} className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={picked.has(i)}
                disabled={!!result}
                onCheckedChange={() => setPicked((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; })}
              />
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground truncate">{c.email} · {c.temperature}</span>
              {o && <span className="ml-auto text-muted-foreground">{o.status.replace(/_/g, " ")}{o.reason ? ` — ${o.reason}` : ""}</span>}
            </li>
          );
        })}
      </ul>
      {!result && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void approve()} disabled={busy || picked.size === 0}>
            {busy ? "Saving…" : `Approve ${picked.size}`}
          </Button>
          <span className="text-[11px] text-muted-foreground self-center">Runs the normal safe bulk change; logged in Admin.</span>
        </div>
      )}
    </div>
  );
}

export function EmailReview({ draft }: { draft: { to: string[]; subject: string; body: string } }) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const href = `mailto:${draft.to.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm space-y-2">
      <div className="font-medium">Review email draft</div>
      <div className="text-xs text-muted-foreground">To: {draft.to.join(", ") || "(add recipients in Outlook)"}</div>
      <input className="w-full rounded border border-input bg-background px-2 py-1 text-xs" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea className="w-full min-h-[120px] rounded border border-input bg-background px-2 py-1 text-xs" value={body} onChange={(e) => setBody(e.target.value)} />
      <Button size="sm" asChild><a href={href}>Open in Outlook</a></Button>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-card p-3 text-sm space-y-2"><div className="font-medium">{title}</div>{children}</div>;
}
function useApprove() {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [note, setNote] = useState("");
  const go = async (fn: () => Promise<string>) => {
    setState("busy");
    try { const msg = await fn(); setNote(msg); setState("done"); toast.success(msg); }
    catch (e) { setState("idle"); toast.error((e as Error).message || "Couldn't save."); }
  };
  return { state, note, go };
}
function ApproveRow({ a, label }: { a: ReturnType<typeof useApprove>; label: string }) {
  return a.state === "done"
    ? <div className="text-xs text-muted-foreground">✓ {a.note}</div>
    : <Button size="sm" disabled={a.state === "busy"} onClick={() => void a.go(a.run!)}>{a.state === "busy" ? "Saving…" : label}</Button>;
}
const field = "w-full rounded border border-input bg-background px-2 py-1 text-xs";

export function FollowUpReview({ p, me }: { p: { title: string; date: string; owner: string; portco: string; person: string; details: string }; me: string }) {
  const create = useServerFn(createVicFollowUpFn);
  const [f, setF] = useState({ ...p, owner: p.owner || me });
  const [key] = useState(() => crypto.randomUUID());
  const a = useApprove();
  const run = async () => { await create({ data: { ...f, key } }); return `Follow-up added for ${f.owner} on ${f.date}`; };
  const done = a.state === "done";
  return (
    <Card title="Review: new follow-up">
      <input className={field} disabled={done} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <input type="date" className={field} disabled={done} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <input className={field} disabled={done} value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} placeholder="Owner" />
        <input className={field} disabled={done} value={f.portco} onChange={(e) => setF({ ...f, portco: e.target.value })} placeholder="Company" />
        <input className={field} disabled={done} value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })} placeholder="Person" />
      </div>
      <ApproveRow a={{ ...a, run } as never} label="Add follow-up" />
    </Card>
  );
}

export function CompleteFollowUpsReview({ p }: { p: { items: { activityId: string; title: string; due: string }[] } }) {
  const complete = useServerFn(completeHomeNoteFollowUp);
  const [picked, setPicked] = useState(() => new Set(p.items.map((i) => i.activityId)));
  const a = useApprove();
  const run = async () => {
    let ok = 0;
    for (const id of picked) if ((await complete({ data: { activityId: id } })).success) ok++;
    return `${ok} of ${picked.size} follow-ups marked complete`;
  };
  return (
    <Card title={`Review: complete ${p.items.length} follow-up${p.items.length === 1 ? "" : "s"}`}>
      <ul className="space-y-1">{p.items.map((i) => (
        <li key={i.activityId} className="flex items-center gap-2 text-xs">
          <Checkbox checked={picked.has(i.activityId)} disabled={a.state === "done"} onCheckedChange={() => setPicked((s) => { const n = new Set(s); n.has(i.activityId) ? n.delete(i.activityId) : n.add(i.activityId); return n; })} />
          <span className="font-medium">{i.title}</span><span className="text-muted-foreground">{i.due}</span>
        </li>))}
      </ul>
      {picked.size > 0 && <ApproveRow a={{ ...a, run } as never} label={`Complete ${picked.size}`} />}
    </Card>
  );
}

export function LogActionReview({ p, me, threadId }: { p: { subject: string; note: string; portcos: string[]; tracks: ("BD" | "GTM")[]; people: { name: string; email: string }[]; nextFollowUp?: { date: string; note: string } }; me: string; threadId: string }) {
  const log = useServerFn(completeActionFn);
  const [subject, setSubject] = useState(p.subject);
  const [note, setNote] = useState(p.note);
  const a = useApprove();
  const run = async () => {
    await log({ data: { sourceKind: "activity", sourceId: `vic:${threadId}`, mode: "log", subject, note, recipients: p.people, portcos: p.portcos, tracks: p.tracks, actor: me, nextFollowUp: p.nextFollowUp?.date ? p.nextFollowUp : undefined } });
    return "Action logged";
  };
  const done = a.state === "done";
  return (
    <Card title="Review: log action">
      <input className={field} disabled={done} value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea className={`${field} min-h-[70px]`} disabled={done} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="text-xs text-muted-foreground">
        {[p.tracks.join("/"), p.portcos.join(", "), p.people.map((x) => x.name).join(", ")].filter(Boolean).join(" · ")}
        {p.nextFollowUp?.date ? ` · next follow-up ${p.nextFollowUp.date}` : ""}
      </div>
      <ApproveRow a={{ ...a, run } as never} label="Log action" />
    </Card>
  );
}

export function AttendeesReview({ p }: { p: { eventUrid: string; eventName: string; eventDate: string; attendees: { name: string; email: string; kind: string; status: string }[] } }) {
  const add = useServerFn(addPlannerAttendeesFn);
  const [picked, setPicked] = useState(() => new Set(p.attendees.map((_, i) => i)));
  const a = useApprove();
  const run = async () => {
    const rows = p.attendees.filter((_, i) => picked.has(i)).map((x) => ({ ...x, eventUrid: p.eventUrid, date: p.eventDate }));
    const r = await add({ data: { attendees: rows } });
    return `${r.added} added to ${p.eventName}${r.added < rows.length ? ` (${rows.length - r.added} already listed)` : ""}`;
  };
  return (
    <Card title={`Review: add attendees to ${p.eventName}`}>
      <ul className="space-y-1">{p.attendees.map((x, i) => (
        <li key={`${x.email}-${i}`} className="flex items-center gap-2 text-xs">
          <Checkbox checked={picked.has(i)} disabled={a.state === "done"} onCheckedChange={() => setPicked((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })} />
          <span className="font-medium">{x.name}</span><span className="text-muted-foreground truncate">{x.email} · {x.kind} · {x.status}</span>
        </li>))}
      </ul>
      {picked.size > 0 && <ApproveRow a={{ ...a, run } as never} label={`Add ${picked.size}`} />}
    </Card>
  );
}

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createWorkstreamFn } from "@/utils/asana.functions";
import { addPlannerEventsFn, updatePlannerEventFn } from "@/utils/event-planner.functions";
import { DTC_STATUSES, type PlannerEvent } from "@/lib/event-planner";
import { ApproveRow, Card, field, useApprove } from "./VicReviewCards";

export function CreateWorkstreamReview({ p }: { p: { company: string; segment: "GTM" | "BD"; name: string; owner: string } }) {
  const create = useServerFn(createWorkstreamFn);
  const [f, setF] = useState(p);
  const a = useApprove();
  const done = a.state === "done";
  const run = async () => {
    const r = await create({ data: f });
    if (!r.ok) throw new Error(r.error);
    return `Created ${f.segment} workstream "${f.name}" for ${f.company}`;
  };
  return (
    <Card title={`Review: new ${f.segment} workstream`}>
      <div className="grid grid-cols-2 gap-2">
        <input className={field} disabled={done} value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} placeholder="Company" />
        <select className={field} disabled={done} value={f.segment} onChange={(e) => setF({ ...f, segment: e.target.value as "GTM" | "BD" })}>
          <option value="GTM">GTM</option><option value="BD">BD</option>
        </select>
      </div>
      <input className={field} disabled={done} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Workstream name" />
      <input className={field} disabled={done} value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} placeholder="Owner" />
      <ApproveRow a={a} run={run} label="Create workstream" />
    </Card>
  );
}

export function CreateEventReview({ p, me }: {
  p: { name: string; start: string; end: string; location: string; category: string; subcategory: string; dtcStatus: string; owner: string; portcos: string[]; partners: string[]; website: string; notes: string };
  me: string;
}) {
  const add = useServerFn(addPlannerEventsFn);
  const [f, setF] = useState(p);
  const a = useApprove();
  const done = a.state === "done";
  const run = async () => {
    const status = f.dtcStatus === "Declined" ? "Declined" : f.dtcStatus === "Confirmed" || f.dtcStatus === "Completed" ? "Confirmed" : "Potential";
    const res = await add({ data: { by: me, events: [{ ...f, status, source: "V.I.C." }] } });
    return res.added ? `Added event "${f.name}"` : `"${f.name}" already exists in Event Planner`;
  };
  return (
    <Card title="Review: add event to Event Planner">
      <input className={field} disabled={done} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Event name" />
      <div className="grid grid-cols-2 gap-2">
        <input type="date" className={field} disabled={done} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        <input type="date" className={field} disabled={done} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        <input className={field} disabled={done} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Location" />
        <select className={field} disabled={done} value={f.dtcStatus} onChange={(e) => setF({ ...f, dtcStatus: e.target.value })}>
          {DTC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={field} disabled={done} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          {["DTC-led", "Partner-led", "Briefings", "Potential"].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className={field} disabled={done} value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} placeholder="Owner" />
      </div>
      <textarea className={`${field} min-h-[60px]`} disabled={done} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes" />
      <ApproveRow a={a} run={run} label="Add event" />
    </Card>
  );
}

export function UpdateEventReview({ p }: {
  p: { eventUrid: string; eventName: string; expectedUpdated: string; current: Partial<PlannerEvent>; proposed: Partial<PlannerEvent> };
}) {
  const save = useServerFn(updatePlannerEventFn);
  const [f, setF] = useState({
    start: p.proposed.start ?? p.current.start ?? "",
    end: p.proposed.end ?? p.current.end ?? "",
    location: p.proposed.location ?? p.current.location ?? "",
    dtcStatus: p.proposed.dtcStatus ?? p.current.dtcStatus ?? "",
    owner: p.proposed.owner ?? p.current.owner ?? "",
    notes: p.proposed.notes ?? p.current.notes ?? "",
    actionsNeeded: p.proposed.actionsNeeded ?? p.current.actionsNeeded ?? "",
    portcos: (p.proposed.portcos ?? p.current.portcos ?? []).join(", "),
    partners: (p.proposed.partners ?? p.current.partners ?? []).join(", "),
  });
  const a = useApprove();
  const done = a.state === "done";
  const run = async () => {
    const patch: Partial<PlannerEvent> = {};
    if (f.start !== (p.current.start ?? "")) patch.start = f.start;
    if (f.end !== (p.current.end ?? "")) patch.end = f.end;
    if (f.location !== (p.current.location ?? "")) patch.location = f.location;
    if (f.dtcStatus !== (p.current.dtcStatus ?? "")) patch.dtcStatus = f.dtcStatus;
    if (f.owner !== (p.current.owner ?? "")) patch.owner = f.owner;
    if (f.notes !== (p.current.notes ?? "")) patch.notes = f.notes;
    if (f.actionsNeeded !== (p.current.actionsNeeded ?? "")) patch.actionsNeeded = f.actionsNeeded;
    if (f.portcos !== (p.current.portcos ?? []).join(", ")) patch.portcos = f.portcos.split(",").map((x) => x.trim()).filter(Boolean);
    if (f.partners !== (p.current.partners ?? []).join(", ")) patch.partners = f.partners.split(",").map((x) => x.trim()).filter(Boolean);
    if (!Object.keys(patch).length) return "Nothing to change";
    const res = await save({ data: { urid: p.eventUrid, patch, expectedUpdated: p.expectedUpdated } });
    if ("conflict" in res && res.conflict) throw new Error("Event was edited by someone else — ask V.I.C. to refresh and try again.");
    return `Updated "${p.eventName}"`;
  };
  return (
    <Card title={`Review: update event "${p.eventName}"`}>
      <div className="grid grid-cols-2 gap-2">
        <input type="date" className={field} disabled={done} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        <input type="date" className={field} disabled={done} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        <input className={field} disabled={done} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Location" />
        <select className={field} disabled={done} value={f.dtcStatus} onChange={(e) => setF({ ...f, dtcStatus: e.target.value })}>
          <option value="">—</option>{DTC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className={field} disabled={done} value={f.portcos} onChange={(e) => setF({ ...f, portcos: e.target.value })} placeholder="PortCos (comma-separated)" />
        <input className={field} disabled={done} value={f.partners} onChange={(e) => setF({ ...f, partners: e.target.value })} placeholder="Partners (comma-separated)" />
      </div>
      <textarea className={`${field} min-h-[60px]`} disabled={done} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes" />
      <input className={field} disabled={done} value={f.actionsNeeded} onChange={(e) => setF({ ...f, actionsNeeded: e.target.value })} placeholder="Actions needed" />
      <ApproveRow a={a} run={run} label="Save event update" />
    </Card>
  );
}
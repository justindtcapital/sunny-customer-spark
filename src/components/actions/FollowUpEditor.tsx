import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACTION_OWNERS, ownerMatches } from "@/lib/action-owners";
import { teamMemberFor } from "@/lib/user-ownership";
import { useWorkstreams } from "@/lib/use-workstreams";
import type { HomeReminder } from "@/lib/home-momentum";
import { followUpValues } from "@/lib/follow-up-edit";
import { editFollowUpFn } from "@/utils/follow-up-edit.functions";
import { searchPeopleFn } from "@/utils/knowledge.functions";

export function FollowUpEditor({ reminder, onClose }: { reminder: HomeReminder; onClose: () => void }) {
  const [values, setValues] = useState(() => followUpValues(reminder));
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ name: string; email: string; company: string; where: string }[]>([]);
  const save = useServerFn(editFollowUpFn);
  const search = useServerFn(searchPeopleFn);
  const qc = useQueryClient();
  const { workstreams } = useWorkstreams();
  const ownerWorkstreams = workstreams.filter((w) => ownerMatches(w.owner, values.owner))
    .sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name));
  useEffect(() => {
    let live = true;
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(() => { void search({ data: { q: query } }).then((people) => { if (live) setResults(people); }).catch(() => { if (live) setResults([]); }); }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [query, search]);
  const submit = async () => {
    setBusy(true);
    try {
      await save({ data: { id: reminder.id, edit: values } });
      await Promise.all([qc.invalidateQueries({ queryKey: ["my-actions"] }), qc.invalidateQueries({ queryKey: ["home-momentum"] })]);
      toast.success("Action updated"); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save the action"); }
    finally { setBusy(false); }
  };
  return <div className="space-y-3 border-b border-border pb-4" aria-label="Edit action">
    <div className="text-sm font-semibold">Edit action</div>
    <div className="space-y-1"><Label htmlFor="task-title">Title</Label><Input id="task-title" value={values.summary} maxLength={500} onChange={(e) => setValues({ ...values, summary: e.target.value })} /></div>
    <div className="space-y-1"><Label htmlFor="task-details">Details / next steps</Label><Textarea id="task-details" rows={3} maxLength={4000} value={values.details} onChange={(e) => setValues({ ...values, details: e.target.value })} /></div>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="min-w-0 space-y-1"><Label htmlFor="task-due">Due date</Label><Input id="task-due" type="date" value={values.due} onChange={(e) => setValues({ ...values, due: e.target.value })} /></div>
      <div className="min-w-0 space-y-1"><Label>Action owner</Label><Select value={teamMemberFor(values.owner)?.displayName || values.owner} onValueChange={(owner) => setValues({ ...values, owner })}><SelectTrigger aria-label="Action owner" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{ACTION_OWNERS.map((o) => <SelectItem key={o.name} value={o.name}>{o.name}</SelectItem>)}</SelectContent></Select></div>
    </div>
    <div className="space-y-1"><Label htmlFor="task-company">PortCo / Partner / Company</Label><Input id="task-company" value={values.company} onChange={(e) => setValues({ ...values, company: e.target.value })} /></div>
    <div className="space-y-1"><Label>Part of workstream</Label>
      <Select value={values.workstreamGid || "none"} onValueChange={(v) => setValues({ ...values, workstreamGid: v === "none" ? "" : v })}>
        <SelectTrigger aria-label="Part of workstream" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Stands alone</SelectItem>
          {ownerWorkstreams.map((w) => <SelectItem key={w.gid} value={w.gid}>{w.company} – {w.name || w.rawName}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-2"><Label>People connected</Label><div className="flex flex-wrap gap-1">{values.people.map((p, i) => <Button key={`${p.email}:${i}`} size="sm" variant="secondary" className="h-auto max-w-full whitespace-normal text-left" onClick={() => setValues({ ...values, people: values.people.filter((_, n) => n !== i) })}>{p.name || p.email}<X className="ml-1 h-3 w-3 shrink-0" /></Button>)}</div><Input aria-label="Search people" placeholder="Search team, Network or Prospecting" value={query} onChange={(e) => setQuery(e.target.value)} />
      {results.length > 0 && <div className="max-h-40 overflow-y-auto divide-y divide-border border border-border">{results.map((p, i) => <Button key={`${p.email}:${i}`} variant="ghost" className="h-auto w-full justify-start whitespace-normal rounded-none px-2 py-1.5 text-left" onClick={() => { setValues({ ...values, people: [...values.people.filter((x) => p.email ? x.email !== p.email : x.name !== p.name), { name: p.name, email: p.email }] }); setQuery(""); }}><span>{p.name}<span className="ml-2 text-xs text-muted-foreground">{p.where} · {p.company || p.email}</span></span></Button>)}</div>}
    </div>
    <div className="space-y-1"><Label>Activity tracking</Label><div className="flex gap-2">{(["BD", "GTM"] as const).map((t) => <Button key={t} size="sm" variant={values.tracks.includes(t) ? "secondary" : "outline"} onClick={() => setValues({ ...values, tracks: values.tracks.includes(t) ? values.tracks.filter((x) => x !== t) : [...values.tracks, t] })}>{t}</Button>)}</div></div>
    <div className="flex gap-2"><Button size="sm" disabled={busy || !values.summary.trim()} onClick={() => void submit()}><Save className="mr-1 h-3.5 w-3.5" />{busy ? "Saving…" : "Save changes"}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button></div>
  </div>;
}
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { fetchBulkOperations, retryBulkOperation, inspectBulkOperation } from "@/utils/bulk-operations.functions";
import type { BulkOutcome } from "@/lib/bulk-operation";
import { activityEvidence, completeOutcome, type BulkOperation } from "@/lib/bulk-operation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OperationResults } from "./OperationResults";
import { RefreshCw, Wrench, Bug, ChevronDown, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { teamMemberFor } from "@/lib/user-ownership";

export interface ActivityDraftContext { key: string; operationId?: string; page: string; evidence: string; title: string }
export function BulkActivityLog({ onAction }: { onAction: (context: ActivityDraftContext, action: "troubleshoot" | "fix") => void }) {
  const read=useServerFn(fetchBulkOperations), retry=useServerFn(retryBulkOperation), qc=useQueryClient();
  const inspect=useServerFn(inspectBulkOperation);
  const [inspection,setInspection]=useState<{id:string;outcomes:BulkOutcome[]}|null>(null);
  const [inspecting,setInspecting]=useState<string|null>(null);
  async function inspectSaved(id:string) {
    setInspecting(id);
    try { const result=await inspect({data:{id}});setInspection({id,outcomes:result.outcomes}); }
    catch(e) { toast.error(e instanceof Error ? e.message : "Saved state could not be verified; no changes made."); }
    finally {setInspecting(null);}
  }
  const { email }=useAuth();
  const query=useQuery({ queryKey:["bulk-operations"],queryFn:()=>read(),refetchInterval:15000 });
  const [selected,setSelected]=useState<string|null>(null), [confirm,setConfirm]=useState<BulkOperation|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState("all");
  const rows=(query.data || []).filter(o=>status==="all" || o.status===status);
  const action=(op:BulkOperation,mode:"troubleshoot"|"fix")=>onAction({ key:`operation:${op.id}`,operationId:op.id,page:op.page,evidence:activityEvidence(op),title:`Review ${op.kind}` },mode);
  async function runRetry() {
    if (!confirm || busy) return;
    setBusy(true);
    try { await retry({ data:{ id:confirm.id,confirmed:true } });toast.success("Retry finished; saved outcomes refreshed.");setConfirm(null); }
    catch(e) { toast.error(e instanceof Error ? e.message : "Retry unavailable."); }
    finally { await qc.invalidateQueries({ queryKey:["bulk-operations"] });await qc.invalidateQueries({ queryKey:["network-pyramid"] });setBusy(false); }
  }
  return <section aria-label="Bulk operation activity" className="mb-5">
    <div className="flex flex-wrap items-center gap-2 py-3"><h3 className="mr-auto text-sm font-semibold">Bulk operations</h3>
      <select aria-label="Operation status" className="rounded border bg-background p-1 text-xs" value={status} onChange={e=>setStatus(e.target.value)}>{["all","running","pending","succeeded","partial","failed","uncertain"].map(s=><option key={s} value={s}>{s}</option>)}</select>
      <Button variant="outline" size="sm" onClick={()=>void query.refetch()}><RefreshCw className="size-3.5" />Refresh</Button>
    </div>
    {query.isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
    {query.error && <p role="alert" className="text-sm text-destructive">Activity history is unavailable. Please refresh later.</p>}
    {!query.isPending && !query.error && !rows.length && <p className="text-sm text-muted-foreground">No bulk operations recorded yet.</p>}
    <div className="divide-y border-y">{rows.map(op=>{
      const open=selected===op.id;
      const retryable=op.kind==="relationship-change" && !["running","uncertain","succeeded"].includes(op.status) && op.outcomes.some(o=>o.retryable || o.status==="failed") && teamMemberFor(email)?.email===op.actor;
      return <div key={op.id} className={open ? "bg-muted/40" : ""}>
        <Button aria-expanded={open} variant="ghost" className="h-auto w-full justify-start rounded-none py-3 text-left" onClick={()=>setSelected(open?null:op.id)}>
          <ChevronDown className="size-3.5 shrink-0" /><span className="min-w-0 flex-1 whitespace-normal"><span className="block font-medium">{op.summary || op.kind}</span><span className="text-xs text-muted-foreground">{op.actor} · {new Date(op.created_at).toLocaleString()}</span></span><Badge variant="outline">{op.status}</Badge>
        </Button>
        {open && <div className="px-3 pb-4"><div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={()=>action(op,"troubleshoot")}><Wrench className="size-3.5" />Troubleshoot</Button>
          <Button size="sm" variant="outline" onClick={()=>action(op,"fix")}><Bug className="size-3.5" />Create fix request</Button>
          <Button size="sm" variant="outline" disabled={!retryable} title={retryable ? "Retry only unfinished steps" : "No safely retryable items; review saved state or create a fix request."} onClick={()=>setConfirm(op)}><RefreshCw className="size-3.5" />{op.status==="pending" ? "Resume" : "Retry"}</Button>
          {op.kind==="relationship-change" && <Button size="sm" variant="outline" disabled={!!inspecting} onClick={()=>void inspectSaved(op.id)}>{inspecting===op.id ? <Loader2 className="size-3.5 animate-spin"/> : <RefreshCw className="size-3.5"/>}Inspect saved state</Button>}
        </div><OperationResults outcomes={op.outcomes} />
          {inspection?.id===op.id && <div className="mt-4 border-t pt-3"><h4 className="text-sm font-semibold">Saved-state inspection</h4><p className="mt-1 text-xs text-muted-foreground">All original items checked. Inspection does not move contacts, replay writes or release the safety lock.</p><OperationResults outcomes={inspection.outcomes}/></div>}
          <details className="mt-3 text-xs"><summary className="cursor-pointer">Attempt history ({op.attempts.length})</summary>{op.attempts.map((a,i)=><div key={i} className="border-t py-2">{new Date(a.at).toLocaleString()} · {a.status}<ul>{a.outcomes.map((o,j)=><li key={j}>{o.label} · {o.reason}</li>)}</ul></div>)}</details>
        </div>}
      </div>;
    })}</div>
    <Dialog open={!!confirm} onOpenChange={open=>{if(!open&&!busy)setConfirm(null);}}><DialogContent><DialogHeader><DialogTitle>Retry unfinished steps?</DialogTitle></DialogHeader>
      <ul className="max-h-64 overflow-auto text-sm">{confirm?.outcomes.filter(o=>!completeOutcome(o)).map((o,i)=><li key={i} className="border-b py-2">{o.label} {o.from&&`· ${o.from} → ${o.to}`}<p className="text-xs text-muted-foreground">{o.reason}</p></li>)}</ul>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setConfirm(null)}>Cancel</Button><Button disabled={busy} onClick={()=>void runRetry()}>{busy?<Loader2 className="size-4 animate-spin"/>:<RefreshCw className="size-4"/>}Confirm retry</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
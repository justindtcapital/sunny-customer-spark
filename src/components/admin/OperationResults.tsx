import { Button } from "@/components/ui/button";
import type { BulkOutcome } from "@/lib/bulk-operation";
import { completeOutcome } from "@/lib/bulk-operation";
import { CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function OperationResults({ outcomes, operationId, onClose }: { outcomes: BulkOutcome[]; operationId?: string; onClose?: () => void }) {
  return <section aria-label="Bulk action results" className="w-full border-t pt-3">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Bulk action results</h3>
      <div className="flex gap-2">{operationId && <Button asChild variant="outline" size="sm"><Link to="/activity"><ExternalLink className="size-3.5" />Review in Admin</Link></Button>}{onClose && <Button size="sm" variant="ghost" onClick={onClose}>Dismiss</Button>}</div>
    </div>
    <ul className="mt-2 max-h-64 overflow-auto divide-y">{outcomes.map((o,i) => <li key={`${o.key}-${i}`} className="flex items-start gap-2 py-2 text-xs">
      {completeOutcome(o) ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" /> : <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />}
      <div className="min-w-0"><div className="font-medium break-words">{o.label} · {o.status.replaceAll("_"," ")}</div><p className="text-muted-foreground break-words">{o.reason}</p></div>
    </li>)}</ul>
  </section>;
}
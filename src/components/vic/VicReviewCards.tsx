import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { bulkChangeRelationshipLevels } from "@/utils/relationship-levels.functions";

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

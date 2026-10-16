import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { teamMemberFor } from "@/lib/user-ownership";
import { useWorkstreams } from "@/lib/use-workstreams";
import { appendPortcoList } from "@/lib/portco-list";
import { completeActionFn, draftFollowUpFn } from "@/utils/actions.functions";
import { recordEmailSent } from "@/utils/sheets.functions";
import { AppendPortcoListButton } from "./AppendPortcoListButton";

export interface ActionContext {
  sourceKind: "note" | "activity" | "workstream" | "followup";
  sourceId: string;
  title: string;
  text: string;
  nextSteps?: string[];
  people: { name: string; email: string }[];
  portcos: string[];
  tracks?: ("BD" | "GTM")[];
  followUpActivityId?: string;
}

const LABEL = "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground";

export function ActionComposer({ ctx, onClose, onDone }: { ctx: ActionContext | null; onClose: () => void; onDone?: () => void }) {
  const { email } = useAuth();
  const draft = useServerFn(draftFollowUpFn);
  const complete = useServerFn(completeActionFn);
  const { workstreams } = useWorkstreams();
  const portcoOptions = useMemo(() => [...new Set(workstreams.map((w) => w.company).filter(Boolean))].sort(), [workstreams]);
  const [to, setTo] = useState<{ name: string; email: string }[]>([]);
  const [addr, setAddr] = useState("");
  const [portcos, setPortcos] = useState<string[]>([]);
  const [tracks, setTracks] = useState<("BD" | "GTM")[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [nudge, setNudge] = useState("");
  const [busy, setBusy] = useState<"" | "draft" | "send">("");
  const me = teamMemberFor(email);

  const run = async (n?: string) => {
    if (!ctx) return;
    setBusy("draft");
    try {
      const r = await draft({ data: {
        sourceKind: ctx.sourceKind, sourceTitle: ctx.title, sourceText: ctx.text, nextSteps: ctx.nextSteps,
        recipients: ctx.people.map((p) => p.name || p.email), portcos: ctx.portcos,
        senderName: me?.displayName, nudge: n || undefined,
      } });
      if (!r.found) { toast.error(r.error || "Could not draft the follow-up."); return; }
      setSubject(r.subject || `Following up: ${ctx.title}`);
      setBody(r.body || "");
    } catch (e) { console.error(e); toast.error("Drafting failed."); }
    finally { setBusy(""); }
  };

  useEffect(() => {
    if (!ctx) return;
    setTo(ctx.people.filter((p) => p.email && !teamMemberFor(p.email)));
    setPortcos(ctx.portcos.filter(Boolean));
    setTracks(ctx.tracks || []);
    setSubject(""); setBody(""); setNudge("");
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  const send = async () => {
    if (!ctx || !to.length) { toast.error("Add at least one recipient."); return; }
    const url = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to.map((t) => t.email).join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setBusy("send");
    try {
      await Promise.all(to.map((t) => recordEmailSent({ data: { contactEmail: t.email, contactName: t.name, subject, emailType: portcos.length ? "PortCo" : "General", linkedPortcos: portcos } }).catch((e) => console.error(e))));
      await complete({ data: { sourceKind: ctx.sourceKind, sourceId: ctx.sourceId, subject, recipients: to, portcos, tracks, actor: email || "", followUpActivityId: ctx.followUpActivityId } });
      toast.success("Opened Outlook · logged and marked done");
      onDone?.();
      onClose();
    } catch (e) { console.error(e); toast.error("Opened Outlook, but logging failed."); }
    finally { setBusy(""); }
  };

  const addRecipient = () => {
    const m = addr.trim().match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    if (!m) return;
    setTo((x) => (x.some((t) => t.email === m[0]) ? x : [...x, { name: "", email: m[0] }]));
    setAddr("");
  };

  return (
    <Sheet open={!!ctx} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Action Now</SheetTitle>
          <SheetDescription className="text-xs">Based on: {ctx?.title}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-1">
            <Label className={LABEL}>To</Label>
            <div className="flex flex-wrap gap-1">
              {to.map((t) => <Badge key={t.email} variant="secondary" className="gap-1 font-normal">{t.name || t.email}<button type="button" aria-label={`Remove ${t.email}`} onClick={() => setTo((x) => x.filter((y) => y.email !== t.email))}><X className="h-3 w-3" /></button></Badge>)}
            </div>
            <div className="flex gap-2">
              <Input className="h-8 text-sm" placeholder="Add email address" value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRecipient()} />
              <Button size="sm" variant="outline" onClick={addRecipient}>Add</Button>
            </div>
            {ctx?.people.some((p) => !p.email) && <p className="text-[11px] text-muted-foreground">No email on file for: {ctx.people.filter((p) => !p.email).map((p) => p.name).join(", ")}</p>}
          </div>

          <div className="space-y-1">
            <Label className={LABEL}>PortCos</Label>
            <div className="flex flex-wrap gap-1">
              {[...new Set([...portcos, ...portcoOptions])].slice(0, 60).map((p) => (
                <button key={p} type="button" onClick={() => setPortcos((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${portcos.includes(p) ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}>{p}</button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label className={LABEL}>Activity tracking</Label>
            <div className="flex gap-2">
              {(["BD", "GTM"] as const).map((t) => <Button key={t} size="sm" variant={tracks.includes(t) ? "secondary" : "outline"} onClick={() => setTracks((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}>{t}</Button>)}
            </div>
          </div>

          <div className="space-y-1">
            <Label className={LABEL}>Subject</Label>
            <Input className="h-8 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={LABEL}>Email</Label>
            {busy === "draft" && !body ? <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Writing a follow-up from the source…</p>
              : <Textarea className="h-72 text-sm" value={body} onChange={(e) => setBody(e.target.value)} />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input className="h-8 min-w-[180px] flex-1 text-xs" placeholder="Nudge: shorter, more formal, add a PortCo intro…" value={nudge} onChange={(e) => setNudge(e.target.value)} />
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run(nudge)}>{busy === "draft" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}Regenerate</Button>
            <AppendPortcoListButton preselected={portcos} onAppend={(t) => setBody((b) => appendPortcoList(b, t))} />
            <Button size="sm" variant="ghost" onClick={() => setBody("")}>Clear</Button>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!!busy || !to.length || !body.trim()} onClick={() => void send()}>{busy === "send" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}Send via Outlook &amp; complete</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

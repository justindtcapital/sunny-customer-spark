import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarPlus, ClipboardCheck, Loader2, Mail, Mic, RefreshCw, Sparkles, Square, UserPlus, X } from "lucide-react";
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
import { addContact, recordEmailSent } from "@/utils/sheets.functions";
import { searchPeopleFn } from "@/utils/knowledge.functions";
import { transcribeAudioFn } from "@/utils/voice.functions";
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
  const searchPeople = useServerFn(searchPeopleFn);
  const transcribe = useServerFn(transcribeAudioFn);
  const { workstreams } = useWorkstreams();
  const portcoOptions = useMemo(() => [...new Set(workstreams.map((w) => w.company).filter(Boolean))].sort(), [workstreams]);
  const [to, setTo] = useState<{ name: string; email: string }[]>([]);
  const [addr, setAddr] = useState("");
  const [personQ, setPersonQ] = useState("");
  const [personResults, setPersonResults] = useState<{ name: string; email: string; company: string; where: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [portcos, setPortcos] = useState<string[]>([]);
  const [tracks, setTracks] = useState<("BD" | "GTM")[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [nudge, setNudge] = useState("");
  const [busy, setBusy] = useState<"" | "draft" | "send">("");
  const [mode, setMode] = useState<"" | "email" | "log">("");
  const [logNote, setLogNote] = useState("");
  const [recording, setRecording] = useState(false);
  const [fuDate, setFuDate] = useState("");
  const [fuNote, setFuNote] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  // Only pre-write when the source makes the follow-up obvious (notes/emails/follow-ups with content).
  const obvious = (c: ActionContext) => c.sourceKind !== "workstream" && !!(c.text?.trim() || c.nextSteps?.length);
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
    setSubject(""); setBody(""); setNudge(""); setLogNote("");
    setPersonQ(""); setPersonResults([]); setAddingNew(false); setFuDate(""); setFuNote("");
    if (obvious(ctx)) { setMode("email"); void run(); } else setMode("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  // People search across Network + Prospecting.
  useEffect(() => {
    const q = personQ.trim();
    if (q.length < 2) { setPersonResults([]); return; }
    let live = true;
    setSearching(true);
    const t = setTimeout(() => {
      void searchPeople({ data: { q } })
        .then((r) => { if (live) setPersonResults(r.filter((p) => !to.some((x) => x.email && x.email === p.email))); })
        .catch(() => {})
        .finally(() => { if (live) setSearching(false); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [personQ, to, searchPeople]);

  const pickPerson = (p: { name: string; email: string }) => {
    setTo((x) => (x.some((t) => t.email === p.email) ? x : [...x, { name: p.name, email: p.email }]));
    setPersonQ(""); setPersonResults([]);
  };

  const addNewContact = async () => {
    if (!newName.trim()) { toast.error("Enter a name."); return; }
    try {
      await addContact({ data: { name: newName.trim(), role: "", company: newCompany.trim(), email: newEmail.trim(), phone: "", location: "", prime: "", sector: "", temperature: "Cold", source: "Action Now" } });
      pickPerson({ name: newName.trim(), email: newEmail.trim() });
      setAddingNew(false); setNewName(""); setNewEmail(""); setNewCompany("");
      toast.success("Contact added to Network");
    } catch (e) { console.error(e); toast.error("Couldn't add the contact."); }
  };

  // Voice dictate: transcribe, then draft the email from what was said.
  const startDictation = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        if (!blob.size) return;
        setBusy("draft");
        try {
          const buf = await blob.arrayBuffer();
          let bin = ""; const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          const res = await transcribe({ data: { base64: btoa(bin), mimeType: blob.type } });
          if (res.error) { toast.error(res.error); return; }
          setNudge(res.text);
          void run(`Say this: ${res.text}`);
        } catch { toast.error("Couldn't transcribe the recording"); }
        finally { setBusy(""); }
      };
      r.start();
      rec.current = r;
      setRecording(true);
    } catch { toast.error("Microphone access was blocked"); }
  };
  const stopDictation = () => { rec.current?.stop(); setRecording(false); };

  const nextFollowUp = fuDate ? { date: fuDate, note: fuNote.trim() } : undefined;

  const send = async () => {
    if (!ctx || !to.length) { toast.error("Add at least one recipient."); return; }
    const url = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to.map((t) => t.email).join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setBusy("send");
    try {
      await Promise.all(to.map((t) => recordEmailSent({ data: { contactEmail: t.email, contactName: t.name, subject, emailType: portcos.length ? "PortCo" : "General", linkedPortcos: portcos } }).catch((e) => console.error(e))));
      await complete({ data: { sourceKind: ctx.sourceKind, sourceId: ctx.sourceId, subject, recipients: to, portcos, tracks, actor: email || "", followUpActivityId: ctx.followUpActivityId, nextFollowUp } });
      toast.success("Opened Outlook · logged and marked done");
      onDone?.();
      onClose();
    } catch (e) { console.error(e); toast.error("Opened Outlook, but logging failed."); }
    finally { setBusy(""); }
  };

  const logIt = async () => {
    if (!ctx || !logNote.trim()) { toast.error("Describe what you did."); return; }
    setBusy("send");
    try {
      await complete({ data: { sourceKind: ctx.sourceKind, sourceId: ctx.sourceId, subject: subject || logNote.trim().slice(0, 120), recipients: to, portcos, tracks, actor: email || "", followUpActivityId: ctx.followUpActivityId, mode: "log", note: logNote.trim(), nextFollowUp } });
      toast.success("Action logged and marked done");
      onDone?.(); onClose();
    } catch (e) { console.error(e); toast.error("Logging failed."); }
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
            <Label className={LABEL}>What do you want to do?</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={mode === "email" ? "secondary" : "outline"} className="h-auto flex-col items-start gap-0.5 py-2 text-left" onClick={() => setMode("email")}>
                <span className="flex items-center gap-1.5 text-sm"><Mail className="h-4 w-4" />Write an email</span>
                <span className="text-[11px] font-normal text-muted-foreground">Draft and send via Outlook</span>
              </Button>
              <Button variant={mode === "log" ? "secondary" : "outline"} className="h-auto flex-col items-start gap-0.5 py-2 text-left" onClick={() => setMode("log")}>
                <span className="flex items-center gap-1.5 text-sm"><ClipboardCheck className="h-4 w-4" />Log an action</span>
                <span className="text-[11px] font-normal text-muted-foreground">Call, meeting, intro or update</span>
              </Button>
            </div>
          </div>
          {mode && <>
          <div className="space-y-1">
            <Label className={LABEL}>{mode === "log" ? "Who was involved" : "To"}</Label>
            <div className="flex flex-wrap gap-1">
              {to.map((t) => <Badge key={t.email || t.name} variant="secondary" className="gap-1 font-normal">{t.name || t.email}<button type="button" aria-label={`Remove ${t.email || t.name}`} onClick={() => setTo((x) => x.filter((y) => y !== t))}><X className="h-3 w-3" /></button></Badge>)}
            </div>
            <div className="relative">
              <Input className="h-8 text-sm" placeholder="Search Network & Prospecting by name, company or email…" value={personQ} onChange={(e) => setPersonQ(e.target.value)} />
              {searching && <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-muted-foreground" />}
              {personQ.trim().length >= 2 && !searching && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                  {personResults.map((p) => (
                    <button key={p.email || p.name} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => pickPerson(p)}>
                      <span className="min-w-0 truncate">{p.name || p.email}{p.company ? <span className="text-muted-foreground"> · {p.company}</span> : null}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px] font-normal">{p.where}</Badge>
                    </button>
                  ))}
                  <button type="button" className="flex w-full items-center gap-1.5 border-t border-border px-3 py-1.5 text-left text-sm text-primary hover:bg-accent" onClick={() => { setAddingNew(true); setNewName(personQ.trim()); setPersonResults([]); }}>
                    <UserPlus className="h-3.5 w-3.5" />Add "{personQ.trim()}" as a new contact
                  </button>
                </div>
              )}
            </div>
            {addingNew && (
              <div className="space-y-2 rounded-md border border-border p-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input className="h-8 text-sm" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <Input className="h-8 text-sm" placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Input className="h-8 flex-1 text-sm" placeholder="Company" value={newCompany} onChange={(e) => setNewCompany(e.target.value)} />
                  <Button size="sm" onClick={() => void addNewContact()}>Save contact</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAddingNew(false)}>Cancel</Button>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Input className="h-8 text-sm" placeholder="…or add an email address directly" value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRecipient()} />
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

          {mode === "log" ? <>
          <div className="space-y-1">
            <Label className={LABEL}>Title</Label>
            <Input className="h-8 text-sm" placeholder="e.g. Intro call with Dell security team" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={LABEL}>What happened</Label>
            <Textarea className="h-40 text-sm" placeholder="What you did, outcome, next step…" value={logNote} onChange={(e) => setLogNote(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!!busy || !logNote.trim()} onClick={() => void logIt()}>{busy === "send" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ClipboardCheck className="h-4 w-4 mr-1" />}Log &amp; complete</Button>
          </div>
          </> : <>
          <div className="space-y-1">
            <Label className={LABEL}>Subject</Label>
            <Input className="h-8 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className={LABEL}>Email</Label>
            {busy === "draft" && !body ? <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Writing a follow-up from the source…</p>
              : <Textarea className="h-72 text-sm" placeholder="Write your email, or use Draft with AI below." value={body} onChange={(e) => setBody(e.target.value)} />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input className="h-8 min-w-[180px] flex-1 text-xs" placeholder="Nudge: shorter, more formal, add a PortCo intro…" value={nudge} onChange={(e) => setNudge(e.target.value)} />
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run(nudge)}>{busy === "draft" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}{body ? "Regenerate" : "Draft with AI"}</Button>
            <AppendPortcoListButton preselected={portcos} onAppend={(t) => setBody((b) => appendPortcoList(b, t))} />
            <Button size="sm" variant="ghost" onClick={() => setBody("")}>Clear</Button>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!!busy || !to.length || !body.trim()} onClick={() => void send()}>{busy === "send" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}Send via Outlook &amp; complete</Button>
          </div>
          </>}
          </>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Notes Imports — one review inbox for every imported note (Granola, uploads,
// Drive, workstream emails). Notes stay here until reviewed; reviewed notes
// move to History. Granola is pulled only when "Import from Granola" is clicked.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, HelpCircle, History, Loader2, RefreshCw, Upload, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useWorkstreams } from "@/lib/use-workstreams";
import { isWorkstreamCompleted } from "@/lib/workstream-parse";
import {
  fetchNotesInboxFn,
  reopenNoteFn,
  reviewNoteFn,
  searchPeopleFn,
  syncGranolaFn,
  syncDriveNotesFn,
  uploadNoteFn,
} from "@/utils/knowledge.functions";
import type { NoteInboxItem, PersonMatch } from "@/utils/notes-inbox.server";
import { resolveWho } from "@/lib/meeting-roster";
import { teamProfile } from "@/lib/user-ownership";

function Tick({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", ok ? "text-foreground" : "text-muted-foreground")}>
      {ok ? <Check className="h-3.5 w-3.5 text-primary" /> : <X className="h-3.5 w-3.5 text-destructive" />}
      {label}
    </span>
  );
}

function toBase64(buf: ArrayBuffer): string {
  let s = "";
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function NotesImports({ actionOwner = "", kind = "notes", onCount, onItems, onStats, onActionNow, split = false }: {
  actionOwner?: string; kind?: "notes" | "activity"; onCount?: (n: number) => void; onItems?: (items: NoteInboxItem[]) => void;
  onStats?: (stats: { pending: number; reviewed: number }) => void;
  /** My Actions: show an Action Now button per item. */
  onActionNow?: (item: NoteInboxItem) => void;
  /** My Actions: inbox list on the left, selected item's review pane on the right. */
  split?: boolean;
}) {
  const isActivity = kind === "activity";
  const [trackFilter, setTrackFilter] = useState("all");
  const [q, setQ] = useState("");
  const { email } = useAuth();
  const [items, setItems] = useState<NoteInboxItem[]>([]);
  const [granolaConnected, setGranolaConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [history, setHistory] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cbRef = useRef({ onCount, onItems, onStats });
  cbRef.current = { onCount, onItems, onStats };
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, h] = await Promise.all([
        fetchNotesInboxFn({ data: { history, owner: actionOwner || undefined, kind } }),
        history ? Promise.resolve(null) : fetchNotesInboxFn({ data: { history: true, owner: actionOwner || undefined, kind } }),
      ]);
      setItems(r.items);
      if (!history) {
        cbRef.current.onCount?.(r.items.length);
        cbRef.current.onItems?.(r.items);
        cbRef.current.onStats?.({ pending: r.items.length, reviewed: h ? h.items.length : 0 });
      }
      setGranolaConnected(r.granolaConnected);
    } catch (e) {
      toast.error(`Couldn't load notes: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [history, actionOwner, kind]);
  useEffect(() => { void load(); }, [load]);

  async function syncGranola() {
    setBusy("granola");
    try {
      const r = await syncGranolaFn({ data: { importedBy: email || "" } });
      const errs = r.errors.length;
      toast.success(`${r.granolaNotesAdded} new Granola notes imported${errs ? `, ${errs} problems` : ""}.`);
      await load();
    } catch (e) {
      toast.error(`Granola import failed: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  async function syncDrive() {
    setBusy("drive");
    try {
      const r = await syncDriveNotesFn();
      toast.success(`${r.imported} meeting files imported from Drive${r.recordingsFiled ? `, ${r.recordingsFiled} recordings filed` : ""}${r.errors.length ? `, ${r.errors.length} problems` : ""}.`);
      await load();
    } catch (e) {
      toast.error(`Drive import failed: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    setBusy("upload");
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        const buf = await f.arrayBuffer();
        if (f.size > 6_000_000) throw new Error("Too large to drop here — put recordings in the Venture Pulse KB Drive and click Import from Drive");
        const text = /\.(md|txt|markdown|vtt|srt)$/i.test(f.name) || f.type.startsWith("text/") ? new TextDecoder().decode(buf) : "";
        await uploadNoteFn({ data: { name: f.name, text, base64: toBase64(buf), mimeType: f.type || "text/plain", importedBy: email || "" } });
        ok++;
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`);
      }
    }
    if (ok) toast.success(`${ok} note${ok > 1 ? "s" : ""} imported.`);
    setBusy("");
    await load();
  }

  const shown = useMemo(() => items.filter((i) =>
    (trackFilter === "all" || i.track === trackFilter) &&
    (!q.trim() || `${i.title} ${i.portco} ${i.summary}`.toLowerCase().includes(q.trim().toLowerCase())),
  ), [items, trackFilter, q]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{isActivity ? "Activity Review" : "Notes Imports"}</CardTitle>
          <span className="text-xs text-muted-foreground">
            {loading ? "loading…" : history ? `${items.length} reviewed` : `${items.length} to review`}
            {actionOwner ? ` · ${isActivity ? "involving" : "imported by"} ${actionOwner}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={history ? "secondary" : "ghost"} onClick={() => setHistory((h) => !h)}>
            <History className="h-3.5 w-3.5" /> {history ? "Back to inbox" : "Show history"}
          </Button>
          {!isActivity && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            {busy === "upload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload notes
          </Button>}
          {!isActivity && <Button size="sm" variant="outline" disabled={!!busy} onClick={syncDrive}>
            {busy === "drive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Import from Drive
          </Button>}
          {granolaConnected && !isActivity && (
            <Button size="sm" disabled={!!busy} onClick={syncGranola}>
              {busy === "granola" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Import from Granola
            </Button>
          )}
          <input
            ref={fileRef} type="file" multiple accept=".md,.txt,.markdown,.vtt,.srt,.docx,.doc,.pdf,.rtf,text/plain,text/markdown" className="hidden"
            onChange={(e) => { if (e.target.files?.length) void uploadFiles(e.target.files); e.target.value = ""; }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isActivity && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={trackFilter} onValueChange={setTrackFilter}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tracks</SelectItem>
                {TRACKS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input className="h-8 w-64 text-xs" placeholder="Search subject, PortCo, summary" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
        {!history && !isActivity && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files); }}
            className={cn(
              "rounded-md border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground",
              drag && "border-primary bg-primary/5 text-foreground",
            )}
          >
            Drop meeting notes or Meet transcripts here (.docx, .pdf, .txt, .md, .vtt) — they're filed by PortCo and tagged to you
          </div>
        )}
        {!loading && items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {isActivity
              ? history ? "No reviewed activity yet." : "No new tracked emails to review."
              : history ? "No reviewed notes yet." : "Nothing to review. Import from Granola or upload notes."}
          </p>
        )}
        {split ? (() => {
          const sel = shown.find((i) => i.recordId === openId) || shown[0];
          return shown.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-[minmax(280px,2fr)_3fr]">
              <div className="max-h-[75vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
                {shown.map((i) => (
                  <button key={i.recordId} onClick={() => setOpenId(i.recordId)}
                    className={cn("block w-full px-3 py-2 text-left hover:bg-muted/40", sel?.recordId === i.recordId && "bg-secondary/60")}>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="shrink-0 text-[10px]">{isActivity ? i.track || "Email" : i.source}</Badge>
                      {!isActivity && i.track === "Network" && <Badge variant="secondary" className="shrink-0 text-[10px]">NWK</Badge>}
                      <span className="truncate text-sm font-medium">{i.title}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{i.date} · {i.portco || "No PortCo matched"}{i.author ? ` · From ${i.author}` : ""}</div>
                  </button>
                ))}
              </div>
              <div className="max-h-[75vh] overflow-y-auto rounded-md border border-border lg:sticky lg:top-4">
                {sel && (
                  <NoteRow kind={kind} key={sel.recordId} item={sel} open onToggle={() => {}} reviewer={email || ""}
                    onActionNow={onActionNow} onDone={async () => { setOpenId(null); await load(); }} />
                )}
              </div>
            </div>
          );
        })() : (
        <div className="divide-y divide-border rounded-md border border-border">
          {shown.map((i) => (
            <NoteRow
              kind={kind}
              key={i.recordId}
              item={i}
              open={openId === i.recordId}
              onToggle={() => setOpenId((o) => (o === i.recordId ? null : i.recordId))}
              reviewer={email || ""}
              onActionNow={onActionNow}
              onDone={async () => { setOpenId(null); await load(); }}
            />
          ))}
        </div>
        )}
      </CardContent>
    </Card>
  );
}

const TRACKS = ["BD", "GTM", "Workstream", "Network", "News"];

/** PortCo names that appear as whole words in the text (case-insensitive). */
export function detectPortcos(text: string, names: string[]): string[] {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  return names.filter((n) => {
    const k = n.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return k.length >= 3 && t.includes(` ${k} `);
  });
}

function NoteRow({ item, open, onToggle, reviewer, onDone, kind, onActionNow }: {
  kind: "notes" | "activity"; item: NoteInboxItem; open: boolean; onToggle: () => void; reviewer: string; onDone: () => Promise<void>;
  onActionNow?: (item: NoteInboxItem) => void;
}) {
  const { workstreams } = useWorkstreams();
  const portcos = useMemo(() => {
    const set = new Set(workstreams.map((w) => w.company).filter(Boolean));
    for (const c of (item.portco || "").split(/\s*[,;]\s*/)) if (c) set.add(c);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [workstreams, item.portco]);
  // PortCos named in the subject or summary are pre-selected alongside the matched one.
  const detected = useMemo(() => detectPortcos(`${item.title} ${item.summary}`, portcos), [item.title, item.summary, portcos]);
  const [selected, setSelected] = useState<string[]>(() =>
    [...new Set([...(item.portco ? item.portco.split(/\s*[,;]\s*/) : []), ...detectPortcos(`${item.title} ${item.summary}`, [])].filter(Boolean))]);
  const [touched, setTouched] = useState(false);
  const chosen = touched ? selected : [...new Set([...selected, ...detected])];
  const portco = chosen.join(", ");
  const primary = chosen[0] || "";
  const companyWs = useMemo(() => {
    const set = new Set(chosen.map((c) => c.toLowerCase()));
    return workstreams.filter((w) => set.has(w.company.toLowerCase()) && !isWorkstreamCompleted(w));
  }, [workstreams, chosen.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const sugg = item.link && item.link.status !== "ignored" ? item.link : null;
  const suggestedGid = sugg?.workstreamGid && workstreams.some((w) => w.gid === sugg.workstreamGid) ? sugg.workstreamGid : "";
  const [wsChoice, setWsChoice] = useState<string>(suggestedGid || (sugg && !sugg.workstreamGid ? "__suggested_new" : ""));
  const [newName, setNewName] = useState(sugg && !sugg.workstreamGid ? sugg.workstreamName : "");
  const [newSegment, setNewSegment] = useState<"GTM" | "BD">("GTM");
  type RosterRow = { key: string; heard: string; where: string; suggestionId: string; status: "linked" | "add" | "guest" | "skip" | "pending" | "team"; match?: PersonMatch; suggestions: PersonMatch[]; edit: { name: string; email: string; company: string }; editing?: boolean };
  const [roster, setRoster] = useState<RosterRow[]>(() => item.people.map((p) => {
    const known = !!p.email && (p.where === "Network" || p.where === "Prospecting");
    return { key: p.key, heard: p.name || p.email, where: p.where, suggestionId: p.suggestionId, suggestions: p.suggestions || [],
      status: p.where === "Team" ? "team" : known || p.status.startsWith("approved") ? "linked" : "pending",
      match: known ? { name: p.name, email: p.email, company: p.company, where: p.where as PersonMatch["where"] } : undefined,
      edit: { name: p.name, email: p.email, company: p.company } };
  }));
  const me = teamProfile(reviewer)?.displayName || reviewer;
  const label = (r: RosterRow) => r.match?.name || r.edit.name || r.heard;
  const patch = (key: string, v: Partial<RosterRow>) => setRoster((rs) => rs.map((r) => (r.key === key ? { ...r, ...v } : r)));
  const [linking, setLinking] = useState<string | null>(null);
  const [actTracks, setActTracks] = useState<string[]>(() => (item.track === "BD" || item.track === "GTM" ? [item.track] : []));
  type Step = { action: string; who: string; other: string; dueDate: string; portco: string; whoGuess: boolean };
  const [steps, setSteps] = useState<Step[]>(() => item.nextSteps.map((n) => {
    const i = resolveWho(n.who, item.people.map((p) => ({ name: p.name || p.email })));
    const mine = i >= 0 && item.people[i]!.where === "Team" && item.people[i]!.email === teamProfile(reviewer)?.email;
    // Auto-populated owners start as guesses (yellow ?) until the reviewer picks the name.
    return { action: n.action, who: mine ? "__me" : i >= 0 ? item.people[i]!.key : n.who ? "__other" : "", other: i >= 0 ? "" : n.who, dueDate: n.dueDate, portco: "", whoGuess: !!n.who };
  }));
  const setStep = (i: number, v: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...v } : x)));
  const [saving, setSaving] = useState(false);
  const isActivity = kind === "activity";
  const [track, setTrack] = useState(item.track || "BD");
  const isNews = isActivity && track === "News";
  const isNetwork = track === "Network" || item.track === "Network";
  const [folder, setFolder] = useState<"portco" | "operations" | "network" | "investor">(isNetwork ? "network" : "portco");
  const [investor, setInvestor] = useState("");
  const [invQ, setInvQ] = useState("");
  const [invResults, setInvResults] = useState<PersonMatch[]>([]);
  useEffect(() => {
    const q = invQ.trim();
    if (q.length < 2) { setInvResults([]); return; }
    let live = true;
    const t = setTimeout(() => { void searchPeopleFn({ data: { q } }).then((r) => { if (live) setInvResults(r); }).catch(() => {}); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [invQ]);
  const [pq, setPq] = useState("");
  const [results, setResults] = useState<PersonMatch[]>([]);
  useEffect(() => {
    const q = pq.trim();
    if (q.length < 2) { setResults([]); return; }
    let live = true;
    const t = setTimeout(() => { void searchPeopleFn({ data: { q } }).then((r) => { if (live) setResults(r); }).catch(() => {}); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [pq]);


  async function save() {
    setSaving(true);
    try {
      let workstream: { action: "confirm" | "ignore" | "create"; gid?: string; name?: string; segment?: "GTM" | "BD" } | undefined;
      if (wsChoice === "__ignore") workstream = { action: "ignore" };
      else if (wsChoice === "__new" || wsChoice === "__suggested_new") {
        if (!newName.trim()) throw new Error("Type a name for the new workstream");
        workstream = { action: "create", name: newName.trim(), segment: newSegment };
      } else if (wsChoice) workstream = { action: "confirm", gid: wsChoice, name: workstreams.find((w) => w.gid === wsChoice)?.name || "" };
      if (folder === "investor" && !investor.trim()) throw new Error("Pick or type the investor this call was with");
      const live = roster.filter((r) => r.status !== "skip");
      const stepOut = steps.filter((s) => s.action.trim()).map((s) => {
        const r = roster.find((x) => x.key === s.who);
        const mine = s.who === "__me" || (!!r && r.status === "team" && label(r) === me);
        return { action: s.action.trim(), who: r ? label(r) : mine ? me : s.who === "__other" ? s.other.trim() : "", whoEmail: mine ? teamProfile(reviewer)?.email || reviewer : r?.match?.email || r?.edit.email || "", dueDate: s.dueDate, track: mine, portco: s.portco };
      });
      await reviewNoteFn({
        data: {
          recordId: item.recordId, reviewer, portco, workstream: isNews ? undefined : workstream,
          ...(isActivity ? { status: "confirmed" as const, track } : isNetwork ? { track: "Network" } : {}),
          linkContacts: live.filter((r) => r.status === "linked" && r.match?.email).map((r) => r.match!),
          ...(!isActivity ? { folder, activityTracks: actTracks, ...(folder === "investor" ? { investor: investor.trim() } : {}) } : {}),
          addPeople: live.filter((r) => r.status === "add").map((r) => ({ ...r.edit, suggestionId: r.suggestionId || undefined })),
          skipContacts: roster.filter((r) => r.status === "skip" && r.suggestionId).map((r) => r.suggestionId),
          nextSteps: stepOut.map(({ track: _t, ...s }) => s),
          followUps: stepOut.filter((s) => s.track).map((s) => ({ action: s.action, who: s.who, dueDate: s.dueDate, portco: s.portco || undefined })),
        },
      });
      toast.success(isActivity ? (isNews ? "Saved as PortCo news." : "Activity registered.") : "Note reviewed.");
      await onDone();
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function reopen() {
    setSaving(true);
    try { await reopenNoteFn({ data: { recordId: item.recordId } }); await onDone(); } finally { setSaving(false); }
  }

  async function skip() {
    setSaving(true);
    try {
      await reviewNoteFn({
        data: {
          recordId: item.recordId, reviewer, portco: item.portco || "", addPeople: [], skipContacts: [], followUps: [],
          ...(isActivity ? { status: "skipped" as const } : {}),
        },
      });
      toast.success(isActivity ? "Skipped — not counted as activity." : "Note skipped.");
      await onDone();
    } catch (e) {
      toast.error(`Skip failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button className="flex min-w-[260px] flex-1 items-center gap-2 text-left" onClick={onToggle}>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", !open && "-rotate-90")} />
          <Badge variant="outline" className="shrink-0 text-[10px]">{isActivity ? item.track || "Email" : item.source}</Badge>
          {!isActivity && item.track === "Network" && <Badge variant="secondary" className="shrink-0 text-[10px]">NWK</Badge>}
          <div>
            <div className="text-sm font-medium">{item.title}</div>
            <div className="text-xs text-muted-foreground">{item.date} · {item.portco || "No PortCo matched"}{item.author ? ` · From ${item.author}` : ""}</div>
          </div>
        </button>
        {!isActivity && <Tick ok={item.saved} label="Saved" />}
        {!isActivity && <Tick ok={item.copiedToDrive} label="Copied to Drive" />}
        {isActivity && item.review && (
          <Badge variant={item.review.status === "skipped" ? "outline" : "secondary"} className="text-[10px]">
            {item.review.status === "skipped" ? "Skipped" : "Confirmed"}
          </Badge>
        )}
        {item.source === "Granola" && <Tick ok={item.hasTranscript} label="Transcript included" />}
        {item.source === "Granola" && <Tick ok={item.safeToDelete} label="Safe to delete" />}
        <div className="flex gap-2 text-xs">
          {item.driveUrl && (
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href={item.driveUrl} target="_blank" rel="noreferrer">
              Drive <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {item.sourceUrl && item.source !== "Upload" && (
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href={item.sourceUrl} target="_blank" rel="noreferrer">
              {item.source} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {onActionNow && <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => onActionNow(item)}><Zap className="h-3.5 w-3.5 mr-1" />Action Now</Button>}
      </div>

      {open && (
        <div className="mt-3 space-y-4 rounded-md bg-muted/30 p-3 text-sm">
          {item.summary && <p className="text-muted-foreground">{item.summary}</p>}

          {item.review ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>Reviewed {item.review.reviewedAt.slice(0, 10)} by {item.review.reviewedBy || "—"}</span>
              {item.review.track && <span>Track: {item.review.track}</span>}
              {item.review.filedTo && <span>Filed to: {item.review.filedTo}</span>}
              <span>Workstream: {item.review.workstream || "—"}</span>
              <span>Contacts added: {item.review.contactsAdded}</span>
              <span>Follow-ups: {item.review.followUps}</span>
              <Button size="sm" variant="outline" disabled={saving} onClick={reopen}>Reopen</Button>
            </div>
          ) : (
            <>
              {!isActivity && item.driveUrl && (
                <section className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">File to</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {([["portco", "PortCo folder"], ["operations", "PortCo Operations"], ["network", "Network Updates"], ["investor", "Investor Call"]] as const).map(([k, l]) => (
                      <Button key={k} size="sm" variant={folder === k ? "default" : "outline"} onClick={() => setFolder(k)}>{l}</Button>
                    ))}
                  </div>
                  {folder === "investor" && (
                    <div className="relative flex flex-wrap items-center gap-2">
                      <Input className="h-8 w-64 text-xs" placeholder="Investor name — search or type" value={investor || invQ}
                        onChange={(e) => { setInvestor(""); setInvQ(e.target.value); }} />
                      {investor && <Badge variant="secondary" className="text-[10px]">Files to Investor Updates/{investor}</Badge>}
                      {!investor && invResults.length > 0 && (
                        <div className="absolute z-20 top-8 max-h-56 w-64 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
                          {invResults.map((m) => (
                            <button key={`inv:${m.email || m.name}`} type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                              onClick={() => { setInvestor(m.name || m.email); setInvQ(""); setInvResults([]); }}>
                              <span className="flex-1 truncate">{m.name || m.email} <span className="text-muted-foreground">{m.company}</span></span>
                              <Badge variant="outline" className="text-[10px]">{m.where}</Badge>
                            </button>
                          ))}
                        </div>
                      )}
                      {!investor && invQ.trim().length >= 2 && (
                        <Button size="sm" variant="outline" className="h-7" onClick={() => { setInvestor(invQ.trim()); setInvQ(""); setInvResults([]); }}>Use "{invQ.trim()}"</Button>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Waits in Unfiled Documents until you confirm. The original author stays on the file.</p>
                </section>
              )}
              {!isActivity && (
                <section className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity tracking</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {(["BD", "GTM"] as const).map((t) => (
                      <Button key={t} size="sm" variant={actTracks.includes(t) ? "default" : "outline"}
                        onClick={() => setActTracks((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}>{t}</Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Counts this meeting as BD and/or GTM activity for its PortCo. Pick both if it was both.</p>
                </section>
              )}
              {isActivity && (
                <section className="space-y-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Track</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {TRACKS.map((t) => (
                      <Button key={t} size="sm" variant={track === t ? "default" : "outline"} onClick={() => setTrack(t)}>{t}</Button>
                    ))}
                  </div>
                  {isNews && <p className="text-xs text-muted-foreground">News is saved as PortCo knowledge, not activity. Just confirm the PortCo.</p>}
                </section>
              )}
              <section className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isNews ? "PortCo" : "PortCo & workstream"}</h4>
                <div className="flex flex-wrap items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-60 justify-between text-xs font-normal">
                        <span className="truncate">{chosen.length ? chosen.join(", ") : "Pick PortCos"}</span>
                        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-1" align="start">
                      <div className="max-h-72 overflow-y-auto">
                        {portcos.map((c) => {
                          const on = chosen.includes(c);
                          return (
                            <button key={c} type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                              onClick={() => { setTouched(true); setSelected(on ? chosen.filter((x) => x !== c) : [...chosen, c]); }}>
                              <span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-border", on && "bg-primary text-primary-foreground")}>
                                {on && <Check className="h-3 w-3" />}
                              </span>
                              {c}
                              {detected.includes(c) && <span className="ml-auto text-[10px] text-muted-foreground">mentioned</span>}
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                  {!isNews && <Select value={wsChoice} onValueChange={setWsChoice} disabled={!primary}>
                    <SelectTrigger className="h-8 w-80 text-xs"><SelectValue placeholder={primary ? "Pick workstream" : "Pick a PortCo first"} /></SelectTrigger>
                    <SelectContent>
                      {suggestedGid && (
                        <SelectItem value={suggestedGid}>★ Suggested · {sugg!.workstreamName}</SelectItem>
                      )}
                      {sugg && !sugg.workstreamGid && (
                        <SelectItem value="__suggested_new">★ Suggested (new) · {sugg.workstreamName}</SelectItem>
                      )}
                      {companyWs.filter((w) => w.gid !== suggestedGid).map((w) => (
                        <SelectItem key={w.gid} value={w.gid}>{chosen.length > 1 ? `${w.company} · ` : ""}{w.segment} · {w.name}</SelectItem>
                      ))}
                      <SelectItem value="__new">+ New workstream (adds to Asana under {primary || "PortCo"})</SelectItem>
                      <SelectItem value="__ignore">Not workstream-related</SelectItem>
                    </SelectContent>
                  </Select>}
                  {!isNews && (wsChoice === "__new" || wsChoice === "__suggested_new") && (
                    <>
                      <Select value={newSegment} onValueChange={(v) => setNewSegment(v as "GTM" | "BD")}>
                        <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GTM">GTM</SelectItem>
                          <SelectItem value="BD">BD</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input className="h-8 w-60 text-xs" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New workstream name" />
                    </>
                  )}
                </div>
              </section>

              {!isNews && <section className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">People in this meeting</h4>
                <p className="text-xs text-muted-foreground">Linked people get this {isActivity ? "email" : "note"} on their contact card{isNetwork ? " as a Network conversation" : ""} and can be assigned next steps.</p>
                {roster.length === 0 && <p className="text-xs text-muted-foreground">No people found — search below to add someone.</p>}
                {roster.map((r) => (
                  <div key={r.key} className={`space-y-1 rounded border border-border px-2 py-1.5 text-xs ${r.status === "skip" ? "opacity-50" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex-1">
                        <span className="font-medium">{label(r)}</span>
                        {r.match ? <span className="text-muted-foreground"> {r.match.company && `· ${r.match.company}`}</span> : r.edit.email && <span className="text-muted-foreground"> {r.edit.email}</span>}
                        {r.match && r.heard && r.heard.toLowerCase() !== r.match.name.toLowerCase() && <span className="text-muted-foreground"> (heard as "{r.heard}")</span>}
                      </span>
                      {(r.status === "team" || r.status === "linked") && <Check className="h-3.5 w-3.5 text-green-600" aria-label="Confirmed" />}
                      {r.status === "pending" && <HelpCircle className="h-3.5 w-3.5 text-yellow-500" aria-label="Needs matching" />}
                      {r.status === "team" && <Badge variant="secondary" className="text-[10px]">{label(r) === me ? "You" : "Team"}</Badge>}
                      {r.status === "linked" && <Badge variant="secondary" className="text-[10px]">{r.match?.where || "Added"}</Badge>}
                      {r.status === "add" && <Badge variant="secondary" className="text-[10px]">Will add to contacts</Badge>}
                      {r.status === "guest" && <Badge variant="outline" className="text-[10px]">Guest</Badge>}
                      {r.status === "skip" && <Badge variant="outline" className="text-[10px]">Skipped</Badge>}
                      {r.status === "pending" && <Badge variant="outline" className="text-[10px]">Not matched</Badge>}
                      {r.status !== "team" && <><Button size="sm" variant={linking === r.key ? "secondary" : "outline"} onClick={() => { setLinking(linking === r.key ? null : r.key); setPq(r.status === "pending" && !/^speaker/i.test(r.heard) ? r.heard : ""); }}>{r.status === "linked" ? "Change" : "Search"}</Button>
                      {r.status !== "linked" && <Button size="sm" variant={r.status === "add" ? "secondary" : "outline"} onClick={() => patch(r.key, { status: r.status === "add" ? "pending" : "add", editing: r.status !== "add" })}>Add to contacts</Button>}
                      <Button size="sm" variant={r.editing ? "secondary" : "ghost"} onClick={() => patch(r.key, { editing: !r.editing })}>Edit</Button>
                      {r.status !== "guest" && <Button size="sm" variant="ghost" onClick={() => patch(r.key, { status: "guest", match: undefined, editing: false })}>Guest</Button>}
                      <Button size="sm" variant="ghost" onClick={() => patch(r.key, { status: r.status === "skip" ? "pending" : "skip", editing: false })}>{r.status === "skip" ? "Undo" : "Skip"}</Button></>}
                    </div>
                    {r.status === "pending" && r.suggestions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pl-2">
                        <span className="text-muted-foreground">Did you mean</span>
                        {r.suggestions.map((s) => (
                          <Button key={s.email || s.name} size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => patch(r.key, { status: "linked", match: s })}>
                            <HelpCircle className="h-3 w-3 text-yellow-500" /> {s.name}{s.company && ` · ${s.company}`}
                          </Button>
                        ))}
                      </div>
                    )}
                    {r.editing && (
                      <div className="flex flex-wrap items-center gap-2 pl-2">
                        {(["name", "email", "company"] as const).map((f) => (
                          <Input key={f} className="h-7 w-44 text-xs" placeholder={f[0]!.toUpperCase() + f.slice(1)} value={r.edit[f]}
                            onChange={(e) => patch(r.key, { edit: { ...r.edit, [f]: e.target.value } })} />
                        ))}
                        <Button size="sm" variant="outline" className="h-7" disabled={!r.edit.name.trim()}
                          onClick={() => { setLinking(r.key); setPq(r.edit.name.trim()); }}>Search this name</Button>
                      </div>
                    )}
                  </div>
                ))}
                <div className="relative w-80">
                  <Input className="h-8 text-xs" placeholder={linking ? `Find who "${roster.find((x) => x.key === linking)?.heard}" is…` : "Add someone: search Network & Prospecting"} value={pq} onChange={(e) => setPq(e.target.value)} />
                  {results.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
                      {results.map((m) => (
                        <button key={`${m.where}:${m.email || m.name}`} type="button" disabled={!m.email}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                          onClick={() => {
                            if (linking) patch(linking, { status: "linked", match: m, editing: false });
                            else if (!roster.some((x) => x.match?.email === m.email)) setRoster((rs) => [...rs, { key: `added:${m.email}`, heard: m.name, where: m.where, suggestionId: "", suggestions: [], status: "linked", match: m, edit: { name: m.name, email: m.email, company: m.company } }]);
                            setLinking(null); setPq(""); setResults([]);
                          }}>
                          <span className="flex-1 truncate">{m.name || m.email} <span className="text-muted-foreground">{m.company}</span></span>
                          <Badge variant="outline" className="text-[10px]">{m.email ? m.where : "No email"}</Badge>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>}

              {!isNews && <section className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next steps</h4>
                <p className="text-xs text-muted-foreground">Saved with the note and shown on PortCo and contact pages. Steps assigned to you go on your calendar.{!isActivity && folder !== "portco" ? " Tag each step to its own PortCo." : ""}</p>
                {steps.length === 0 && <p className="text-xs text-muted-foreground">None found.</p>}
                {steps.map((s, i) => {
                  const confirmed = roster.filter((r) => (r.status === "linked" || r.status === "team" || r.status === "add") && label(r) !== me);
                  const guessedKey = s.whoGuess && s.who && s.who !== "__me" && s.who !== "__other" ? s.who : "";
                  const guessedRow = guessedKey ? roster.find((r) => r.key === guessedKey) : undefined;
                  const options = guessedRow && !confirmed.some((r) => r.key === guessedRow.key) ? [...confirmed, guessedRow] : confirmed;
                  return (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                    <Input className="h-7 min-w-[220px] flex-1 text-xs" title={s.action} value={s.action} onChange={(e) => setStep(i, { action: e.target.value })} />
                    {!isActivity && (folder !== "portco" || chosen.length > 1) && (
                      <Select value={s.portco || "__none"} onValueChange={(v) => setStep(i, { portco: v === "__none" ? "" : v })}>
                        <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="PortCo" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">No PortCo</SelectItem>
                          {(chosen.length ? chosen : portcos).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    <Select value={s.who || "__none"} onValueChange={(v) => setStep(i, { who: v === "__none" ? "" : v, whoGuess: false })}>
                      <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="Assigned" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Unassigned</SelectItem>
                        {reviewer && <SelectItem value={`__me`}>{me} (me)</SelectItem>}
                        {options.map((r) => <SelectItem key={r.key} value={r.key}>{label(r)}</SelectItem>)}
                        <SelectItem value="__other">Other…</SelectItem>
                      </SelectContent>
                    </Select>
                    {s.who && s.who !== "__none" && (s.whoGuess ? (
                      <button type="button" title="Guessed from the notes — click to confirm" onClick={() => setStep(i, { whoGuess: false })}>
                        <HelpCircle className="h-3.5 w-3.5 text-yellow-500" />
                      </button>
                    ) : (
                      <Check className="h-3.5 w-3.5 text-green-600" aria-label="Confirmed" />
                    ))}
                    {s.who === "__other" && <Input className="h-7 w-32 text-xs" placeholder="Name" value={s.other} onChange={(e) => setStep(i, { other: e.target.value })} />}
                    {s.who === "__me" && <Input type="date" className="h-7 w-36 text-xs" title="Due date — goes on your calendar" value={s.dueDate} onChange={(e) => setStep(i, { dueDate: e.target.value })} />}
                    <button type="button" aria-label="Remove next step" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                  </div>
                  );
                })}
                <Button size="sm" variant="ghost" onClick={() => setSteps((x) => [...x, { action: "", who: "", other: "", dueDate: "", portco: "", whoGuess: false }])}>+ Next step</Button>
              </section>}

              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" disabled={saving} onClick={skip}>Skip</Button>
                <Button size="sm" disabled={saving} onClick={save}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {isActivity ? "Confirm" : "Mark reviewed"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Notes Imports — one review inbox for every imported note (Granola, uploads,
// Drive, workstream emails). Notes stay here until reviewed; reviewed notes
// move to History. Granola is pulled only when "Import from Granola" is clicked.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, History, Loader2, RefreshCw, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useWorkstreams } from "@/lib/use-workstreams";
import {
  fetchNotesInboxFn,
  reopenNoteFn,
  reviewNoteFn,
  syncGranolaFn,
  uploadNoteFn,
} from "@/utils/knowledge.functions";
import type { NoteInboxItem } from "@/utils/notes-inbox.server";

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

export function NotesImports({ actionOwner = "", kind = "notes", onCount }: {
  actionOwner?: string; kind?: "notes" | "activity"; onCount?: (n: number) => void;
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchNotesInboxFn({ data: { history, owner: actionOwner || undefined, kind } });
      setItems(r.items);
      if (!history) onCount?.(r.items.length);
      setGranolaConnected(r.granolaConnected);
    } catch (e) {
      toast.error(`Couldn't load notes: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [history, actionOwner, kind, onCount]);
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

  async function uploadFiles(files: FileList | File[]) {
    setBusy("upload");
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        const buf = await f.arrayBuffer();
        const text = /\.(md|txt|markdown)$/i.test(f.name) || f.type.startsWith("text/") ? new TextDecoder().decode(buf) : "";
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
          {granolaConnected && !isActivity && (
            <Button size="sm" disabled={!!busy} onClick={syncGranola}>
              {busy === "granola" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Import from Granola
            </Button>
          )}
          <input
            ref={fileRef} type="file" multiple accept=".md,.txt,.markdown,text/plain,text/markdown" className="hidden"
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
            Drop meeting notes here (.md or .txt)
          </div>
        )}
        {!loading && items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {isActivity
              ? history ? "No reviewed activity yet." : "No new tracked emails to review."
              : history ? "No reviewed notes yet." : "Nothing to review. Import from Granola or upload notes."}
          </p>
        )}
        <div className="divide-y divide-border rounded-md border border-border">
          {shown.map((i) => (
            <NoteRow
              kind={kind}
              key={i.recordId}
              item={i}
              open={openId === i.recordId}
              onToggle={() => setOpenId((o) => (o === i.recordId ? null : i.recordId))}
              reviewer={email || ""}
              onDone={async () => { setOpenId(null); await load(); }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const TRACKS = ["BD", "GTM", "Workstream", "News"];

function NoteRow({ item, open, onToggle, reviewer, onDone, kind }: {
  kind: "notes" | "activity"; item: NoteInboxItem; open: boolean; onToggle: () => void; reviewer: string; onDone: () => Promise<void>;
}) {
  const { workstreams } = useWorkstreams();
  const portcos = useMemo(() => {
    const set = new Set(workstreams.map((w) => w.company).filter(Boolean));
    if (item.portco) set.add(item.portco);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [workstreams, item.portco]);
  const [portco, setPortco] = useState(item.portco || "");
  const companyWs = useMemo(
    () => workstreams.filter((w) => w.company.toLowerCase() === portco.toLowerCase() && !/complete/i.test(w.workstreamStatus || "")),
    [workstreams, portco],
  );
  const suggestedGid = item.link?.workstreamGid && companyWs.some((w) => w.gid === item.link!.workstreamGid) ? item.link.workstreamGid : "";
  const [wsChoice, setWsChoice] = useState<string>(suggestedGid || (item.link && !item.link.workstreamGid ? "__new" : ""));
  const [newName, setNewName] = useState(item.link && !item.link.workstreamGid ? item.link.workstreamName : "");
  const [newSegment, setNewSegment] = useState<"GTM" | "BD">("GTM");
  const [people, setPeople] = useState<Record<string, "add" | "skip" | "">>({});
  const [edits, setEdits] = useState<Record<string, { name: string; email: string; company: string }>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [fu, setFu] = useState<Record<number, { due?: string; action?: string; who?: string }>>({});
  const [saving, setSaving] = useState(false);
  const isActivity = kind === "activity";
  const [track, setTrack] = useState(item.track || "BD");
  const isNews = isActivity && track === "News";

  function editedPerson(p: NoteInboxItem["people"][number]) {
    const e = edits[p.key];
    return { name: e?.name ?? p.name, email: e?.email ?? p.email, company: e?.company ?? p.company, suggestionId: p.suggestionId || undefined };
  }

  async function save() {
    setSaving(true);
    try {
      let workstream: { action: "confirm" | "ignore" | "create"; gid?: string; name?: string; segment?: "GTM" | "BD" } | undefined;
      if (wsChoice === "__ignore") workstream = { action: "ignore" };
      else if (wsChoice === "__new") {
        if (!newName.trim()) throw new Error("Type a name for the new workstream");
        workstream = { action: "create", name: newName.trim(), segment: newSegment };
      } else if (wsChoice) workstream = { action: "confirm", gid: wsChoice, name: companyWs.find((w) => w.gid === wsChoice)?.name || "" };
      const byKey = new Map(item.people.map((p) => [p.key, p]));
      await reviewNoteFn({
        data: {
          recordId: item.recordId, reviewer, portco, workstream: isNews ? undefined : workstream,
          ...(isActivity ? { status: "confirmed" as const, track } : {}),
          addPeople: Object.entries(people).filter(([, v]) => v === "add").map(([k]) => byKey.get(k)!).filter(Boolean)
            .map((p) => editedPerson(p)),
          skipContacts: Object.entries(people).filter(([, v]) => v === "skip").map(([k]) => byKey.get(k)?.suggestionId || "").filter(Boolean),
          followUps: Object.entries(fu).map(([idx, f]) => {
            const n = item.nextSteps[Number(idx)]!;
            return { action: f.action?.trim() || n.action, who: f.who?.trim() || n.who, dueDate: f.due || n.dueDate };
          }),
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
          <div>
            <div className="text-sm font-medium">{item.title}</div>
            <div className="text-xs text-muted-foreground">{item.date} · {item.portco || "No PortCo matched"}</div>
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
      </div>

      {open && (
        <div className="mt-3 space-y-4 rounded-md bg-muted/30 p-3 text-sm">
          {item.summary && <p className="text-muted-foreground">{item.summary}</p>}

          {item.review ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>Reviewed {item.review.reviewedAt.slice(0, 10)} by {item.review.reviewedBy || "—"}</span>
              {item.review.track && <span>Track: {item.review.track}</span>}
              <span>Workstream: {item.review.workstream || "—"}</span>
              <span>Contacts added: {item.review.contactsAdded}</span>
              <span>Follow-ups: {item.review.followUps}</span>
              <Button size="sm" variant="outline" disabled={saving} onClick={reopen}>Reopen</Button>
            </div>
          ) : (
            <>
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
                {item.link && (
                  <p className="text-xs text-muted-foreground">Suggested: <b className="text-foreground">{item.link.workstreamName}</b> ({item.link.confidence})</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={portco || "__none"} onValueChange={(v) => { setPortco(v === "__none" ? "" : v); setWsChoice(""); }}>
                    <SelectTrigger className="h-8 w-52 text-xs"><SelectValue placeholder="Pick PortCo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No PortCo</SelectItem>
                      {portcos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!isNews && <Select value={wsChoice} onValueChange={setWsChoice} disabled={!portco}>
                    <SelectTrigger className="h-8 w-72 text-xs"><SelectValue placeholder={portco ? "Pick workstream" : "Pick a PortCo first"} /></SelectTrigger>
                    <SelectContent>
                      {companyWs.map((w) => (
                        <SelectItem key={w.gid} value={w.gid}>{w.segment} · {w.name}</SelectItem>
                      ))}
                      <SelectItem value="__new">+ New workstream (adds to Asana)</SelectItem>
                      <SelectItem value="__ignore">Not workstream-related</SelectItem>
                    </SelectContent>
                  </Select>}
                  {!isNews && wsChoice === "__new" && (
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
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next steps</h4>
                {item.nextSteps.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None found.</p>
                ) : item.nextSteps.map((n, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="flex-1">{n.action}{n.who && <span className="text-muted-foreground"> — {n.who}</span>}{n.dueDate && <span className="text-muted-foreground"> · due {n.dueDate}</span>}</span>
                    {idx in fu ? (
                      <>
                        <Input className="h-7 w-56 text-xs" placeholder="Next step" value={fu[idx]?.action ?? n.action}
                          onChange={(e) => setFu((s) => ({ ...s, [idx]: { ...s[idx], action: e.target.value } }))} />
                        <Input className="h-7 w-36 text-xs" placeholder="Who" value={fu[idx]?.who ?? n.who}
                          onChange={(e) => setFu((s) => ({ ...s, [idx]: { ...s[idx], who: e.target.value } }))} />
                        <Input type="date" className="h-7 w-36 text-xs" value={fu[idx]?.due || n.dueDate}
                          onChange={(e) => setFu((s) => ({ ...s, [idx]: { ...s[idx], due: e.target.value } }))} />
                        <Button size="sm" variant="ghost" onClick={() => setFu((s) => { const c = { ...s }; delete c[idx]; return c; })}>Cancel</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setFu((s) => ({ ...s, [idx]: { due: n.dueDate } }))}>Create follow-up</Button>
                        <Button size="sm" variant="ghost" onClick={() => setFu((s) => ({ ...s, [idx]: { due: n.dueDate } }))}>Edit</Button>
                      </>
                    )}
                  </div>
                ))}
              </section>}

              <section className="space-y-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">People</h4>
                {item.people.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No people found in this note.</p>
                ) : item.people.map((p) => (
                  <div key={p.key} className="space-y-1 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex-1">{p.name || p.email} <span className="text-muted-foreground">{p.email}{p.company && ` · ${p.company}`}</span></span>
                      {p.where !== "New" || p.status.startsWith("approved") ? (
                        <Badge variant="secondary" className="text-[10px]">{p.where === "New" ? "Added" : `In ${p.where}`}</Badge>
                      ) : (
                        <>
                          <Badge variant="outline" className="text-[10px]">New</Badge>
                          <Button size="sm" variant={people[p.key] === "add" ? "secondary" : "outline"} onClick={() => setPeople((s) => ({ ...s, [p.key]: s[p.key] === "add" ? "" : "add" }))}>Add to contacts</Button>
                          <Button size="sm" variant={editing[p.key] ? "secondary" : "outline"} onClick={() => setEditing((s) => ({ ...s, [p.key]: !s[p.key] }))}>Edit</Button>
                          <Button size="sm" variant={people[p.key] === "skip" ? "secondary" : "ghost"} onClick={() => setPeople((s) => ({ ...s, [p.key]: s[p.key] === "skip" ? "" : "skip" }))}>Skip</Button>
                        </>
                      )}
                    </div>
                    {editing[p.key] && p.where === "New" && !p.status.startsWith("approved") && (
                      <div className="flex flex-wrap items-center gap-2 pl-2">
                        <Input className="h-7 w-44 text-xs" placeholder="Name" value={edits[p.key]?.name ?? p.name}
                          onChange={(e) => setEdits((s) => ({ ...s, [p.key]: { name: e.target.value, email: s[p.key]?.email ?? p.email, company: s[p.key]?.company ?? p.company } }))} />
                        <Input className="h-7 w-52 text-xs" placeholder="Email" value={edits[p.key]?.email ?? p.email}
                          onChange={(e) => setEdits((s) => ({ ...s, [p.key]: { name: s[p.key]?.name ?? p.name, email: e.target.value, company: s[p.key]?.company ?? p.company } }))} />
                        <Input className="h-7 w-40 text-xs" placeholder="Company" value={edits[p.key]?.company ?? p.company}
                          onChange={(e) => setEdits((s) => ({ ...s, [p.key]: { name: s[p.key]?.name ?? p.name, email: s[p.key]?.email ?? p.email, company: e.target.value } }))} />
                      </div>
                    )}
                  </div>
                ))}
              </section>

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

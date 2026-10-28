import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { askAdminAssistantFn, type AssistantReply, type AssistantTurn } from "@/utils/admin-assistant.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DictationButton } from "@/components/admin/DictationButton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bug, Lightbulb, LifeBuoy, Send, Copy, ArrowRightLeft, Trash2, Loader2, ClipboardList, ExternalLink } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { buildHandoffPrompt, buildHandoffUrl } from "@/lib/lovable-handoff";

type Draft = NonNullable<AssistantReply["draft"]>;
interface RequestRow {
  id: string; kind: string; title: string; description: string; lovable_prompt: string;
  status: string; priority: string; effort: string; page: string; requested_by: string; user_id: string; created_at: string;
}

const STATUSES = ["open", "planned", "in progress", "done", "won't do"];
const PRI_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function AdminWorkspace() {
  const { email } = useAuth();
  const ask = useServerFn(askAdminAssistantFn);
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function load() {
    const { data, error } = await supabase.from("admin_requests").select("*").order("created_at", { ascending: false });
    if (error) toast.error("Couldn't load requests");
    else setRows(data as RequestRow[]);
  }
  useEffect(() => { void load(); void supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null)); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [turns, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy || dictating) return;
    const next = [...turns, { role: "user" as const, text }];
    setTurns(next); setInput(""); setBusy(true);
    try {
      const r = await ask({ data: { turns: next, page: document.referrer } });
      if (r.error) { toast.error(r.error); setTurns(next); return; }
      setTurns([...next, { role: "assistant", text: r.reply }]);
      if (r.draft) setDraft(r.draft);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Assistant failed");
    } finally { setBusy(false); }
  }

  async function saveDraft() {
    if (!draft) return;
    const { error } = await supabase.from("admin_requests").insert({
      kind: draft.kind, title: draft.title, description: draft.description, lovable_prompt: draft.lovablePrompt,
      priority: draft.priority, effort: draft.effort, requested_by: email || "",
    });
    if (error) return toast.error("Couldn't save the request");
    toast.success(draft.kind === "fix" ? "Fix request logged" : "Feature request logged");
    setDraft(null); setTurns([]); void load();
  }

  async function update(id: string, patch: Partial<RequestRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("admin_requests").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error("Couldn't update"); void load(); }
  }
  async function remove(id: string) {
    const { error } = await supabase.from("admin_requests").delete().eq("id", id);
    if (error) return toast.error("Couldn't delete");
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  function copySummary() {
    const open = rows.filter((r) => r.status !== "done" && r.status !== "won't do");
    const block = (kind: string, label: string) => {
      const list = open.filter((r) => r.kind === kind).sort((a, b) => (PRI_RANK[a.priority] ?? 1) - (PRI_RANK[b.priority] ?? 1));
      return `## ${label} (${list.length})\n` + list.map((r, i) =>
        `${i + 1}. **${r.title}** — priority ${r.priority}, effort ${r.effort}, status ${r.status}, from ${r.requested_by || "unknown"}\n   ${r.description}\n   Build prompt: ${r.lovable_prompt}`).join("\n");
    };
    const md = `Venture Pulse team requests — summarise implications and propose a build plan, easiest high-value items first.\n\n${block("fix", "Fix requests")}\n\n${block("feature", "Feature requests")}`;
    void navigator.clipboard.writeText(md);
    toast.success("Copied — paste into Lovable for a summary and plan");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><LifeBuoy className="h-4 w-4 text-primary" /> Troubleshooting assistant</h2>
        <p className="text-xs text-muted-foreground mb-3">Describe an issue, ask how something works, or suggest an improvement. Requests are logged for the builder — nothing changes in the app until it's built.</p>
        <div className="max-h-72 overflow-y-auto space-y-2 mb-3">
          {turns.map((t, i) => (
            <div key={i} className={t.role === "user" ? "ml-auto max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground" : "max-w-[85%] text-sm text-foreground whitespace-pre-wrap"}>{t.text}</div>
          ))}
          {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Thinking…</div>}
          <div ref={endRef} />
        </div>
        {draft && (
          <div className="mb-3 rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{draft.kind === "fix" ? "Fix request" : "Feature request"}</Badge>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setDraft({ ...draft, kind: draft.kind === "fix" ? "feature" : "fix" })}>
                <ArrowRightLeft className="h-3 w-3 mr-1" /> Make it a {draft.kind === "fix" ? "feature" : "fix"}
              </Button>
            </div>
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <Textarea rows={3} className="text-xs font-mono" value={draft.lovablePrompt} onChange={(e) => setDraft({ ...draft, lovablePrompt: e.target.value })} />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveDraft}>Log request</Button>
              <Button size="sm" variant="outline" onClick={() => setDraft(null)}>Discard</Button>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Textarea aria-label="Troubleshooting message" rows={2} value={input} placeholder="e.g. Bulk demote says 'already at limit' for 6 people…" onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
          <div className="flex shrink-0 self-end gap-2">
            <DictationButton disabled={busy} onBusyChange={setDictating} onText={(text) => setInput((previous) => previous.trim() ? `${previous.trimEnd()} ${text}` : text)} />
            <Button aria-label="Send troubleshooting message" title="Send message" onClick={send} disabled={busy || dictating || !input.trim()} size="icon"><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={copySummary}><ClipboardList className="h-4 w-4 mr-1" /> Copy summary for Lovable</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {(["fix", "feature"] as const).map((kind) => (
          <RequestList key={kind} kind={kind} rows={rows.filter((r) => r.kind === kind)} uid={uid} onUpdate={update} onRemove={remove} />
        ))}
      </div>
    </div>
  );
}

function RequestList({ kind, rows, uid, onUpdate, onRemove }: {
  kind: "fix" | "feature"; rows: RequestRow[]; uid: string | null;
  onUpdate: (id: string, p: Partial<RequestRow>) => void; onRemove: (id: string) => void;
}) {
  const Icon = kind === "fix" ? Bug : Lightbulb;
  const sorted = [...rows].sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (PRI_RANK[a.priority] ?? 1) - (PRI_RANK[b.priority] ?? 1));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const active = sorted.filter((r) => r.status !== "done" && r.status !== "won't do");
  const chosen = sorted.filter((r) => sel.has(r.id));
  const allOn = active.length > 0 && active.every((r) => sel.has(r.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function handoff() {
    const prompt = buildHandoffPrompt(kind, chosen);
    const { url, prefilled } = buildHandoffUrl(prompt);
    try { await navigator.clipboard.writeText(prompt); } catch { /* ignore */ }
    window.open(url, "_blank", "noopener");
    toast.success(prefilled ? "Opened Lovable with your build sheet — review it, then send" : "Build sheet copied — paste it into Lovable's chat");
    for (const r of chosen) if (r.status === "open") onUpdate(r.id, { status: "planned" });
  }
  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold mb-3"><Icon className="h-4 w-4 text-primary" /> {kind === "fix" ? "Fix requests" : "Feature requests"} <Badge variant="secondary">{rows.length}</Badge></h3>
      {active.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox checked={allOn} onCheckedChange={() => setSel(allOn ? new Set() : new Set(active.map((r) => r.id)))} /> Select all open
          </label>
          <Button size="sm" className="ml-auto h-7 text-xs" disabled={chosen.length === 0} onClick={handoff}>
            <ExternalLink className="h-3 w-3 mr-1" /> {kind === "fix" ? "Fix" : "Build"} in Lovable{chosen.length ? ` (${chosen.length})` : ""}
          </Button>
        </div>
      )}
      {sorted.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
      <div className="space-y-2">
        {sorted.map((r) => (
          <div key={r.id} className={`rounded-lg border p-3 ${r.status === "done" || r.status === "won't do" ? "opacity-60" : ""}`}>
            <div className="flex items-start gap-2 text-sm font-medium"><Checkbox className="mt-0.5" checked={sel.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Select ${r.title}`} />{r.title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{r.description}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Select value={r.status} onValueChange={(v) => onUpdate(r.id, { status: v })}>
                <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={r.priority} onValueChange={(v) => onUpdate(r.id, { priority: v })}>
                <SelectTrigger className="h-7 w-[90px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{["high", "medium", "low"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Badge variant="outline" className="text-[10px]">effort: {r.effort}</Badge>
              <span className="ml-auto text-[10px] text-muted-foreground">{r.requested_by.split("@")[0]} · {new Date(r.created_at).toLocaleDateString()}</span>
            </div>
            <div className="mt-2 flex gap-1">
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { void navigator.clipboard.writeText(r.lovable_prompt); toast.success("Build prompt copied"); }}><Copy className="h-3 w-3 mr-1" /> Copy prompt</Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => onUpdate(r.id, { kind: kind === "fix" ? "feature" : "fix" })}><ArrowRightLeft className="h-3 w-3 mr-1" /> Move to {kind === "fix" ? "features" : "fixes"}</Button>
              {uid === r.user_id && <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive" onClick={() => onRemove(r.id)}><Trash2 className="h-3 w-3" /></Button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

import { useMemo, useState } from "react";
import type { Workstream } from "@/lib/workstream-parse";
import { PROGRAM_FIELDS, workstreamBarStatus, initialsOf } from "@/lib/workstream-parse";
import { StakeholderPicker, parseStakeholders, type Stakeholder } from "./StakeholderPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { updateWorkstreamFn } from "@/utils/asana.functions";
import { patchWorkstreamCache } from "@/lib/use-workstreams";
import { sameValue, type FieldChange } from "@/lib/asana-field-payload";
import { WorkstreamFieldEditor } from "./WorkstreamFieldEditor";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  User,
} from "lucide-react";

export function statusTone(status: string): string {
  const s = (status || "").toLowerCase();
  if (s.includes("complete") && !s.includes("working"))
    return "bg-accent text-accent-foreground border-primary/30";
  if (s.includes("stall") || s.includes("block")) return "bg-hot text-hot-foreground border-hot-foreground/30";
  if (s.includes("working") || s.includes("progress"))
    return "bg-good text-good-foreground border-good-foreground/30";
  if (!s || s === "not set" || s.includes("early")) return "bg-muted text-muted-foreground border-border";
  return "bg-cold text-cold-foreground border-cold-foreground/30";
}

export function priorityTone(priority: string): string {
  const p = (priority || "").toLowerCase();
  if (p.includes("high") || p.includes("critical") || p.includes("urgent"))
    return "bg-hot text-hot-foreground border-hot-foreground/30";
  if (p.includes("med")) return "bg-warm text-warm-foreground border-warm-foreground/30";
  return "bg-muted text-muted-foreground border-border";
}

export function OwnerBadge({ owner }: { owner: string }) {
  const initials = initialsOf(owner);
  return (
    <span
      title={owner || "Unassigned"}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[9px] font-semibold text-muted-foreground"
    >
      {initials || <User className="h-3 w-3" />}
    </span>
  );
}

function FieldGrid({ items }: { items: Array<[string, string]> }) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
      {items.map(([label, value]) => (
        <div key={label} className="text-[11px] leading-snug">
          <span className="text-muted-foreground">{label}: </span>
          <span className={value ? "text-foreground" : "text-muted-foreground/60 italic"}>
            {value || "Not set"}
          </span>
        </div>
      ))}
    </div>
  );
}

type EditKey = keyof Workstream;

function EditView({ w, onSaved, onCancel, inline = false }: { w: Workstream; onSaved: (w: Workstream) => void; onCancel: () => void; inline?: boolean }) {
  const save = useServerFn(updateWorkstreamFn);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(w.name || w.rawName);
  const keys: Array<[string, EditKey]> = [
    ["Work stream status", "workstreamStatus"],
    ["Work stream priority", "workstreamPriority"],
    // Stakeholders get a dedicated people picker below, not the free-text editor.
    ...PROGRAM_FIELDS[w.segment].filter(([, k]) => k !== "dellStakeholders"),
  ];
  const [draft, setDraft] = useState<Record<string, string | string[]>>({});
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>(() => parseStakeholders(String(w.dellStakeholders || "")));
  const [completed, setCompleted] = useState(w.completed);
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    const changes: FieldChange[] = [];
    for (const [, key] of keys) {
      const m = w.editable?.[key];
      if (!m || !(key in draft)) continue;
      if (!sameValue(draft[key]!, m.value))
        changes.push({ gid: m.gid, type: m.type, original: m.value, value: draft[key]! });
    }
    // Stakeholders are stored back to Asana as a comma-separated name list.
    const sm = w.editable?.["dellStakeholders" as EditKey];
    const stakeholderNames = stakeholders.map((s) => s.name).join(", ");
    if (sm && stakeholderNames !== String(w.dellStakeholders || "") && !sameValue(stakeholderNames, sm.value))
      changes.push({ gid: sm.gid, type: sm.type, original: sm.value, value: stakeholderNames });
    const completedChanged = completed !== w.completed;
    const titleChanged = title.trim() !== (w.name || w.rawName);
    if (!changes.length && !completedChanged && !titleChanged) return onCancel();
    setSaving(true);
    const res = await save({
      data: { gid: w.gid, changes, completed: completedChanged ? completed : undefined, title: titleChanged ? { original: w.rawName, value: title.trim() } : undefined },
    }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    patchWorkstreamCache(res.workstream);
    toast.success("Saved to Asana");
    setDraft({});
    setEditingTitle(false);
    onSaved(res.workstream);
  };

  return (
    <div className="space-y-2">
      {editingTitle && <div className="space-y-1 border-b border-border pb-3"><Label htmlFor={`workstream-title-${w.gid}`}>Workstream title</Label><Input id={`workstream-title-${w.gid}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
        {keys.map(([label, key]) => {
          const m = w.editable?.[key];
          return (
            <div key={label} className={key === "nextSteps" ? "sm:col-span-2 space-y-0.5" : "space-y-0.5"}>
              <p className="text-[10px] text-muted-foreground">{label}</p>
              {m && m.editable ? (
                <WorkstreamFieldEditor
                  meta={m}
                  value={key in draft ? draft[key]! : m.value}
                  multiline={key === "nextSteps" || key === "dellStakeholders"}
                  onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                />
              ) : (
                <p className="text-[11px] italic text-muted-foreground/70">
                  {m ? `${String(w[key] || "Not set")} (read-only)` : "Not in Asana"}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {(w.segment === "BD" || w.segment === "GTM") && (
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground">Stakeholders &amp; contacts</p>
          <StakeholderPicker value={stakeholders} onChange={setStakeholders} />
        </div>
      )}
      <label className="flex items-center gap-1.5 text-[11px]">
        <Checkbox checked={completed} onCheckedChange={(c) => setCompleted(c === true)} />
        Mark subtask complete in Asana
      </label>
      <Button size="sm" variant="outline" disabled={saving} onClick={() => setEditingTitle((v) => !v)} aria-expanded={editingTitle}><Pencil className="h-3.5 w-3.5" />Edit title</Button>
      {(!inline || Object.keys(draft).length > 0 || title.trim() !== (w.name || w.rawName) || completed !== w.completed || stakeholders.map((s) => s.name).join(", ") !== String(w.dellStakeholders || "")) && <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setTitle(w.name || w.rawName); setEditingTitle(false); if (inline) { setDraft({}); setCompleted(w.completed); setStakeholders(parseStakeholders(String(w.dellStakeholders || ""))); } else onCancel(); }} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={onSave} disabled={saving || !title.trim()}>
          {saving && <Loader2 className="h-3 w-3 animate-spin" />} Save{inline ? " changes to Asana" : ""}
        </Button>
      </div>}
    </div>
  );
}

export function WorkstreamRow({
  w: initial,
  showCompany = false,
  showSegment = false,
  defaultOpen = false,
}: {
  w: Workstream;
  showCompany?: boolean;
  showSegment?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<Workstream | null>(null);
  const w = saved && saved.gid === initial.gid ? saved : initial;
  const program = PROGRAM_FIELDS[w.segment].map(
    ([label, key]) => [label, String(w[key] ?? "")] as [string, string],
  );
  const barStatus = workstreamBarStatus(w);

  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-2">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen((o) => !o)}
        className="h-auto w-full min-w-0 justify-start whitespace-normal p-0 text-left hover:bg-transparent"
        aria-expanded={open}
      >
        <div className="flex w-full min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex items-start gap-2">
            {open ? (
              <ChevronDown className="h-3 w-3 mt-1 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 mt-1 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground truncate">
                {showCompany && (
                  <span className="text-muted-foreground font-normal">{w.company} · </span>
                )}
                {showSegment && (
                  <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {w.segment}
                  </span>
                )}
                {w.name || w.rawName}
              </div>
            </div>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-1.5">
            <Badge title="Work stream status" variant="outline" className={`text-[10px] whitespace-normal ${statusTone(barStatus)}`}>
              {barStatus}
            </Badge>
            <Badge title="Work stream priority" variant="outline" className="text-[10px] whitespace-normal bg-muted text-muted-foreground border-border">
              {w.workstreamPriority || "Not set"}
            </Badge>
            <OwnerBadge owner={w.owner} />
          </div>
        </div>
      </Button>

      {open && (
        <div className="mt-2 space-y-2.5 border-t border-border pt-2">
          <div className="flex justify-end">
            <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
              Edit
              <Switch checked={editing} onCheckedChange={setEditing} aria-label="Edit workstream" />
            </label>
          </div>
          {editing ? (
            <EditView
              w={w}
              onCancel={() => setEditing(false)}
              onSaved={(nw) => {
                setSaved(nw);
                setEditing(false);
              }}
            />
          ) : (
            <FieldGrid items={program} />
          )}
          {w.notes && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Detail
              </p>
              <p className="text-[11px] whitespace-pre-wrap text-foreground/90">{w.notes}</p>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span>{w.lastActivity ? `Updated ${w.lastActivity}` : ""}</span>
            {w.url && (
              <a
                href={w.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Asana <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Group({
  label,
  items,
  showCompany,
  defaultOpen = true,
}: {
  label: string;
  items: Workstream[];
  showCompany?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
          {items.length}
        </span>
      </button>
      {open && items.map((w) => <WorkstreamRow key={w.gid} w={w} showCompany={showCompany} />)}
    </div>
  );
}

/** Groups a workstream list into BD / GTM / Other with completed ones collapsed. */
export function WorkstreamGroups({
  workstreams,
  showCompany,
}: {
  workstreams: Workstream[];
  showCompany?: boolean;
}) {
  const { bd, gtm, other, done } = useMemo(() => {
    const open = workstreams.filter((w) => !w.completed);
    return {
      bd: open.filter((w) => w.segment === "BD"),
      gtm: open.filter((w) => w.segment === "GTM"),
      other: open.filter((w) => w.segment === "Other"),
      done: workstreams.filter((w) => w.completed),
    };
  }, [workstreams]);

  if (workstreams.length === 0)
    return <p className="text-xs text-muted-foreground py-4">No workstreams in Asana yet.</p>;

  return (
    <div className="space-y-3">
      <Group label="BD" items={bd} showCompany={showCompany} />
      <Group label="GTM" items={gtm} showCompany={showCompany} />
      <Group label="Other" items={other} showCompany={showCompany} />
      <Group label="Completed" items={done} showCompany={showCompany} defaultOpen={false} />
    </div>
  );
}

/** Card wrapper used on the portfolio-company detail page. */
export function WorkstreamsPanel({
  workstreams,
  loading,
  onRefresh,
}: {
  workstreams: Workstream[];
  loading?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <GitBranch className="h-4 w-4 text-primary" /> Workstreams ({workstreams.length})
        </h3>
        {onRefresh && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onRefresh} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        )}
      </div>
      {loading && workstreams.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading workstreams…
        </p>
      ) : (
        <WorkstreamGroups workstreams={workstreams} />
      )}
    </div>
  );
}

/** Always-open workstream editor for My Actions: fields are directly editable, Save appears once something changes. */
export function WorkstreamDetail({ w: initial, onSaved }: { w: Workstream; onSaved?: (w: Workstream) => void }) {
  const [saved, setSaved] = useState<Workstream | null>(null);
  const w = saved && saved.gid === initial.gid ? saved : initial;
  return (
    <div className="space-y-3">
      <EditView key={w.rawName} w={w} inline onCancel={() => {}} onSaved={(next) => { setSaved(next); onSaved?.(next); }} />
      {w.notes && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Detail</p>
          <p className="text-[11px] whitespace-pre-wrap text-foreground/90">{w.notes}</p>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>{w.lastActivity ? `Updated ${w.lastActivity}` : ""}</span>
        {w.url && <a href={w.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Asana <ExternalLink className="h-3 w-3" /></a>}
      </div>
    </div>
  );
}

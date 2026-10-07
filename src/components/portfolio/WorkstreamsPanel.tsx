import { useMemo, useState } from "react";
import type { Workstream } from "@/lib/workstream-parse";
import { PROGRAM_FIELDS, workstreamBarStatus, initialsOf } from "@/lib/workstream-parse";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function EditView({ w, onSaved, onCancel }: { w: Workstream; onSaved: (w: Workstream) => void; onCancel: () => void }) {
  const save = useServerFn(updateWorkstreamFn);
  const keys: Array<[string, EditKey]> = [
    ["Work stream status", "workstreamStatus"],
    ["Work stream priority", "workstreamPriority"],
    ...PROGRAM_FIELDS[w.segment],
  ];
  const [draft, setDraft] = useState<Record<string, string | string[]>>({});
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
    const completedChanged = completed !== w.completed;
    if (!changes.length && !completedChanged) return onCancel();
    setSaving(true);
    const res = await save({
      data: { gid: w.gid, changes, completed: completedChanged ? completed : undefined },
    }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    patchWorkstreamCache(res.workstream);
    toast.success("Saved to Asana");
    onSaved(res.workstream);
  };

  return (
    <div className="space-y-2">
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
      <label className="flex items-center gap-1.5 text-[11px]">
        <Checkbox checked={completed} onCheckedChange={(c) => setCompleted(c === true)} />
        Mark subtask complete in Asana
      </label>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="h-3 w-3 animate-spin" />} Save
        </Button>
      </div>
    </div>
  );
}

export function WorkstreamRow({
  w: initial,
  showCompany = false,
  showSegment = false,
}: {
  w: Workstream;
  showCompany?: boolean;
  showSegment?: boolean;
}) {
  const [open, setOpen] = useState(false);
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

// Pick which columns a table shows; the choice is remembered for each teammate on this device.
import { useEffect, useState } from "react";
import { Columns3, GripVertical } from "lucide-react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/auth-context";
import { moveColumn, orderedColumns } from "@/lib/column-order";
import { cn } from "@/lib/utils";

export interface ColumnOption { key: string; label: string; archived?: boolean }

/** `renamed` maps retired column keys to their new keys so saved choices survive a rename. */
export function useColumnChoice(table: string, defaults: string[], renamed: Record<string, string> = {}) {
  const { email } = useAuth();
  const storageKey = `vp.table-columns.${table}.${email || "me"}`;
  const [cols, setCols] = useState<string[]>(defaults);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) { const v = JSON.parse(raw); if (Array.isArray(v)) setCols([...new Set(v.filter((x): x is string => typeof x === "string").map((x) => renamed[x] ?? x))]); }
    } catch { /* keep defaults */ }
  }, [storageKey]);
  const save = (next: string[]) => {
    setCols(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  };
  return [cols, save, () => save(defaults)] as const;
}

function SortableField({ option, onRemove }: { option: ColumnOption; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: option.key });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
    className={cn("relative flex min-h-9 items-center gap-2 rounded-md bg-popover text-xs", isDragging && "z-10 ring-1 ring-border shadow-sm")}>
    <Button ref={setActivatorNodeRef} variant="ghost" size="icon" className="h-8 w-7 shrink-0 touch-none cursor-grab text-muted-foreground active:cursor-grabbing"
      title={`Reorder ${option.label}`} aria-label={`Reorder ${option.label}`} {...attributes} {...listeners}><GripVertical /></Button>
    <label className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1">
      <Checkbox checked onCheckedChange={(checked) => { if (checked !== true) onRemove(); }} />
      <span className="min-w-0 break-words">{option.label}{option.archived && <span className="ml-1 text-muted-foreground">(archived)</span>}</span>
    </label>
  </div>;
}

export function ColumnChooser({ options, value, onChange, onReset }: { options: ColumnOption[]; value: string[]; onChange: (v: string[]) => void; onReset: () => void }) {
  const selected = orderedColumns(options, value);
  const kept = options.filter((o) => !o.archived && !value.includes(o.key));
  const archived = options.filter((o) => o.archived && !value.includes(o.key));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const reorder = ({ active, over }: DragEndEvent) => {
    if (over) onChange(moveColumn(value, String(active.id), String(over.id)));
  };
  const toggle = (k: string, on: boolean) => onChange(on ? [...value.filter((x) => x !== k), k] : value.filter((x) => x !== k));
  const row = (o: ColumnOption) => (
    <label key={o.key} className="flex min-h-8 items-center gap-2 py-1 pl-9 text-xs">
      <Checkbox checked={value.includes(o.key)} onCheckedChange={(c) => toggle(o.key, c === true)} />
      {o.label}
    </label>
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs"><Columns3 className="mr-1.5 h-3.5 w-3.5" />Columns ({selected.length})</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70vh] w-72 overflow-y-auto p-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Selected fields</p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
          <SortableContext items={selected.map((o) => o.key)} strategy={verticalListSortingStrategy}>
            {selected.map((o) => <SortableField key={o.key} option={o} onRemove={() => toggle(o.key, false)} />)}
          </SortableContext>
        </DndContext>
        {kept.length > 0 && <>
          <p className="mb-1 mt-3 border-t border-border pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Other fields</p>
          {kept.map(row)}
        </>}
        {archived.length > 0 && (
          <>
            <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Archived from Asana (view only)</p>
            {archived.map(row)}
          </>
        )}
        <Button variant="ghost" size="sm" className="mt-2 h-7 w-full text-xs" onClick={onReset}>Reset to default</Button>
      </PopoverContent>
    </Popover>
  );
}

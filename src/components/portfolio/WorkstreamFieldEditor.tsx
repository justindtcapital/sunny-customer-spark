import type { WorkstreamFieldMeta } from "@/lib/asana-field-payload";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none__";

/** One input per Asana field type; values stay in Asana's native shape. */
export function WorkstreamFieldEditor({
  meta,
  value,
  onChange,
  multiline,
}: {
  meta: WorkstreamFieldMeta;
  value: string | string[];
  onChange: (v: string | string[]) => void;
  multiline?: boolean;
}) {
  if (meta.type === "enum") {
    const v = typeof value === "string" && value ? value : NONE;
    return (
      <Select value={v} onValueChange={(x) => onChange(x === NONE ? "" : x)}>
        <SelectTrigger className="h-7 text-[11px]">
          <SelectValue placeholder="Not set" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} className="text-[11px] italic">Not set</SelectItem>
          {(meta.options || []).map((o) => (
            <SelectItem key={o.gid} value={o.gid} className="text-[11px]">{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (meta.type === "multi_enum") {
    const sel = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-border p-1.5">
        {(meta.options || []).map((o) => (
          <label key={o.gid} className="flex items-center gap-1 text-[11px]">
            <Checkbox
              checked={sel.includes(o.gid)}
              onCheckedChange={(c) =>
                onChange(c ? [...sel, o.gid] : sel.filter((g) => g !== o.gid))
              }
            />
            {o.name}
          </label>
        ))}
        {(meta.options || []).length === 0 && (
          <span className="text-[11px] italic text-muted-foreground">No choices set up in Asana</span>
        )}
      </div>
    );
  }
  const s = typeof value === "string" ? value : value.join(", ");
  if (meta.type === "number")
    return <Input inputMode="decimal" className="h-7 text-[11px]" value={s} onChange={(e) => onChange(e.target.value)} />;
  if (meta.type === "date")
    return <Input type="date" className="h-7 text-[11px]" value={s} onChange={(e) => onChange(e.target.value)} />;
  if (multiline)
    return <Textarea className="min-h-[56px] text-[11px]" value={s} onChange={(e) => onChange(e.target.value)} />;
  return <Input className="h-7 text-[11px]" value={s} onChange={(e) => onChange(e.target.value)} />;
}

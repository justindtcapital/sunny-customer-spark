import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { EventPicker } from "@/components/events/EventPicker";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  /** Adds the event as a link on the selected prospects (existing links kept). */
  onSave: (event: string, type: "attended" | "invited") => Promise<void>;
}

export function TagToEventDialog({ open, onOpenChange, count, onSave }: Props) {
  const [event, setEvent] = useState("");
  const [type, setType] = useState<"attended" | "invited">("attended");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!event.trim()) return;
    setSaving(true);
    try {
      await onSave(event.trim(), type);
      setEvent("");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tag to event</DialogTitle>
          <DialogDescription>
            Adds an event to {count} selected prospect{count !== 1 ? "s" : ""}. Events they're
            already linked to are kept, and nothing else on their records changes.
          </DialogDescription>
        </DialogHeader>
        <EventPicker value={event} onChange={setEvent} placeholder="Pick an event" />
        <div className="flex gap-1.5" role="radiogroup" aria-label="Tag as">
          {(["attended", "invited"] as const).map((t) => (
            <Button
              key={t}
              type="button"
              size="sm"
              role="radio"
              aria-checked={type === t}
              variant={type === t ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setType(t)}
            >
              {t === "attended" ? "Attended" : "Invited"}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!event.trim() || saving || count === 0}>
            {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Tag {count}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

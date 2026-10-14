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
  /** Writes only the Event field on the selected prospects. */
  onSave: (event: string) => Promise<void>;
}

export function TagToEventDialog({ open, onOpenChange, count, onSave }: Props) {
  const [event, setEvent] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!event.trim()) return;
    setSaving(true);
    try {
      await onSave(event.trim());
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
            Tags {count} selected prospect{count !== 1 ? "s" : ""} to an event. Nothing else on
            their records changes.
          </DialogDescription>
        </DialogHeader>
        <EventPicker value={event} onChange={setEvent} placeholder="Pick an event" />
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

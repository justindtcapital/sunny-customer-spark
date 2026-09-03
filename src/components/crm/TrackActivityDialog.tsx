// Track activity — opened from the email address on a target card. Captures what
// kind of touch just happened (cold outreach vs. follow-up), which portfolio
// companies were mentioned, and an optional future reminder that re-flags the
// target for follow-up on a chosen date.
import { useEffect, useState } from "react";
import { Mail, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PortcoTagPicker } from "@/components/crm/PortcoTagPicker";
import { DateTextField } from "@/components/crm/DateTextField";
import { todayIso } from "@/lib/sheet-date";

export type TrackActivityKind = "Cold outreach" | "Follow-up";

export interface TrackActivityResult {
  kind: TrackActivityKind;
  /** YYYY-MM-DD the touch happened. */
  date: string;
  note: string;
  portcos: string[];
  /** Set when a future follow-up was requested (YYYY-MM-DD). */
  reminderDue?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Person the activity is about — shown for confirmation. */
  personName: string;
  email: string;
  portcoNames: string[];
  onSave: (result: TrackActivityResult) => void;
}

/** Add days to a YYYY-MM-DD date, returning YYYY-MM-DD. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const PRESETS: Array<{ label: string; days: number }> = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
];

export function TrackActivityDialog({
  open,
  onOpenChange,
  personName,
  email,
  portcoNames,
  onSave,
}: Props) {
  const [kind, setKind] = useState<TrackActivityKind>("Cold outreach");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [portcos, setPortcos] = useState<string[]>([]);
  const [remind, setRemind] = useState(false);
  const [due, setDue] = useState(addDays(todayIso(), 7));

  // Fresh state each time the dialog opens for a (possibly different) person.
  useEffect(() => {
    if (!open) return;
    const today = todayIso();
    setKind("Cold outreach");
    setDate(today);
    setNote("");
    setPortcos([]);
    setRemind(false);
    setDue(addDays(today, 7));
  }, [open]);

  const save = () => {
    onSave({
      kind,
      date: date || todayIso(),
      note: note.trim(),
      portcos,
      reminderDue: remind ? due : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-primary" /> Track activity
          </DialogTitle>
          <DialogDescription className="text-xs">
            Log this touch on {personName || email}&rsquo;s outreach trail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5 block">
              Type
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {(["Cold outreach", "Follow-up"] as TrackActivityKind[]).map((k) => (
                <Button
                  key={k}
                  type="button"
                  variant={kind === k ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setKind(k)}
                >
                  {k}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5 block">
                Date
              </Label>
              <DateTextField value={date} onChange={setDate} />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5 block">
                PortCos mentioned
              </Label>
              <PortcoTagPicker
                value={portcos}
                onChange={setPortcos}
                options={portcoNames}
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5 block">
              Note
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you send or discuss?"
              className="text-sm min-h-[70px]"
            />
          </div>

          <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={remind}
                onCheckedChange={(v) => setRemind(v === true)}
                aria-label="Set a future follow-up"
              />
              <span className="text-xs font-medium text-foreground">
                Set a future follow-up reminder
              </span>
            </label>
            {remind && (
              <div className="space-y-2 pl-6">
                <div className="flex gap-1.5">
                  {PRESETS.map((p) => (
                    <Button
                      key={p.label}
                      type="button"
                      variant={due === addDays(date || todayIso(), p.days) ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-[11px] px-2"
                      onClick={() => setDue(addDays(date || todayIso(), p.days))}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
                <DateTextField value={due} onChange={setDue} />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            <Send className="h-3.5 w-3.5 mr-1.5" /> Log activity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

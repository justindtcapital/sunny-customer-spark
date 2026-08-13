import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { flagActivityAttribution } from "@/utils/activity-attribution.functions";
import { threadIdFromNotes, peopleFromNotes } from "@/lib/activity-canonical";
import type { AsanaActivity } from "@/lib/types";

interface Props {
  activity: AsanaActivity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "This is the wrong person/company" — writes a correction that is replayed on
 *  every later sync, so the fix survives re-imports. */
export function AttributionFlagDialog({ activity, open, onOpenChange }: Props) {
  const router = useRouter();
  const [person, setPerson] = useState("");
  const [company, setCompany] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const candidates = peopleFromNotes(activity?.notes);

  const submit = async () => {
    if (!activity) return;
    if (!person.trim() && !company.trim()) {
      toast.error("Enter the correct person or company.");
      return;
    }
    setSaving(true);
    try {
      const res = await flagActivityAttribution({
        data: {
          gid: activity.gid,
          threadId: threadIdFromNotes(activity.notes),
          subject: activity.name,
          wasPerson: activity.person,
          wasCompany: activity.company,
          correctPerson: person.trim(),
          correctCompany: company.trim(),
          reason: reason.trim(),
        },
      });
      if (!res.ok) {
        toast.error(res.error || "Could not save the correction.");
        return;
      }
      toast.success("Correction saved — it will be applied on every sync.");
      onOpenChange(false);
      setPerson("");
      setCompany("");
      setReason("");
      router.invalidate();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fix attribution</DialogTitle>
          <DialogDescription className="text-xs">
            {activity?.name}
            {activity?.person ? ` · currently attributed to ${activity.person}` : ""}
            {activity?.company ? ` at ${activity.company}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Correct person</Label>
            <Input
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              placeholder="First Last"
              list="attribution-candidates"
            />
            <datalist id="attribution-candidates">
              {candidates.map((c) => (
                <option key={c.email} value={c.name || c.email} />
              ))}
            </datalist>
            {candidates.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                On this thread: {candidates.map((c) => c.name || c.email).join(", ")}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Correct company</Label>
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company the thread is about"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Why (optional)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. sender was our teammate, not the contact"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save correction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

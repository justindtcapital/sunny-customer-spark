import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { importContactsBatch } from "@/utils/bulk-import.functions";
import { enrichContact } from "@/utils/apollo.functions";
import { PasteReviewPanel, usePasteReview } from "@/components/crm/PasteReview";
import type { PastedContact } from "@/lib/paste-parse";
import { toast } from "sonner";

interface SmartPasteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Emails of contacts that already exist — used to mark duplicates in review. */
  existingEmails?: string[];
  /** Called after a successful add so the caller can refresh its data. */
  onImported?: () => void | Promise<void>;
  /** Pre-filled rows (e.g. people from the Morning Brief); still reviewed before saving. */
  initialText?: string;
}

export function SmartPasteDialog({ open, onOpenChange, existingEmails = [], onImported, initialText }: SmartPasteDialogProps) {
  const [text, setText] = useState("");
  useEffect(() => { if (open && initialText) setText(initialText); }, [open, initialText]);
  const [enrich, setEnrich] = useState(true);
  const [busy, setBusy] = useState(false);
  const existing = useMemo(() => new Set(existingEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)), [existingEmails]);
  const isDuplicate = useCallback((r: PastedContact) => !!r.email && existing.has(r.email.trim().toLowerCase()), [existing]);
  const review = usePasteReview(text, isDuplicate);
  const { parsed, toImport } = review;

  const reset = () => {
    setText("");
    setEnrich(true);
    setBusy(false);
    review.reset();
  };

  const submit = async () => {
    if (!toImport.length) return;
    setBusy(true);
    try {
      const prepared = [];
      for (const p of toImport) {
        let name=p.name.trim(), role=p.title.trim(), company=p.company.trim(), email=p.email.trim(), linkedin=p.linkedinUrl, phone="", location="", sector="";
        if (enrich) {
          const parts=name.split(/\s+/);
          const r=await enrichContact({ data:{ email:email || undefined,firstName:parts[0] || undefined,lastName:parts.slice(1).join(" ") || undefined,company:company || undefined,linkedinUrl:linkedin || undefined } }).catch(() => ({ found: false } as const));
          if (r.found) { name=name || r.name || "";role=role || r.title || "";company=company || r.company || "";email=email || r.email || "";linkedin=linkedin || r.linkedinUrl || "";phone=r.phone || "";location=[r.city,r.state].filter(Boolean).join(", ");sector=r.industry || ""; }
        }
        prepared.push({ name,email,role,company,linkedin,phone,location,sector,prime:"",source:"Manual Entry" });
      }
      const result=await importContactsBatch({ data:{ contacts:prepared } });
      const message=`${result.added} added · ${result.duplicates} exact duplicates · ${result.review} need review in Admin`;
      if (result.review) toast.warning(message); else toast.success(message);
      if (result.added) await onImported?.();
      reset();onOpenChange(false);
    } catch(e) { toast.error(e instanceof Error ? e.message : "Import failed; review Admin before retrying."); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] grid-rows-[auto_1fr_auto]">
        <DialogHeader>
          <DialogTitle>Paste contacts</DialogTitle>
          <DialogDescription className="text-xs">
            Paste anything — one per line: names, emails, LinkedIn URLs, "Name, Company", or rows
            copied straight from a spreadsheet. Check the review table before adding.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 min-h-0 overflow-y-auto -mx-6 px-6">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Jane Doe, Acme Corp, jane@acme.com\nhttps://linkedin.com/in/johnsmith\nerica.antos@mrcy.com\nGrace\tHopper\tCISO\tNavyTech`}
            className="h-32 text-xs font-mono"
          />

          <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox checked={enrich} onCheckedChange={(v) => setEnrich(v === true)} className="mt-0.5" />
            <span>
              Enrich with Apollo on add.
              <span className="text-muted-foreground/70"> Recommended — fills blank titles and companies; never overwrites what you typed.</span>
            </span>
          </label>

          {(parsed.unparseable > 0 || parsed.headerSkipped > 0) && (
            <div className="rounded border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-[11px] text-foreground">
              {parsed.unparseable > 0 && <span>{parsed.unparseable} line{parsed.unparseable !== 1 ? "s" : ""} couldn't be read (no name, email, or LinkedIn found) — skipped. </span>}
              {parsed.headerSkipped > 0 && <span>{parsed.headerSkipped} header row{parsed.headerSkipped !== 1 ? "s" : ""} ignored.</span>}
            </div>
          )}

          <PasteReviewPanel review={review} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={toImport.length === 0 || busy} onClick={submit}>
            {busy ? (enrich ? "Enriching & adding…" : "Adding…") : `Add ${toImport.length || ""} contact${toImport.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

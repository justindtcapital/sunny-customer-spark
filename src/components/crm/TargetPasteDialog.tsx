import { useCallback, useMemo, useState } from "react";
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
import { importTargets } from "@/utils/sheets.functions";
import { enrichContact } from "@/utils/apollo.functions";
import { targetKeyOf } from "@/lib/types";
import { PasteReviewPanel, usePasteReview } from "@/components/crm/PasteReview";
import type { PastedContact } from "@/lib/paste-parse";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** targetKeyOf() for existing targets — used to mark duplicates in review. */
  existingKeys?: string[];
  onImported?: () => void | Promise<void>;
}

function normalizeLinkedin(url: string): string {
  const u = (url || "").trim();
  if (!u) return "";
  return (/^https?:\/\//i.test(u) ? u : `https://${u}`).replace(/\/+$/, "");
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

// Paste anything (names / emails / LinkedIn URLs / "Name, Company" / spreadsheet
// rows) → reviewed table → Prospecting targets. Same review as Network paste.
export function TargetPasteDialog({ open, onOpenChange, existingKeys = [], onImported }: Props) {
  const [text, setText] = useState("");
  const [enrich, setEnrich] = useState(true);
  const [busy, setBusy] = useState(false);
  const existing = useMemo(() => new Set(existingKeys.map((k) => k.trim().toLowerCase()).filter(Boolean)), [existingKeys]);
  const isDuplicate = useCallback((p: PastedContact) => {
    const key = targetKeyOf({ email: p.email, name: p.name, company: p.company });
    return !!key && existing.has(key);
  }, [existing]);
  const review = usePasteReview(text, isDuplicate);
  const { parsed, toImport } = review;

  const reset = () => {
    setText("");
    setEnrich(true);
    setBusy(false);
    review.reset();
  };

  const submit = async () => {
    if (toImport.length === 0) return;
    setBusy(true);

    let enriched = 0;
    const built = [];
    for (const p of toImport) {
      let name = p.name.trim();
      let title = p.title.trim();
      let company = p.company.trim();
      let email = p.email.trim();
      let phone = "";
      let location = "";
      let sector = "";
      let linkedin = normalizeLinkedin(p.linkedinUrl);

      if (enrich) {
        try {
          const parts = splitName(name);
          const r = await enrichContact({
            data: {
              email: email || undefined,
              firstName: parts.firstName || undefined,
              lastName: parts.lastName || undefined,
              company: company || undefined,
              linkedinUrl: linkedin || undefined,
            },
          });
          if (r.found) {
            name = name || r.name || [r.firstName, r.lastName].filter(Boolean).join(" ");
            title = title || r.title || "";
            company = company || r.company || "";
            phone = r.phone || "";
            location = [r.city, r.state].filter(Boolean).join(", ");
            sector = r.industry || "";
            email = email || r.email || "";
            linkedin = linkedin || normalizeLinkedin(r.linkedinUrl || "");
            enriched++;
          }
        } catch (e) {
          console.error("target paste enrich failed", e);
        }
      }

      const finalName = name || email || linkedin;
      if (!finalName) continue;
      const { firstName, lastName } = splitName(name || email);
      built.push({
        firstName: firstName || finalName,
        lastName,
        company,
        role: title,
        linkedin,
        email,
        phone,
        location,
        sector,
        stage: "Prospecting",
        source: "Manual Entry",
        researchPurpose: "",
        reasonSurfaced: "",
      });
    }

    try {
      const res = await importTargets({ data: { targets: built } });
      const parts = [`Added ${res.added} prospecting target${res.added !== 1 ? "s" : ""}`];
      if (enrich) parts.push(`${enriched} enriched`);
      if (res.duplicates) parts.push(`${res.duplicates} duplicate${res.duplicates !== 1 ? "s" : ""} skipped`);
      if (res.review) parts.push(`${res.review} need review in Admin`);
      if (res.review) toast.warning(parts.join(" · ")); else toast.success(parts.join(" · "));
      if (res.added > 0) await onImported?.();
      reset();
      onOpenChange(false);
    } catch (e) {
      console.error("importTargets (paste) failed", e);
      toast.error(e instanceof Error ? e.message : "Import failed; review Admin before retrying.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] grid-rows-[auto_1fr_auto]">
        <DialogHeader>
          <DialogTitle>Paste targets</DialogTitle>
          <DialogDescription className="text-xs">
            Paste anything — one per line: names, emails, LinkedIn URLs, "Name, Company", or rows
            copied from a spreadsheet. New people enter as{" "}
            <span className="font-medium">Prospecting</span>. Check the review table before adding.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 min-h-0 overflow-y-auto -mx-6 px-6">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Jane Doe, Acme Corp, jane@acme.com\nhttps://linkedin.com/in/johnsmith\nGrace\tHopper\tCISO\tNavyTech"}
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
              {parsed.unparseable > 0 && <span>{parsed.unparseable} line{parsed.unparseable !== 1 ? "s" : ""} couldn't be read — skipped. </span>}
              {parsed.headerSkipped > 0 && <span>{parsed.headerSkipped} header row{parsed.headerSkipped !== 1 ? "s" : ""} ignored.</span>}
            </div>
          )}

          <PasteReviewPanel review={review} noun="target" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={toImport.length === 0 || busy} onClick={submit}>
            {busy ? (enrich ? "Enriching & adding…" : "Adding…") : `Add ${toImport.length || ""} target${toImport.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

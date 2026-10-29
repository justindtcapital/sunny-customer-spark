import { useEffect, useState } from "react";
import type { PortfolioCompany, PortfolioDomain } from "@/lib/types";
import { portfolioDomains } from "@/lib/types";
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
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Pencil } from "lucide-react";
import { updatePortfolioCompany } from "@/utils/sheets.functions";
import { normalizeFocusArea } from "@/lib/focus-area-utils";
import { toast } from "sonner";
import { lookupCompanyFn } from "@/utils/portco-lookup.functions";
import { parseDomainList } from "@/lib/company-domains";
import { isLinkedInCompanyUrl } from "@/lib/portco-fields";
import { normalizeLinkedinUrl } from "@/lib/linkedin";

const labelClass =
  "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block";

function domainFromFocus(focusArea: string): PortfolioDomain {
  const n = normalizeFocusArea(focusArea);
  return (portfolioDomains as string[]).includes(n) ? (n as PortfolioDomain) : "Cloud";
}

// Edit sheet-backed fields for an existing portfolio company. Persists via
// updatePortfolioCompany and returns the patched company for live UI update.
export function EditPortfolioCompanyDialog({
  company,
  open,
  onOpenChange,
  onSaved,
}: {
  company: PortfolioCompany | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: (updated: PortfolioCompany) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [focusArea, setFocusArea] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [aliases, setAliases] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const linkedinInvalid = !isLinkedInCompanyUrl(linkedin);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const [findNote, setFindNote] = useState("");

  // Look up the real company (website + LinkedIn) and fill blanks only, for review before save.
  const findCompany = async () => {
    setFinding(true);
    setFindNote("");
    try {
      const r = await lookupCompanyFn({ data: { name: name.trim(), website: website.trim(), linkedinUrl: linkedin.trim() } });
      if (!website.trim() && r.website) setWebsite(r.website);
      if (!linkedin.trim() && r.linkedinUrl && isLinkedInCompanyUrl(r.linkedinUrl)) setLinkedin(normalizeLinkedinUrl(r.linkedinUrl));
      if (!focusArea.trim() && r.focusArea) setFocusArea(r.focusArea);
      if (!location.trim() && r.location) setLocation(r.location);
      if (!description.trim() && r.description) setDescription(r.description);
      setFindNote(
        r.website || r.description
          ? "Filled empty fields. Check the website and LinkedIn are the right company before saving."
          : "No match found. Add the website or LinkedIn page by hand.",
      );
    } catch (e) {
      console.error("lookupCompany failed", e);
      setFindNote("Lookup failed. Try again, or enter the website by hand.");
    } finally {
      setFinding(false);
    }
  };

  useEffect(() => {
    if (!open || !company) return;
    setName(company.name || "");
    setWebsite(company.website || "");
    setFocusArea(company.sector || "");
    setLocation(company.location || "");
    setDescription(company.description || "");
    setAliases((company.domainAliases || []).join(", "));
    setLinkedin(company.linkedinUrl || "");
    setBusy(false);
    setFindNote("");
  }, [open, company]);

  const submit = async () => {
    if (!company || !name.trim() || linkedinInvalid) return;
    setBusy(true);
    try {
      const payload = {
        urid: company.urid,
        matchName: company.name,
        name: name.trim(),
        website: website.trim(),
        focusArea: focusArea.trim(),
        location: location.trim(),
        description: description.trim(),
        domainAliases: parseDomainList(aliases),
        linkedinUrl: normalizeLinkedinUrl(linkedin),
        // Companies that live only in Asana (no sheet row yet) get one created
        // on save so they become editable like every other portfolio company.
        upsertNew: company.id.startsWith("asana-pc-"),
      };
      const res = await updatePortfolioCompany({ data: payload });
      if (!res.updated) {
        toast.error("Couldn't find that company in the sheet to update.");
        return;
      }
      const rejected = new Set((res.rejectedDomains || []).map((r) => r.domain));
      for (const r of res.rejectedDomains || []) toast.warning(`${r.domain} not added: ${r.reason}.`);
      const updated: PortfolioCompany = {
        ...company,
        urid: company.urid || res.urid,
        domainAliases: payload.domainAliases.filter((d) => !rejected.has(d)),
        name: payload.name,
        website: payload.website,
        sector: payload.focusArea,
        domain: domainFromFocus(payload.focusArea),
        location: payload.location,
        description: payload.description,
        linkedinUrl: payload.linkedinUrl,
      };
      toast.success(
        res.created ? `Added ${payload.name} to the portfolio sheet.` : `Updated ${payload.name}.`,
      );
      await onSaved?.(updated);
      onOpenChange(false);
    } catch (e) {
      console.error("updatePortfolioCompany failed", e);
      toast.error(e instanceof Error && e.message ? e.message : "Couldn't update the company — see console.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit portfolio company</DialogTitle>
          <DialogDescription className="text-xs">
            Updates the Portfolio Companies sheet row. Website and other email domains are used to match Key People.
            If the company isn't in the sheet yet (Asana-only), saving creates its row.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void findCompany()} disabled={finding || !name.trim()}>
            {finding && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Find website &amp; details
          </Button>
          {findNote && <span className="text-[11px] text-muted-foreground">{findNote}</span>}
        </div>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2">
            <Label className={labelClass}>Company name *</Label>
            <Input
              className="h-8 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Coactive AI"
              autoFocus
            />
          </div>
          <div className="col-span-2">
            <Label className={labelClass}>Website</Label>
            <Input
              className="h-8 text-sm"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="coactive.ai"
            />
          </div>
          <div className="col-span-2">
            <Label className={labelClass}>LinkedIn page</Label>
            <Input
              className="h-8 text-sm"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="linkedin.com/company/coactive-ai"
              aria-invalid={linkedinInvalid}
            />
            {linkedinInvalid && (
              <p className="mt-1 text-[10px] text-destructive">
                Enter a LinkedIn company page, e.g. linkedin.com/company/acme.
              </p>
            )}
          </div>
          <div className="col-span-2">
            <Label className={labelClass}>Other email domains</Label>
            <Input
              className="h-8 text-sm"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="mavenagi.com, maven.ai"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              People with these email addresses show as Key People. Gmail, Outlook and similar are never used.
            </p>
          </div>
          <div>
            <Label className={labelClass}>Focus area</Label>
            <Input
              className="h-8 text-sm"
              value={focusArea}
              onChange={(e) => setFocusArea(e.target.value)}
              placeholder="AI / Data"
            />
          </div>
          <div>
            <Label className={labelClass}>HQ</Label>
            <Input
              className="h-8 text-sm"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="San Jose, CA"
            />
          </div>
          <div className="col-span-2">
            <Label className={labelClass}>Summary</Label>
            <Textarea
              className="text-sm min-h-[64px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What the company does…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !name.trim() || linkedinInvalid}>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Pencil className="h-3.5 w-3.5 mr-1" />
            )}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

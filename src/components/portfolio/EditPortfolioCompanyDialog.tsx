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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { updatePortfolioCompany } from "@/utils/sheets.functions";
import { normalizeFocusArea } from "@/lib/focus-area-utils";
import { toast } from "sonner";
import { lookupCompanyFn } from "@/utils/portco-lookup.functions";
import { parseDomainList } from "@/lib/company-domains";
import { isLinkedInCompanyUrl } from "@/lib/portco-fields";
import { normalizeLinkedinUrl } from "@/lib/linkedin";
import { PROFILE_FIELD_DEFS, canonicalOption, type PortcoFieldDef } from "@/lib/portco-fields-schema";
import { editDraftValue, storedFromDraft } from "@/lib/portco-table-format";

const NONE = "__none__";
const NUMERIC = new Set(["DTC Investment ($M)", "DTC Ownership"]);
const LONG_TEXT = new Set(["Sales Momentum", "DTC - Sales Assist Activity"]);
const FIELD_LABEL: Record<string, string> = { "DTC Investment ($M)": "DTC Investment ($M)", "DTC Ownership": "DTC Ownership (%)", "GTM Marketing/PMF": "Product/Market Fit" };

/** Stored profile value → what the form starts with (choices canonical, ownership as a percent). */
function initialDraft(def: PortcoFieldDef, stored: string): string {
  const v = (stored || "").trim();
  if (NUMERIC.has(def.name)) return editDraftValue(def.name, v);
  if (def.type === "enum") return canonicalOption(def, v);
  if (def.type === "multi_enum") return v.split(/\s*,\s*/).filter(Boolean).map((x) => canonicalOption(def, x)).join(", ");
  return v;
}

function ProfileInput({ def, value, onChange }: { def: PortcoFieldDef; value: string; onChange: (v: string) => void }) {
  if (def.type === "enum") {
    const opts = def.options || [];
    return (
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE} className="text-xs italic text-muted-foreground">Clear</SelectItem>
          {value && !opts.includes(value) && <SelectItem value={value} className="text-xs">{value}</SelectItem>}
          {opts.map((o) => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (def.type === "multi_enum") {
    const cur = value ? value.split(/\s*,\s*/).filter(Boolean) : [];
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 rounded-md border border-input px-2 py-1.5">
        {(def.options || []).map((o) => (
          <label key={o} className="flex items-center gap-1.5 text-xs">
            <Checkbox checked={cur.includes(o)} onCheckedChange={(c) => onChange((c ? [...cur, o] : cur.filter((x) => x !== o)).join(", "))} />
            {o}
          </label>
        ))}
      </div>
    );
  }
  if (def.type === "date") return <Input type="date" className="h-8 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />;
  if (LONG_TEXT.has(def.name)) return <Textarea className="text-sm min-h-[56px]" value={value} onChange={(e) => onChange(e.target.value)} />;
  return (
    <Input className="h-8 text-sm" inputMode={NUMERIC.has(def.name) ? "decimal" : undefined} value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={def.name === "DTC Ownership" ? "e.g. 7.5" : def.name === "DTC Investment ($M)" ? "e.g. 2.5" : undefined} />
  );
}

function fieldValue(fields: Record<string, string> | undefined, key: string): string {
  if (!fields) return "";
  const hit = Object.keys(fields).find((k) => k.toLowerCase().trim() === key.toLowerCase());
  return hit ? fields[hit] : "";
}

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
  const [profile, setProfile] = useState<Record<string, string>>({});
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
    setProfile(Object.fromEntries(PROFILE_FIELD_DEFS.map((d) => [d.name, initialDraft(d, fieldValue(company.asanaFields, d.name))])));
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
        // Only changed profile values are sent, with the value they started from (conflict check).
        profileChanges: PROFILE_FIELD_DEFS.flatMap((d) => {
          const original = fieldValue(company.asanaFields, d.name).trim();
          const draft = (profile[d.name] || "").trim();
          if (draft === initialDraft(d, original)) return [];
          return [{ field: d.name, original, value: NUMERIC.has(d.name) ? storedFromDraft(d.name, draft) : draft }];
        }),
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
        asanaFields: (() => {
          const out: Record<string, string> = { ...(company.asanaFields || {}) };
          for (const { field: k, value: v } of payload.profileChanges) {
            for (const ok of Object.keys(out)) if (ok.toLowerCase() === k.toLowerCase()) delete out[ok];
            if (v) out[k] = v;
          }
          return out;
        })(),
      };
      toast.success(
        res.created ? `Added ${payload.name} to the portfolio sheet.` : `Updated ${payload.name}.`,
      );
      if (res.syncError) toast.warning(res.syncError, { duration: 12000 });
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {company?.name || "company"}</DialogTitle>
          <DialogDescription className="text-xs">
            Everything on the company page, saved in Venture Pulse. Investment profile changes are recorded in the change log.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <section className="space-y-3">
            <h4 className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Name &amp; tagline</h4>
            <div>
              <Label className={labelClass}>Company name *</Label>
              <Input className="h-8 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Coactive AI" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={labelClass}>Focus area</Label>
                <Input className="h-8 text-sm" value={focusArea} onChange={(e) => setFocusArea(e.target.value)} placeholder="AI / Data" />
              </div>
              <div>
                <Label className={labelClass}>HQ</Label>
                <Input className="h-8 text-sm" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="San Jose, CA" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">The tagline under the company name reads “Focus area · HQ”.</p>
            <div>
              <Label className={labelClass}>Description</Label>
              <Textarea className="text-sm min-h-[110px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the company does…" />
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Company information</h4>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void findCompany()} disabled={finding || !name.trim()}>
                {finding && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Find website &amp; details
              </Button>
            </div>
            {findNote && <p className="text-[11px] text-muted-foreground">{findNote}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={labelClass}>Website</Label>
                <Input className="h-8 text-sm" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="coactive.ai" />
              </div>
              <div>
                <Label className={labelClass}>LinkedIn page</Label>
                <Input className="h-8 text-sm" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="linkedin.com/company/coactive-ai" aria-invalid={linkedinInvalid} />
                {linkedinInvalid && <p className="mt-1 text-[10px] text-destructive">Enter a LinkedIn company page, e.g. linkedin.com/company/acme.</p>}
              </div>
              <div className="col-span-2">
                <Label className={labelClass}>Other email domains</Label>
                <Input className="h-8 text-sm" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="mavenagi.com, maven.ai" />
                <p className="mt-1 text-[10px] text-muted-foreground">People with these email addresses show as Key People. Gmail, Outlook and similar are never used.</p>
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <h4 className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">DTC investment profile</h4>
            <div className="grid grid-cols-2 gap-3">
              {PROFILE_FIELD_DEFS.map((d) => (
                <div key={d.name} className={d.type === "multi_enum" || LONG_TEXT.has(d.name) ? "col-span-2" : ""}>
                  <Label className={labelClass}>{FIELD_LABEL[d.name] || d.name}</Label>
                  <ProfileInput def={d} value={profile[d.name] || ""} onChange={(v) => setProfile((p) => ({ ...p, [d.name]: v }))} />
                </div>
              ))}
            </div>
          </section>
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

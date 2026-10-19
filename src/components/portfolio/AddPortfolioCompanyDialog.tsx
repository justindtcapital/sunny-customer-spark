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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, Loader2, Search, Users, Sparkles } from "lucide-react";
import { addPortfolioCompany, addContact } from "@/utils/sheets.functions";
import { lookupCompanyFn, suggestKeyPeopleFn } from "@/utils/portco-lookup.functions";
import { enrichContact } from "@/utils/apollo.functions";
import { toast } from "sonner";

const labelClass =
  "text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block";

type Person = { id: string; firstName: string; title: string; company: string; hasEmail: boolean };

// Create a new portfolio company. Look up by website and/or LinkedIn company URL
// (Apollo + public pages + AI summary), edit every field, optionally pick Apollo
// key people to add as Network contacts, then write the "Portfolio Companies" row.
export function AddPortfolioCompanyDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdded?: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [focusArea, setFocusArea] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);
  const [lookupNote, setLookupNote] = useState("");
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [peopleError, setPeopleError] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const reset = () => {
    setName(""); setWebsite(""); setLinkedinUrl(""); setFocusArea(""); setLocation("");
    setDescription(""); setBusy(false); setLooking(false); setLookupNote("");
    setPeople(null); setPeopleError(""); setPicked(new Set());
  };

  const canLookup = !!(website.trim() || linkedinUrl.trim() || name.trim());

  const lookup = async () => {
    setLooking(true);
    setLookupNote("");
    try {
      const r = await lookupCompanyFn({
        data: { name: name.trim(), website: website.trim(), linkedinUrl: linkedinUrl.trim() },
      });
      // Only fill blanks — never overwrite what the user already typed, except summary
      // which is the main thing being generated.
      if (!name.trim() && r.name) setName(r.name);
      if (!website.trim() && r.website) setWebsite(r.website);
      if (!linkedinUrl.trim() && r.linkedinUrl) setLinkedinUrl(r.linkedinUrl);
      if (!focusArea.trim() && r.focusArea) setFocusArea(r.focusArea);
      if (!location.trim() && r.location) setLocation(r.location);
      if (r.description) setDescription(r.description);
      setLookupNote(
        [r.sources.length ? `Filled from ${r.sources.join(", ")}.` : "", ...r.warnings].filter(Boolean).join(" "),
      );
    } catch (e) {
      setLookupNote(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLooking(false);
    }
  };

  const findPeople = async () => {
    setPeopleLoading(true);
    setPeopleError("");
    try {
      const r = await suggestKeyPeopleFn({ data: { website: website.trim(), name: name.trim() } });
      setPeople(r.people);
      setPeopleError(r.error || (r.people.length ? "" : "Apollo found no senior people for this company."));
    } finally {
      setPeopleLoading(false);
    }
  };

  const toggle = (id: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await addPortfolioCompany({
        data: {
          name: name.trim(),
          website: website.trim(),
          linkedinUrl: linkedinUrl.trim(),
          focusArea: focusArea.trim(),
          location: location.trim(),
          description: description.trim(),
        },
      });
      let added = 0;
      const chosen = (people || []).filter((p) => picked.has(p.id));
      for (const p of chosen) {
        try {
          const e = await enrichContact({ data: { id: p.id, firstName: p.firstName, company: name.trim() } });
          if (!e.found) continue;
          await addContact({
            data: {
              name: e.name || [e.firstName, e.lastName].filter(Boolean).join(" ") || p.firstName,
              role: e.title || p.title,
              company: name.trim(),
              email: e.email || "",
              phone: e.phone || "",
              location: [e.city, e.state].filter(Boolean).join(", "),
              prime: "",
              sector: "",
              temperature: "Cold",
              source: "Apollo",
              sourceContext: `Key people for ${name.trim()}`,
              headline: e.headline,
              linkedinUrl: e.linkedinUrl,
            },
          });
          added++;
        } catch (err) {
          console.error("add key person failed", p, err);
        }
      }
      toast.success(
        `Added ${name.trim()} to the portfolio${chosen.length ? ` with ${added} of ${chosen.length} key people` : ""}.`,
      );
      await onAdded?.();
      reset();
      onOpenChange(false);
    } catch (e) {
      console.error("addPortfolioCompany failed", e);
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg || "Couldn't add the company — see console.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add portfolio company</DialogTitle>
          <DialogDescription className="text-xs">
            Enter a website and/or LinkedIn company page, then Look up to fill the details. Every
            field stays editable before you add.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2">
            <Label className={labelClass}>Company name *</Label>
            <Input className="h-8 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Coactive AI" autoFocus />
          </div>
          <div>
            <Label className={labelClass}>Website</Label>
            <Input className="h-8 text-sm" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="coactive.ai" />
          </div>
          <div>
            <Label className={labelClass}>LinkedIn company URL</Label>
            <Input className="h-8 text-sm" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="linkedin.com/company/coactive-ai" />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={lookup} disabled={!canLookup || looking}>
              {looking ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1" />}
              Look up company
            </Button>
            {lookupNote && <span className="text-xs text-muted-foreground">{lookupNote}</span>}
          </div>
          <div>
            <Label className={labelClass}>Focus area</Label>
            <Input className="h-8 text-sm" value={focusArea} onChange={(e) => setFocusArea(e.target.value)} placeholder="AI / Data" />
          </div>
          <div>
            <Label className={labelClass}>HQ</Label>
            <Input className="h-8 text-sm" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="San Jose, CA" />
          </div>
          <div className="col-span-2">
            <Label className={labelClass}>
              Summary {description && <Sparkles className="inline h-3 w-3 ml-1" />}
            </Label>
            <Textarea className="text-sm min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the company does…" />
          </div>

          <div className="col-span-2 rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs">
                <div className="font-medium">Bring in key contacts from Apollo?</div>
                <div className="text-muted-foreground">Founders and senior leaders at this company, added to Network as Cold.</div>
              </div>
              <Button size="sm" variant="outline" onClick={findPeople} disabled={peopleLoading || !(website.trim() || name.trim())}>
                {peopleLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Users className="h-3.5 w-3.5 mr-1" />}
                {people ? "Search again" : "Find key people"}
              </Button>
            </div>
            {peopleError && <div className="text-xs text-muted-foreground">{peopleError}</div>}
            {people && people.length > 0 && (
              <div className="max-h-56 overflow-y-auto divide-y divide-border">
                {people.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
                    <Checkbox checked={picked.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                    <span className="font-medium">{p.firstName}</span>
                    <span className="text-muted-foreground text-xs truncate">{p.title}</span>
                  </label>
                ))}
              </div>
            )}
            {picked.size > 0 && (
              <div className="text-[11px] text-muted-foreground">
                {picked.size} selected — full names, emails and LinkedIn are revealed from Apollo when you add (uses Apollo credits).
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Building2 className="h-3.5 w-3.5 mr-1" />}
            Add company{picked.size ? ` + ${picked.size}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

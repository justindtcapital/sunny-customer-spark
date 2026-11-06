import { useEffect, useMemo, useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EventPicker, plannerUridFor } from "@/components/events/EventPicker";
import { addPlannerAttendeesFn } from "@/utils/event-planner.functions";
import { MultiSelect } from "@/components/ui/multi-select";
import { importTargets, addContact, addEvent as addEventToSheet, addPortcoIntro, addNote, fetchContactEmails, logImportResult, fetchImportHistory, storeApolloRaw } from "@/utils/sheets.functions";
import { importContactsBatch } from "@/utils/bulk-import.functions";
import { CampaignCombobox, invalidateCampaignCache } from "@/components/crm/CampaignCombobox";
import { enrichContact } from "@/utils/apollo.functions";
import { toast } from "sonner";
import { contactImportRejectReason } from "@/lib/contact-noise";
import { normalizeEmails } from "@/lib/email";
import { normalizeLinkedinUrl } from "@/lib/linkedin";
import { ENGAGEMENT_SOURCES, type EngagementSource } from "@/lib/types";
import { formatEngagementSources, mergeEngagementSources } from "@/lib/engagement-source";
import { classifyImportRows, type PreflightFix, type PreflightItem } from "@/lib/import-preflight";
import { BulkRunDialog, receiptFromOutcomes, type BulkRunState } from "@/components/crm/BulkRunDialog";
import type { BulkOutcome } from "@/lib/bulk-operation";

interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Known portfolio-company names, surfaced as suggestions for portco tagging. */
  portcoOptions?: string[];
  /** Emails of contacts that already exist — used to auto-skip duplicate rows. */
  existingEmails?: string[];
  /** Called after a successful import so the caller can refresh its data. */
  onImported?: () => void | Promise<void>;
  /** Same review flow for both lists; only the saved Relationship Status differs. */
  destination?: "network" | "prospecting";
}

interface ParsedRow {
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  location: string;
  prime: string;
  sector: string;
  linkedin: string;
  // Apollo-enrichment-only (never mapped from CSV columns).
  headline: string;
  employmentHistory: string;
}

interface ImportHistoryRow {
  importId: string;
  timestamp: string;
  filename: string;
  source: string;
  totalRows: number;
  imported: number;
  duplicates: number;
  invalid: number;
  enriched: number;
  failed: number;
}

// headline/employmentHistory are Apollo-only — never CSV columns, so they're
// excluded from the column-mapping keys.
type FieldKey = keyof Omit<ParsedRow, "headline" | "employmentHistory">;
type MapKey = FieldKey | "firstName" | "lastName";
type Mapping = Record<MapKey, number>;

// The importable fields, in display order. Name + email are required.
const FIELDS: { key: MapKey; label: string; required?: boolean }[] = [
  { key: "name", label: "Name", required: true },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email", required: true },
  { key: "title", label: "Title" },
  { key: "company", label: "Company" },
  { key: "phone", label: "Phone" },
  { key: "location", label: "Location" },
  { key: "prime", label: "Prime" },
  { key: "sector", label: "Sector" },
  { key: "linkedin", label: "LinkedIn" },
];

const NO_COLUMN = -1;

// Pragmatic email check — catches the common malformed cases (missing @, no
// domain) without rejecting valid-but-unusual addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A cell may hold several emails ("a@x.com | b@y.com" / ";"-separated). Take the
// first for validation; the full original string is kept for storage + dedup.
function firstEmail(cell: string): string {
  return cell.split(/[|;,]/)[0]?.trim() || "";
}

function emptyMapping(): Mapping {
  return { name: NO_COLUMN, firstName: NO_COLUMN, lastName: NO_COLUMN, title: NO_COLUMN, company: NO_COLUMN, email: NO_COLUMN, phone: NO_COLUMN, location: NO_COLUMN, prime: NO_COLUMN, sector: NO_COLUMN, linkedin: NO_COLUMN };
}

// Sniff the delimiter from the first non-empty line by counting candidates
// outside quotes. Handles the classic event-list exports: comma, semicolon, tab.
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) || "";
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) { bestCount = count; best = d; }
  }
  return best;
}

// Minimal CSV parser supporting quoted fields and embedded delimiters/newlines.
// `delim` defaults to comma; pass a sniffed delimiter for semicolon/tab files.
function parseCsv(text: string, delim = ","): string[][] {
  // Strip a UTF-8 BOM so it doesn't end up glued to the first header cell.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delim) { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (ch === "\r") { /* skip */ }
      else cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

// Header alias -> field. Used to pre-fill the mapping on upload.
const HEADER_MAP: Record<string, MapKey> = {
  "first name": "firstName",
  firstname: "firstName",
  "last name": "lastName",
  lastname: "lastName",
  surname: "lastName",
  "company name": "company",
  org: "company",
  "work email": "email",
  "e-mail": "email",
  "e-mail address": "email",
  mobile: "phone",
  cell: "phone",
  region: "location",
  "job title": "title",
  name: "name",
  "full name": "name",
  title: "title",
  role: "title",
  company: "company",
  organization: "company",
  email: "email",
  "email address": "email",
  phone: "phone",
  "phone number": "phone",
  location: "location",
  city: "location",
  prime: "prime",
  "relationship prime": "prime",
  sector: "sector",
  industry: "sector",
  linkedin: "linkedin",
  "linkedin url": "linkedin",
  "linkedin profile": "linkedin",
  "linkedin profile url": "linkedin",
  "li url": "linkedin",
  "profile url": "linkedin",
};

// Best-guess mapping from the header row, leaving anything unrecognized unmapped.
function autoMap(headers: string[]): Mapping {
  const result = emptyMapping();
  headers.forEach((h, i) => {
    const field = HEADER_MAP[h.trim().toLowerCase()];
    if (field && result[field] === NO_COLUMN) result[field] = i;
  });
  return result;
}

// Format Apollo employment history into one cell: "Title @ Company (current); …".
function formatEmploymentHistory(
  history?: Array<{ title: string; company: string; current: boolean }>,
): string {
  if (!history || history.length === 0) return "";
  return history
    .map((j) => {
      const base = [j.title, j.company].filter(Boolean).join(" @ ");
      return j.current ? `${base} (current)` : base;
    })
    .filter(Boolean)
    .join("; ");
}

// Best-effort Apollo enrichment for a single row — fills ONLY the blank fields
// (title, company, phone, location, sector), never overwriting what the CSV
// provided, and additionally captures the person's headline + employment
// history (columns the CSV never carries). The portfolio-company sector override
// is applied server-side on add. Returns the row unchanged on no-match/error so
// import never blocks.
async function enrichRow(r: ParsedRow): Promise<{ row: ParsedRow; enriched: boolean }> {
  // Skip the Apollo call only when every enrichable field is already present.
  if (r.title && r.company && r.phone && r.location && r.sector && r.email && r.linkedin)
    return { row: r, enriched: false };
  const parts = r.name.trim().split(/\s+/);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ");
  try {
    const result = await enrichContact({
      data: {
        email: r.email || undefined,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        company: r.company || undefined,
        linkedinUrl: r.linkedin || undefined,
      },
    });
    if (!result.found) return { row: r, enriched: false };
    const apolloLocation = [result.city, result.state].filter(Boolean).join(", ");
    const row: ParsedRow = {
      ...r,
      title: r.title || result.title || "",
      company: r.company || result.company || "",
      email: r.email || result.email || "",
      phone: r.phone || result.phone || "",
      location: r.location || apolloLocation,
      sector: r.sector || result.industry || "",
      linkedin: r.linkedin || normalizeLinkedinUrl(result.linkedinUrl),
      headline: r.headline || result.headline || "",
      employmentHistory: r.employmentHistory || formatEmploymentHistory(result.employmentHistory),
    };
    const enriched =
      row.title !== r.title ||
      row.company !== r.company ||
      row.email !== r.email ||
      row.phone !== r.phone ||
      row.location !== r.location ||
      row.sector !== r.sector ||
      row.linkedin !== r.linkedin ||
      row.headline !== r.headline ||
      row.employmentHistory !== r.employmentHistory;
    if (enriched && row.email) {
      storeApolloRaw({ data: { email: row.email, payload: result } }).catch(() => {});
    }
    return { row, enriched };
  } catch (e) {
    console.error("apollo enrich failed", r.email, e);
    return { row: r, enriched: false };
  }
}

export function BulkUploadDialog({ open, onOpenChange, portcoOptions = [], existingEmails = [], onImported, destination = "network" }: BulkUploadDialogProps) {
  const prospecting = destination === "prospecting";
  const [campaign, setCampaign] = useState("");
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Mapping>(emptyMapping());
  const [eventName, setEventName] = useState("");
  const [portcoNames, setPortcoNames] = useState<string[]>([]);
  // How the tagged contacts came to engage the selected portcos — written to the
  // "PortCos Introduced" tab's Engagement Source column (defaults to a direct intro).
  const [portcoSources, setPortcoSources] = useState<EngagementSource[]>([
    "direct introduction",
  ]);
  const [source, setSource] = useState("");
  // Hands-off by default: imported contacts are auto-enriched unless unchecked.
  const [enrichOnImport, setEnrichOnImport] = useState(true);
  // Per-person follow-up flags, keyed by lowercased email (writes Contacts →
  // "Follow Up Flag" for just the checked people).
  const [followUpEmails, setFollowUpEmails] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [fixes, setFixes] = useState<Record<number, PreflightFix>>({});
  const [reviewTab, setReviewTab] = useState<"attention" | "existing" | "skipped">("attention");
  const [run, setRun] = useState<BulkRunState | null>(null);
  const [history, setHistory] = useState<ImportHistoryRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load past imports when the dialog opens (for the Import History panel).
  useEffect(() => {
    if (!open) return;
    fetchImportHistory()
      .then((h) => setHistory(h as ImportHistoryRow[]))
      .catch((e) => console.error("fetchImportHistory failed:", e));
  }, [open]);

  const headers = grid?.[0] ?? [];
  const missingRequired = (mapping.name === NO_COLUMN && mapping.firstName === NO_COLUMN) || (!prospecting && mapping.email === NO_COLUMN);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    const g = parseCsv(text, detectDelimiter(text));
    if (g.length < 2) {
      setGrid(null);
      toast.error("That file has no data rows.");
      return;
    }
    setGrid(g);
    setFixes({});
    setMapping(autoMap(g[0]));
  };

  const setFieldColumn = (field: MapKey, idx: number) =>
    setMapping((m) => ({ ...m, [field]: idx }));

  // Build importable rows from the current column mapping, then run the pre-flight
  // checks: drop rows missing name/email, flag malformed emails, and dedupe
  // (within-file + against existing contacts). Recomputes as you remap.
  const report = useMemo(() => {
    if (!grid || grid.length < 2) {
      return { rows: [] as ParsedRow[], items: [] as PreflightItem<ParsedRow>[], skipped: 0, invalid: 0, missingRequired: 0, dataRows: 0 };
    }
    const cell = (r: string[], idx: number) => (idx >= 0 && idx < r.length ? (r[idx] || "").trim() : "");
    const all: ParsedRow[] = grid.slice(1).map((r) => ({
      name: cell(r, mapping.name) || [cell(r, mapping.firstName), cell(r, mapping.lastName)].filter(Boolean).join(" "),
      title: cell(r, mapping.title),
      company: cell(r, mapping.company),
      email: normalizeEmails(cell(r, mapping.email)),
      phone: cell(r, mapping.phone),
      location: cell(r, mapping.location),
      prime: cell(r, mapping.prime),
      sector: cell(r, mapping.sector),
      linkedin: normalizeLinkedinUrl(cell(r, mapping.linkedin)),
      headline: "",
      employmentHistory: "",
    }));

    const items = classifyImportRows(all, existingEmails, fixes, { emailOptional: prospecting });
    // Existing people are still sent: the server tags them (event/PortCo) without creating a copy.
    const unique = items.filter(i => i.status === "ready" || i.status === "existing").map(i => i.row);
    return { rows: unique, items, skipped: items.filter(i => i.status === "existing" || i.status === "skipped").length, invalid: 0, missingRequired: 0, dataRows: all.length };
  }, [grid, mapping, existingEmails, fixes, prospecting]);

  const { rows, skipped } = report;
  const items = report.items ?? [];
  const attention = items.filter(i => i.status === "attention");
  const setFix = (index: number, patch: PreflightFix) => setFixes(f => ({ ...f, [index]: { ...f[index], ...patch } }));

  // Follow-up flags are per person, keyed by the row's primary email.
  const followUpKey = (email: string) =>
    email.split(";")[0]?.trim().toLowerCase() || "";

  // Event upload ⇒ default everyone to follow-up so post-event outreach isn't missed.
  // Clearing the event doesn't wipe manual flags; picking an event re-flags the batch.
  useEffect(() => {
    if (!eventName.trim() || rows.length === 0) return;
    setFollowUpEmails(new Set(rows.map((r) => followUpKey(r.email))));
  }, [eventName, rows]);

  const reset = () => {
    setGrid(null);
    setFileName("");
    setMapping(emptyMapping());
    setEventName("");
    setPortcoNames([]);
    setPortcoSources(["direct introduction"]);
    setSource("");
    setEnrichOnImport(true);
    setFollowUpEmails(new Set());
    setFixes({});
    setCampaign("");
    setBusy(false);
  };

  const isFlaggedForFollowUp = (email: string) => followUpEmails.has(followUpKey(email));
  const toggleFollowUp = (email: string) =>
    setFollowUpEmails((prev) => {
      const next = new Set(prev);
      const k = followUpKey(email);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const submit = async () => {
    if (!rows.length) return;
    setBusy(true);
    const left = attention.length;
    setRun({ title: `Importing ${rows.length} contact${rows.length === 1 ? "" : "s"}`, step: "validate", total: enrichOnImport ? rows.length : 0, processed: 0 });
    try {
      const prepared = [];
      for (const original of rows) {
        const enriched = enrichOnImport ? await enrichRow(original) : { row: original };
        setRun(r => r && { ...r, processed: prepared.length + 1 });
        const r = enriched.row;
        prepared.push({ name:r.name,email:r.email,role:r.title,company:r.company,phone:r.phone,location:r.location,prime:r.prime,sector:r.sector,linkedin:r.linkedin,headline:r.headline,employmentHistory:r.employmentHistory,source:"CSV Import",followUp:Boolean(eventName.trim()) || isFlaggedForFollowUp(r.email) });
      }
      setRun(r => r && { ...r, step: "apply", total: 0 });
      const result = prospecting
        ? await importTargets({ data: {
            targets: prepared.map(p => { const [firstName, ...rest] = p.name.trim().split(/\s+/); return { firstName: firstName || p.email, lastName: rest.join(" "), company: p.company, role: p.role, linkedin: p.linkedin, email: p.email, phone: p.phone, location: p.location, sector: p.sector, stage: "Prospecting", source: source.trim() || "CSV Import", researchPurpose: "", reasonSurfaced: "" }; }),
            campaign: campaign.trim(), event: eventName.trim(), portcoTags: portcoNames, followUp: Boolean(eventName.trim()) || (rows.length > 0 && followUpEmails.size === rows.length),
          } })
        : await importContactsBatch({ data: { contacts:prepared,event:eventName.trim(),portcos:portcoNames,portcoSources:portcoSources,sourceNote:source.trim() } });
      if (prospecting && campaign.trim()) invalidateCampaignCache();
      setRun(r => r && { ...r, step: "verify" });
      const outcomes = ((result as { outcomes?: BulkOutcome[] }).outcomes) || [];
      const receipt = outcomes.length ? receiptFromOutcomes(outcomes, "Imported")
        : { doneLabel: "Imported", done: [{ label: `${result.added} new contacts` }], skipped: [{ label: `${result.duplicates} already in contacts` }], problems: result.review ? [{ label: `${result.review} need review in Admin` }] : [] };
      const eventUrid = eventName.trim() ? await plannerUridFor(eventName).catch(() => "") : "";
      if (eventUrid) {
        const n = await addPlannerAttendeesFn({ data: { attendees: prepared.map(p => ({ eventUrid, name: p.name, email: p.email, kind: prospecting ? "Prospect" : "Network", status: "Attended", date: "" })) } })
          .then(r => r.added).catch(() => -1);
        if (n >= 0) receipt.done.push({ label: `${n} added to ${eventName.trim()} attendees` });
        else receipt.problems.push({ label: `Couldn't add people to ${eventName.trim()} attendees`, reason: "use Match tagged attendees on Events" });
      }
      if (left) receipt.skipped.push({ label: `${left} row${left === 1 ? "" : "s"} left unfixed in the file`, reason: "not imported" });
      setRun(r => r && { ...r, step: "done", receipt });
      if (result.added) await onImported?.();
      reset(); onOpenChange(false);
    } catch (e) { setRun(r => r && { ...r, error: e instanceof Error ? e.message : "Import failed; review Admin before retrying." }); }
    finally { setBusy(false); }
  };


  return (
    <>
    <BulkRunDialog state={run} onClose={() => setRun(null)} />
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] grid-rows-[auto_1fr_auto]">
        <DialogHeader>
          <DialogTitle>{prospecting ? "Import to Prospecting" : "Import to Network"}</DialogTitle>
          <DialogDescription className="text-xs">
            Upload a CSV. Columns are auto-matched by header — adjust the mapping below if anything is off.
            {prospecting ? "Name plus an email or LinkedIn URL is required. New people enter as Prospecting." : "Name and email are required."} Optionally tag everyone by event, portfolio company, and/or source.
          </DialogDescription>
        </DialogHeader>

        {/* Body scrolls; header + footer stay pinned so Import is always reachable. */}
        <div className="space-y-4 py-2 min-h-0 overflow-y-auto -mx-6 px-6">
          <div>
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">CSV file</Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              className="h-9 text-xs"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          {grid && (
            <>
              {/* Column mapping */}
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
                  Map columns
                </Label>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {FIELDS.map((field) => {
                    const unsetRequired = field.required && mapping[field.key] === NO_COLUMN;
                    return (
                      <div key={field.key} className="flex items-center gap-2">
                        <span
                          className={`text-[11px] w-20 shrink-0 ${unsetRequired ? "text-destructive font-medium" : "text-muted-foreground"}`}
                        >
                          {field.label}{field.required ? " *" : ""}
                        </span>
                        <Select
                          value={String(mapping[field.key])}
                          onValueChange={(v) => setFieldColumn(field.key, Number(v))}
                        >
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={String(NO_COLUMN)}>— Not mapped —</SelectItem>
                            {headers.map((h, i) => (
                              <SelectItem key={i} value={String(i)}>
                                {h.trim() || `Column ${i + 1}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
                {missingRequired && (
                  <p className="text-[11px] text-destructive mt-1.5">
                    {prospecting ? "Map a Name (or First/Last name) column to enable import." : "Map both Name and Email to enable import."}
                  </p>
                )}
              </div>

              {items.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
                        Tag as attendees of event
                      </Label>
                      <EventPicker value={eventName} onChange={setEventName} placeholder="Pick an Asana event…" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
                        Tag with portfolio companies
                      </Label>
                      <MultiSelect
                        options={portcoOptions}
                        value={portcoNames}
                        onChange={setPortcoNames}
                        placeholder="Portfolio companies…"
                        className="h-9"
                      />
                      {portcoNames.length > 0 && (
                        <MultiSelect
                          options={[...ENGAGEMENT_SOURCES]}
                          value={portcoSources}
                          onChange={(v) =>
                            setPortcoSources(
                              mergeEngagementSources([], (v as EngagementSource[]) || []),
                            )
                          }
                          searchable={false}
                          placeholder="Engagement sources…"
                          formatLabel={(v) => formatEngagementSources(v as EngagementSource[])}
                          className="h-8 text-xs mt-1.5 capitalize"
                        />
                      )}
                    </div>
                    {prospecting && <div>
                      <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
                        Campaign
                      </Label>
                      <CampaignCombobox value={campaign} onChange={setCampaign} />
                    </div>}
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
                        Tag with source
                      </Label>
                      <Input
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        placeholder='e.g. "RSA 2026", "Apollo"'
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    Check <span className="font-medium text-foreground">Follow up</span> next to
                    anyone who needs a follow-up — that writes TRUE to the “Follow Up Flag” column
                    on the Contacts sheet for just those people.
                  </p>


                  <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                    <Checkbox
                      checked={enrichOnImport}
                      onCheckedChange={(v) => setEnrichOnImport(v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      Auto-enrich missing fields with Apollo (title, company, phone, location).
                      <span className="text-muted-foreground/70"> On by default — uncheck to skip for large/quota-sensitive imports.</span>
                    </span>
                  </label>

                  {/* Pre-flight validation report */}
                  <PreflightReview items={items} tab={reviewTab} setTab={setReviewTab} setFix={setFix} dataRows={report.dataRows} />

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground block">
                        Preview · {rows.length} {rows.length === 1 ? "person" : "people"}
                      </Label>
                      <span className="text-[10px] text-muted-foreground">
                        {followUpEmails.size} flagged for follow-up
                        {eventName.trim() ? " · event → all flagged" : ""}
                      </span>
                    </div>
                    <ScrollArea className="h-48 border border-border rounded">
                      <table className="w-full text-[11px]">
                        <thead className="bg-muted/40 sticky top-0">
                          <tr className="text-left">
                            <th className="px-2 py-1 font-semibold whitespace-nowrap">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <Checkbox
                                  checked={rows.length > 0 && followUpEmails.size === rows.length}
                                  onCheckedChange={(v) =>
                                    setFollowUpEmails(
                                      v === true
                                        ? new Set(rows.map((r) => followUpKey(r.email)))
                                        : new Set()
                                    )
                                  }
                                  aria-label="Flag everyone for follow-up"
                                />
                                Follow up
                              </label>
                            </th>
                            <th className="px-2 py-1 font-semibold">Name</th>
                            <th className="px-2 py-1 font-semibold">Email</th>
                            <th className="px-2 py-1 font-semibold">Company</th>
                            <th className="px-2 py-1 font-semibold">Title</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => (
                            <tr key={i} className="border-t border-border">
                              <td className="px-2 py-1">
                                <Checkbox
                                  checked={isFlaggedForFollowUp(r.email)}
                                  onCheckedChange={() => toggleFollowUp(r.email)}
                                  aria-label={`Flag ${r.name} for follow-up`}
                                />
                              </td>
                              <td className="px-2 py-1">{r.name}</td>
                              <td className="px-2 py-1 text-muted-foreground">{r.email}</td>
                              <td className="px-2 py-1">{r.company}</td>
                              <td className="px-2 py-1 text-muted-foreground">{r.title}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </div>

                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {missingRequired
                    ? (prospecting ? "Map a Name column above to continue." : "Map Name and Email above to continue.")
                    : skipped > 0
                      ? `All ${skipped} row${skipped !== 1 ? "s" : ""} are already in your contacts.`
                      : "No importable rows — check your column mapping."}
                </p>
              )}
            </>
          )}

          {/* Import History */}
          {history.length > 0 && (
            <div className="border-t border-border pt-2">
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
              >
                {showHistory ? "▾" : "▸"} Import history ({history.length})
              </button>
              {showHistory && (
                <div className="mt-2 max-h-40 overflow-auto space-y-1">
                  {history.map((h) => (
                    <div
                      key={h.importId}
                      className="flex items-center justify-between gap-2 text-[11px] border border-border rounded px-2 py-1"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{h.filename}</div>
                        <div className="text-muted-foreground">
                          {h.timestamp.slice(0, 10)} · {h.source}
                        </div>
                      </div>
                      <div className="text-right text-muted-foreground tabular-nums shrink-0">
                        <span className="text-emerald-600 font-medium">{h.imported} added</span>
                        {h.duplicates > 0 && <> · {h.duplicates} dup</>}
                        {h.invalid > 0 && <> · {h.invalid} invalid</>}
                        {h.failed > 0 && <> · {h.failed} failed</>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={rows.length === 0 || busy} onClick={submit}>
            {busy
              ? enrichOnImport ? "Enriching & importing…" : "Importing…"
              : `Import ${rows.length || ""} contact${rows.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

const TONE: Record<string, string> = { ready: "text-primary", existing: "text-muted-foreground", skipped: "text-muted-foreground", attention: "text-destructive" };

// Stage 1: everything that won't import cleanly is listed by name with the
// reason, and can be fixed or skipped here before anything is saved.
function PreflightReview({ items, tab, setTab, setFix, dataRows }: {
  items: PreflightItem<ParsedRow>[]; tab: "attention" | "existing" | "skipped";
  setTab: (t: "attention" | "existing" | "skipped") => void; setFix: (i: number, f: PreflightFix) => void; dataRows: number;
}) {
  const count = (s: string) => items.filter(i => i.status === s).length;
  const shown = items.filter(i => i.status === tab);
  const tabs: { key: "attention" | "existing" | "skipped"; label: string }[] = [
    { key: "attention", label: "Needs attention" }, { key: "existing", label: "Already in contacts" }, { key: "skipped", label: "Skipped" },
  ];
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-semibold text-foreground">Pre-flight check · {dataRows} rows</span>
        <span className={TONE.ready + " font-medium"}>{count("ready")} new, ready</span>
        <span className={TONE.existing}>{count("existing")} already in contacts</span>
        <span className={TONE.attention}>{count("attention")} need attention</span>
        <span className={TONE.skipped}>{count("skipped")} skipped</span>
      </div>
      <div className="flex gap-1">
        {tabs.map(t => (
          <Button key={t.key} type="button" size="sm" variant={tab === t.key ? "default" : "outline"} className="h-6 px-2 text-[11px]" onClick={() => setTab(t.key)}>
            {t.label} ({count(t.key)})
          </Button>
        ))}
      </div>
      <div className="max-h-40 overflow-y-auto space-y-1">
        {shown.length === 0 && <p className="text-muted-foreground">Nothing here.</p>}
        {shown.map(i => (
          <div key={i.index} className="flex flex-wrap items-center gap-2 border-t border-border pt-1">
            <span className="w-8 text-muted-foreground tabular-nums">#{i.index + 2}</span>
            {i.status === "attention" ? <>
              <Input className="h-7 w-32 text-[11px]" defaultValue={i.row.name} placeholder="Name" aria-label="Name" onBlur={e => setFix(i.index, { name: e.target.value })} />
              <Input className="h-7 w-48 text-[11px]" defaultValue={i.row.email} placeholder="Email" aria-label="Email" onBlur={e => setFix(i.index, { email: e.target.value })} />
              <span className={TONE.attention}>{i.reason}</span>
              <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px] ml-auto" onClick={() => setFix(i.index, { skip: true })}>Skip</Button>
            </> : <>
              <span className="font-medium text-foreground">{i.row.name || "(no name)"}</span>
              <span className="text-muted-foreground">{i.row.email}</span>
              <span className="text-muted-foreground">— {i.reason}</span>
              {i.reason === "Skipped by you" && <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px] ml-auto" onClick={() => setFix(i.index, { skip: false })}>Undo</Button>}
            </>}
          </div>
        ))}
      </div>
      {count("attention") > 0 && <p className="text-muted-foreground">Fix a field and click away to re-check it, or Skip. Rows still needing attention won't be imported.</p>}
    </div>
  );
}

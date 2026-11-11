import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useIsFetching, useQuery } from "@tanstack/react-query";
import {
  fetchContacts,
  fetchTargets,
  fetchPortfolioCompanies,
  fetchOwnershipIndex,
  logOpsEvent,
  addContact,
  addEvent as addEventToSheet,
  addPortcoIntro,
  addNote,
} from "@/utils/sheets.functions";
import { EventPicker } from "@/components/events/EventPicker";
import { MultiSelect } from "@/components/ui/multi-select";
import { Textarea } from "@/components/ui/textarea";
import { ENGAGEMENT_SOURCES, type EngagementSource } from "@/lib/types";
import { formatEngagementSources, mergeEngagementSources } from "@/lib/engagement-source";
import type { Contact, PortfolioCompany, TargetLead } from "@/lib/types";
import type { PyramidTier } from "@/lib/network-pyramid";
import { DEFAULT_VISIBLE_TIERS, prospectAsContact, tierVisible, toggleTier } from "@/lib/network-tiers";
import { classifyContacts, kindShown, toggleKind, type ContactKind } from "@/lib/contact-kind";
import { usePartners } from "@/lib/use-partners";

import { ContactList } from "@/components/crm/ContactList";
import { syncEventExposure } from "@/utils/event-exposure.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Upload, Download, ClipboardPaste, ChevronDown, Loader2, Users } from "lucide-react";
import { DuplicatesDialog } from "@/components/crm/DuplicatesDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useFilters } from "@/lib/filter-context";
import { useFilterOptions } from "@/lib/filter-options-context";
import { useSelection } from "@/lib/selection-context";
import { useAuth } from "@/lib/auth-context";
import { teamProfile } from "@/lib/user-ownership";
import { NetworkPyramid, PyramidViewSwitch, contactMatchesPyramid, type PyramidSelection, type PyramidView } from "@/components/crm/NetworkPyramid";
import { createPortal } from "react-dom";
import { usePageActionsSlot } from "@/lib/page-actions-slot";
import { BulkUploadDialog } from "@/components/crm/BulkUploadDialog";
import { SmartPasteDialog } from "@/components/crm/SmartPasteDialog";
import { canonicalLocations } from "@/lib/location-utils";
import { Checkbox } from "@/components/ui/checkbox";
import { enrichContact } from "@/utils/apollo.functions";
import { contactsToCsv, downloadCsv } from "@/lib/csv-export";
import { contactsToXlsx, downloadXlsx } from "@/lib/xlsx-export";
import { FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/crm")({
  // `?contact=<email>` deep-links to a single contact (e.g. from the home page's
  // "Needs your attention" list) and opens its detail panel.
  validateSearch: (search: Record<string, unknown>): { contact?: string } => ({
    contact: typeof search.contact === "string" ? search.contact : undefined,
  }),
  head: () => ({
    meta: [
      { title: "CRM — VenturePulse" },
      { name: "description", content: "Manage your DTC network contacts" },
      { property: "og:title", content: "CRM — VenturePulse" },
      { property: "og:description", content: "Manage your DTC network contacts" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async () => {
    const [contacts, companies, prospects] = await Promise.all([
      fetchContacts(),
      fetchPortfolioCompanies().catch((): PortfolioCompany[] => []),
      fetchTargets().catch((): TargetLead[] => []),
    ]);
    return { contacts, companies, prospects };
  },
  component: CrmPage,
});


function CrmPage() {
  const { contacts: allContacts, companies, prospects } = Route.useLoaderData() as {
    contacts: Contact[];
    companies: PortfolioCompany[];
    prospects: TargetLead[];
  };
  const { contact: focusEmail } = Route.useSearch();
  // Each person gets a read-time type (PortCo / Dell / Partner / Network); a manual Contact Type wins.
  const partners = usePartners();
  const portcoNames = useMemo(() => companies.map((c) => c.name), [companies]);
  const contacts = useMemo(() => classifyContacts(allContacts, { portcoNames, partners }), [allContacts, portcoNames, partners]);
  // Type checkboxes drive both the list and the pyramid numbers.
  const [hiddenKinds, setHiddenKinds] = useState<ContactKind[]>([]);
  const { filters, setFilters } = useFilters();
  const [pyramidView, setPyramidView] = useState<PyramidView>("domain");
  const pyramidFetching = useIsFetching({ queryKey: ["network-pyramid"] });
  const actionsSlot = usePageActionsSlot();
  const { email, ready: authReady } = useAuth();
  const profile = useMemo(() => teamProfile(email), [email]);
  const ownershipQuery = useQuery({
    queryKey: ["ownership-index", email],
    queryFn: () => fetchOwnershipIndex({ data: { email: email! } }),
    enabled: Boolean(authReady && email),
    staleTime: 60_000,
  });
  const ownedGids = useMemo(
    () => new Set(ownershipQuery.data?.ownedGids || []),
    [ownershipQuery.data?.ownedGids],
  );
  const { updateOptions } = useFilterOptions();
  const { allFilteredContacts, selectedContacts, setOnBulkDelete } = useSelection();
  const router = useRouter();
  const navigate = useNavigate({ from: "/crm" });
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [pyramidSel, setPyramidSel] = useState<PyramidSelection | null>(null);
  const [visibleTiers, setVisibleTiers] = useState<PyramidTier[]>(DEFAULT_VISIBLE_TIERS);
  const prospectContacts = useMemo(() => classifyContacts(prospects.map(prospectAsContact), { portcoNames, partners }), [prospects, portcoNames, partners]);
  const tierContacts = useMemo(() => contacts.filter((c) => kindShown(c, hiddenKinds)), [contacts, hiddenKinds]);
  const hiddenEmails = useMemo(() => new Set([...contacts, ...prospectContacts].filter((c) => !kindShown(c, hiddenKinds))
    .flatMap((c) => (c.email || "").split(/[;,\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))), [contacts, prospectContacts, hiddenKinds]);
  const listContacts = useMemo(() => {
    const all = [...tierContacts, ...prospectContacts.filter((c) => kindShown(c, hiddenKinds))].filter((c) => tierVisible(c, visibleTiers));
    return pyramidSel ? all.filter((c) => contactMatchesPyramid(c, pyramidSel)) : all;
  }, [tierContacts, prospectContacts, hiddenKinds, pyramidSel, visibleTiers]);
  const onToggleKind = (k: ContactKind) => { setPyramidSel(null); setHiddenKinds((h) => toggleKind(h, k)); };
  const onToggleTier = (t: PyramidTier) => { setPyramidSel(null); setVisibleTiers((v) => toggleTier(v, t)); };
  const [pasteOpen, setPasteOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    company: "",
    title: "",
    linkedinUrl: "",
  });
  const [addEnrich, setAddEnrich] = useState(true);
  // Optional tagging applied right after the contact row lands (same shape as
  // the bulk importer: event, portco engagement, interaction note, follow-up).
  const [addEventName, setAddEventName] = useState("");
  const [addPortcos, setAddPortcos] = useState<string[]>([]);
  const [addPortcoSources, setAddPortcoSources] = useState<EngagementSource[]>([
    "direct introduction",
  ]);
  const [addNoteText, setAddNoteText] = useState("");
  const [addFollowUp, setAddFollowUp] = useState(false);


  const handleAddContact = async () => {
    const name = addForm.name.trim();
    const emailAddr = addForm.email.trim().toLowerCase();
    if (!name) {
      toast.error("Name is required.");
      return;
    }
    if (!emailAddr || !emailAddr.includes("@")) {
      toast.error("A valid email is required so we can find and update this contact later.");
      return;
    }
    if (addBusy) return;
    setAddBusy(true);
    try {
      // Stamp the signed-in teammate as Relationship Prime so the contact shows
      // under the "My contacts" ownership filter.
      const prime = profile?.displayName || email || "";

      let role = addForm.title.trim();
      let company = addForm.company.trim();
      let linkedinUrl = addForm.linkedinUrl.trim();
      let phone = "";
      let location = "";
      let sector = "";
      let enriched = false;

      if (addEnrich) {
        try {
          const parts = name.split(/\s+/).filter(Boolean);
          const r = await enrichContact({
            data: {
              email: emailAddr,
              firstName: parts[0] || undefined,
              lastName: parts.slice(1).join(" ") || undefined,
              company: company || undefined,
              linkedinUrl: linkedinUrl || undefined,
            },
          });
          if (r.found) {
            role = role || r.title || "";
            company = company || r.company || "";
            linkedinUrl = linkedinUrl || (r.linkedinUrl || "").replace(/\/+$/, "");
            phone = r.phone || "";
            location = [r.city, r.state].filter(Boolean).join(", ");
            sector = r.industry || "";
            enriched = true;
          }
        } catch (err) {
          console.error("add contact enrich failed", err);
        }
      }

      const evt = addEventName.trim();
      const portcos = addPortcos.map((p) => p.trim()).filter(Boolean);
      const noteText = addNoteText.trim();
      // Event-tagged people always get a follow-up flag, like the bulk importer.
      const followUp = addFollowUp || Boolean(evt);

      await addContact({
        data: {
          name,
          role,
          company,
          email: emailAddr,
          phone,
          location,
          linkedinUrl,
          prime,
          sector,
          temperature: "Cold",
          source: "Manual Entry",
          skipPortfolioSector: true,
          followUp,
        },
      });

      // Each tag is best-effort and independent — a failure doesn't lose the contact.
      const tagged: string[] = [];
      if (evt) {
        try {
          await addEventToSheet({
            data: { contactEmail: emailAddr, eventName: evt, type: "attended", flagFollowUp: true },
          });
          tagged.push(`event "${evt}"`);
        } catch (err) {
          console.error("event tag failed", err);
        }
      }
      for (const portco of portcos) {
        try {
          await addPortcoIntro({
            data: {
              contactEmail: emailAddr,
              portcoName: portco,
              sources: mergeEngagementSources([], addPortcoSources),
            },
          });
        } catch (err) {
          console.error("portco tag failed", portco, err);
        }
      }
      if (portcos.length > 0) tagged.push(`${portcos.length} portco${portcos.length > 1 ? "s" : ""}`);
      if (noteText) {
        try {
          await addNote({
            data: { contactEmail: emailAddr, noteContent: noteText, requiresFollowUp: followUp },
          });
          tagged.push("interaction note");
        } catch (err) {
          console.error("note failed", err);
        }
      }

      toast.success(
        `Added ${name} to your network.${addEnrich ? (enriched ? " Enriched with Apollo." : " No Apollo match found.") : ""}${tagged.length ? ` Tagged: ${tagged.join(", ")}.` : ""}${followUp ? " Flagged for follow-up." : ""}`,
      );
      setAddContactOpen(false);
      setAddForm({ name: "", email: "", company: "", title: "", linkedinUrl: "" });
      setAddEventName("");
      setAddPortcos([]);
      setAddPortcoSources(["direct introduction"]);
      setAddNoteText("");
      setAddFollowUp(false);

      await router.invalidate();
      await navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, contact: emailAddr }) });
    } catch (e) {
      console.error("addContact failed", e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(
        /ENOTFOUND|fetch failed|network/i.test(msg)
          ? "Couldn't reach Google Sheets — check your network connection."
          : "Couldn't save contact to the sheet — see console.",
      );
    } finally {
      setAddBusy(false);
    }
  };

  // Export the checkbox-selected contacts if any are selected, otherwise
  // everything currently in view (respecting active filters).
  const handleExport = (format: "csv" | "xlsx") => {
    const toExport = selectedContacts.length > 0 ? selectedContacts : allFilteredContacts;
    if (toExport.length === 0) {
      toast.error("No contacts to export.");
      return;
    }
    const date = new Date().toISOString().split("T")[0];
    const filename = format === "xlsx" ? `contacts-${date}.xlsx` : `contacts-${date}.csv`;
    if (format === "xlsx") {
      downloadXlsx(filename, contactsToXlsx(toExport));
    } else {
      downloadCsv(filename, contactsToCsv(toExport));
    }
    const label = format === "xlsx" ? "Excel" : "CSV";
    toast.success(
      `Exported ${toExport.length} contact${toExport.length !== 1 ? "s" : ""} to ${label}.`,
    );
    void logOpsEvent({
      data: {
        action: "export",
        source: format === "xlsx" ? "contacts_xlsx" : "contacts_csv",
        status: "ok",
        summary: `Exported ${toExport.length} contacts to ${filename}`,
        records: toExport.length,
        details: {
          format,
          filename,
          selection: selectedContacts.length > 0 ? "selected" : "filtered_view",
        },
        items: toExport.slice(0, 80).map((c) => {
          const email = (c.email || "").split(";")[0]?.trim() || "";
          return `${c.name || "(no name)"}${email ? ` <${email}>` : ""}${c.company ? ` · ${c.company}` : ""}`;
        }),
      },
    }).catch((e) => console.error("logOpsEvent export failed", e));
  };

  // Portfolio-company names — from the Portfolio sheet plus any already recorded
  // as intros — offered as suggestions when tagging a bulk import by portco.
  const portcoOptions = useMemo(
    () =>
      [
        ...new Set(
          [
            ...companies.map((c) => c.name),
            ...contacts.flatMap((c) => c.portCoIntros || []),
          ].filter(Boolean),
        ),
      ].sort(),
    [companies, contacts],
  );

  // After a bulk delete, re-run the loader so the removed contacts drop out of view.
  useEffect(() => {
    setOnBulkDelete(() => void router.invalidate());
    return () => setOnBulkDelete(undefined);
  }, [setOnBulkDelete, router]);

  useEffect(() => {
    const sectors = [...new Set(contacts.map((x) => x.sector).filter(Boolean))].sort();
    const primes = [...new Set(contacts.map((x) => x.prime).filter(Boolean))].sort();
    const areasOfInterest = [
      ...new Set(contacts.flatMap((x) => x.areasOfInterest).filter(Boolean)),
    ].sort();
    // Condense near-duplicate location strings (e.g. "San Francisco, CA" vs
    // "San Francisco, California") into one canonical entry per place.
    const cities = canonicalLocations(contacts.map((x) => x.location));
    // Portfolio company names — sourced from the Portfolio sheet plus any
    // intros already recorded against contacts (so the dropdown is never empty
    // even before /portfolio has been visited).
    const portcoFromIntros = contacts.flatMap((c) => c.portCoIntros || []);
    const portfolioCompanies = [
      ...new Set([...companies.map((c) => c.name), ...portcoFromIntros].filter(Boolean)),
    ].sort();
    updateOptions({ sectors, primes, areasOfInterest, allCities: cities, portfolioCompanies });
  }, [contacts, companies, updateOptions]);

  // Import / Export sit in the left menu below Detailed search; inline when the menu is closed.
  const importExport = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 flex-1 text-xs">
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Import
            <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onClick={() => setPasteOpen(true)}>
            <ClipboardPaste className="h-3.5 w-3.5 mr-2" />
            Paste Contacts
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setBulkUploadOpen(true)}>
            <Upload className="h-3.5 w-3.5 mr-2" />
            Upload CSV
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDuplicatesOpen(true)}>
            <Users className="h-3.5 w-3.5 mr-2" />
            Find duplicates
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 flex-1 text-xs">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
            <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onClick={() => handleExport("csv")}>
            <FileText className="h-3.5 w-3.5 mr-2" />
            Export as CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport("xlsx")}>
            <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
            Export as Excel
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  return (
    <div className="min-w-0 p-4 sm:p-6 max-w-[1400px] mx-auto">
      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-foreground">Network CRM</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage and track your DTC network relationships
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pyramidFetching > 0 && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Loading" />}
          <PyramidViewSwitch view={pyramidView} onChange={setPyramidView} />
        </div>
      </div>

      {actionsSlot && createPortal(importExport, actionsSlot)}

      <NetworkPyramid contacts={tierContacts} profile={profile} ownedGids={ownedGids} selection={pyramidSel} onSelect={setPyramidSel} visibleTiers={visibleTiers} onToggleTier={onToggleTier} excludeEmails={hiddenEmails} view={pyramidView} expanded onExpandedChange={() => {}} />
      <ContactList
        hiddenKinds={hiddenKinds}
        onToggleKind={onToggleKind}
        toolbarExtra={
          <>
            <div className="mr-2 inline-flex rounded-md border p-0.5" aria-label="Network scope">
              {(["mine", "everyone"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={filters.ownershipScope === s || (s === "mine" && filters.ownershipScope !== "everyone") ? "default" : "ghost"}
                  aria-pressed={s === "everyone" ? filters.ownershipScope === "everyone" : filters.ownershipScope !== "everyone"}
                  disabled={s === "mine" && !profile}
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setFilters({ ...filters, ownershipScope: s })}
                >
                  {s === "mine" ? "My contacts" : "Everyone"}
                </Button>
              ))}
            </div>
            <Button size="sm" className="mr-2 h-7 text-xs" onClick={() => setAddContactOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Contact
            </Button>
            {!actionsSlot && <div className="mr-2 flex gap-1">{importExport}</div>}
          </>
        }
        contacts={listContacts}
        filters={filters}
        focusEmail={focusEmail}
        teamProfile={profile}
        ownedGids={ownedGids}
        ownershipLoading={ownershipQuery.isFetching}
      />

      <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>
              Add one person to your network. They’ll be assigned to you as Relationship Prime.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleAddContact();
            }}
          >
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                className="h-9 text-sm"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
                Email <span className="text-destructive">*</span>
              </label>
              <Input
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="name@company.com"
                className="h-9 text-sm"
                required
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
                Company
              </label>
              <Input
                value={addForm.company}
                onChange={(e) => setAddForm((f) => ({ ...f, company: e.target.value }))}
                placeholder="Company"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
                Title
              </label>
              <Input
                value={addForm.title}
                onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Role / title"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
                LinkedIn
              </label>
              <Input
                value={addForm.linkedinUrl}
                onChange={(e) => setAddForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
                placeholder="https://linkedin.com/in/..."
                className="h-9 text-sm"
              />
            </div>

            <div className="pt-1 border-t border-border" />

            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
                Tie to event
              </label>
              <EventPicker
                value={addEventName}
                onChange={setAddEventName}
                placeholder="Pick an Asana event…"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
                Portfolio interactions
              </label>
              <MultiSelect
                options={portcoOptions}
                value={addPortcos}
                onChange={setAddPortcos}
                placeholder="Portfolio companies…"
                className="h-9"
              />
              {addPortcos.length > 0 && (
                <MultiSelect
                  options={[...ENGAGEMENT_SOURCES]}
                  value={addPortcoSources}
                  onChange={(v) =>
                    setAddPortcoSources(
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
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">
                Interaction trail
              </label>
              <Textarea
                value={addNoteText}
                onChange={(e) => setAddNoteText(e.target.value)}
                placeholder="What happened? e.g. “Met at RSA booth, wants intro to PortCo X”"
                className="text-sm min-h-[64px]"
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={addFollowUp || Boolean(addEventName.trim())}
                onCheckedChange={(v) => setAddFollowUp(v === true)}
                disabled={Boolean(addEventName.trim())}
                className="mt-0.5"
              />
              <span>
                Flag for follow-up.
                <span className="text-muted-foreground/70">
                  {" "}
                  Writes TRUE to “Follow Up Flag” on the Contacts sheet
                  {addEventName.trim() ? " — always on for event-tagged people." : "."}
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={addEnrich}
                onCheckedChange={(v) => setAddEnrich(v === true)}
                className="mt-0.5"
              />
              <span>
                Enrich with Apollo on add.
                <span className="text-muted-foreground/70">
                  {" "}
                  Fills in title, company, phone, location and sector when found.
                </span>
              </span>
            </label>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddContactOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  addBusy || !addForm.name.trim() || !addForm.email.trim().includes("@")
                }
              >
                {addBusy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />{" "}
                    {addEnrich ? "Enriching & saving…" : "Saving…"}
                  </>
                ) : (
                  "Add contact"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <BulkUploadDialog
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        portcoOptions={portcoOptions}
        existingEmails={allContacts.map((c) => c.email)}
        onImported={() => router.invalidate()}
      />

      <DuplicatesDialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen} onChanged={() => void router.invalidate()} />

      <SmartPasteDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        existingEmails={allContacts.map((c) => c.email)}
        onImported={() => router.invalidate()}
      />
    </div>
  );
}

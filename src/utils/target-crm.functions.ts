import { createServerFn } from "@tanstack/react-start";
import {
  addContactRow,
  bulkDeleteTargets,
  appendInteractionRows,
  buildContacts,
  bulkUpdateTargetFields,
  ensureColumn,
  logOpsEvent,
  TAB_NAMES,
  type InteractionRowInput,
} from "./sheets.server";
import { normalizeSource, type OutreachAttempt, type RecordSource } from "@/lib/types";
import { todayIso } from "@/lib/sheet-date";

export interface PromoteTargetInput {
  urid?: string;
  /** Legacy join key (email or name|company). */
  key?: string;
  name: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  sector?: string;
  originSource?: string;
  reasonSurfaced?: string;
  notes?: string;
  outreach?: OutreachAttempt[];
  /** Campaign the target was imported under — persisted onto the Contact. */
  campaign?: string;
  /** Event roster the target came from — persisted onto the Contact. */
  event?: string;
  /** Portfolio companies the sourcing campaign was for. */
  portcoTags?: string[];
  /** Pending follow-up carries into the CRM contact. */
  followUp?: boolean;
  /** Contact Prime set on the target. */
  prime?: string;
}

export interface PromoteTargetsResult {
  ok: boolean;
  error?: string;
  /** New Contacts rows. */
  added: number;
  /** Already in CRM (dedupe). */
  duplicates: number;
  /** Couldn't identify / write. */
  failed: number;
  /** Targets whose Stage was set to Ready to Promote. */
  stagesUpdated: number;
  /** Notes rows written (promo summary + outreach). */
  notesLogged: number;
  /** Targets removed from Prospecting after their CRM record was verified. */
  removedFromProspecting: number;
  /** Targets kept in Prospecting because the CRM write couldn't be verified. */
  keptInProspecting: number;
  created: string[];
}

function dedupeKeys(name: string, company: string, email: string, linkedin: string): string[] {
  const keys: string[] = [];
  const e = (email || "").trim().toLowerCase();
  if (e) keys.push(`e:${e}`);
  const li = (linkedin || "").trim().toLowerCase().replace(/\/$/, "");
  if (li) keys.push(`li:${li}`);
  const nc = `${(name || "").trim()}|${(company || "").trim()}`.toLowerCase();
  if (nc.length > 1) keys.push(`nc:${nc}`);
  return keys;
}

function recordSourceFromOrigin(origin?: string): RecordSource {
  return normalizeSource(origin);
}

/**
 * Promote Targets into the Network CRM: create Contacts (deduped), stamp stage
 * Ready to Promote, log a promo note (+ outreach history), Ops Log `targets_crm`.
 */
export const promoteTargetsToCrm = createServerFn({ method: "POST" })
  .inputValidator((data: { targets: PromoteTargetInput[] }) => data)
  .handler(async ({ data }): Promise<PromoteTargetsResult> => {
    const result: PromoteTargetsResult = {
      ok: true,
      added: 0,
      duplicates: 0,
      failed: 0,
      stagesUpdated: 0,
      notesLogged: 0,
      removedFromProspecting: 0,
      keptInProspecting: 0,
      created: [],
    };
    const targets = (data.targets || []).filter((t) => t.name?.trim() || t.email?.trim());
    if (targets.length === 0) {
      return { ...result, ok: false, error: "No targets to promote" };
    }

    try {
      const existing = new Set<string>();
      try {
        const contacts = await buildContacts();
        for (const c of contacts) {
          for (const k of dedupeKeys(c.name, c.company, c.email, c.linkedinUrl || "")) {
            existing.add(k);
          }
        }
      } catch {
        /* proceed without full dedupe */
      }

      await ensureColumn(TAB_NAMES.contacts, "Source");
      await ensureColumn(TAB_NAMES.contacts, "Source Context");
      // Provenance columns so campaign/event history survives the promote.
      await ensureColumn(TAB_NAMES.contacts, "Campaign");
      await ensureColumn(TAB_NAMES.contacts, "Event");
      await ensureColumn(TAB_NAMES.contacts, "PortCo Tags");

      const noteRows: InteractionRowInput[] = [];
      const candidates: { t: PromoteTargetInput; keys: string[] }[] = [];
      const seen = new Set<string>();
      const today = todayIso();

      for (const t of targets) {
        const name = (t.name || "").trim();
        const email = (t.email || "").trim();
        const company = (t.company || "").trim();
        const linkedin = (t.linkedinUrl || "").trim();
        const keys = dedupeKeys(name, company, email, linkedin);

        if (keys.length === 0) {
          result.failed++;
          continue;
        }
        const outreachBits = (t.outreach || []).map(
          (o) => `${o.date || "?"} ${o.method || "touch"}: ${(o.summary || "").slice(0, 160)}`,
        );
        const provenanceBits = [
          t.campaign?.trim() ? `Campaign: ${t.campaign.trim()}` : "",
          t.event?.trim() ? `Event: ${t.event.trim()}` : "",
          (t.portcoTags || []).length ? `PortCos: ${(t.portcoTags || []).join(", ")}` : "",
          t.originSource ? `Source: ${t.originSource}` : "",
          t.prime?.trim() ? `Prime: ${t.prime.trim()}` : "",
        ].filter(Boolean);
        const historySummary = [
          `Promoted from Prospecting${t.reasonSurfaced ? ` · ${t.reasonSurfaced}` : ""}`,
          provenanceBits.join(" · "),
          t.notes?.trim() ? `Research notes: ${t.notes.trim()}` : "",
          outreachBits.length ? `Outreach history:\n${outreachBits.join("\n")}` : "",
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 4000);
        const pushNote = () => {
          if (!email) return;
          noteRows.push({
            email,
            date: today,
            summary: historySummary,
            type: "note",
            requiresFollowUp: false,
            sourceRef: t.urid ? `target:${t.urid}` : `target:${email.toLowerCase()}`,
          });
        };

        if (keys.some((k) => existing.has(k) || seen.has(k))) {
          result.duplicates++;
          // Already in the CRM: still carry the prospecting history onto the contact.
          pushNote();
          candidates.push({ t, keys });
          continue;
        }

        const source = recordSourceFromOrigin(t.originSource);
        const sourceContext = [
          t.campaign?.trim() ? `Campaign: ${t.campaign.trim()}` : "",
          t.event?.trim() ? `Event: ${t.event.trim()}` : "",
          t.reasonSurfaced?.trim(),
          t.notes?.trim(),
          // No email → Notes can't join; keep outreach on the contact itself.
          !email && outreachBits.length ? `Outreach: ${outreachBits.join(" | ")}` : "",
          "Promoted from Prospecting",
        ]
          .filter(Boolean)
          .join(" · ")
          .slice(0, email ? 500 : 2000);

        try {
          await addContactRow({
            name: name || email,
            role: t.title || "",
            company,
            email,
            phone: t.phone || "",
            location: t.location || "",
            prime: t.prime?.trim() || "",
            sector: t.sector || "",
            temperature: "Warm",
            linkedin,
            source,
            sourceContext,
            campaign: t.campaign?.trim() || "",
            campaignEvent: t.event?.trim() || "",
            portcoTags: t.portcoTags || [],
            followUp: t.followUp === true,
          });
          keys.forEach((k) => {
            seen.add(k);
            existing.add(k);
          });
          result.added++;
          const label = `${name || email}${email ? ` <${email}>` : ""}${company ? ` · ${company}` : ""}`;
          result.created.push(label);
          pushNote();
          candidates.push({ t, keys });
        } catch (e) {
          console.error("[targets-crm] addContactRow failed:", e);
          result.failed++;
        }
      }

      // History first: notes must land before anything leaves Prospecting.
      let notesOk = true;
      if (noteRows.length > 0) {
        try {
          await appendInteractionRows(noteRows);
          result.notesLogged = noteRows.length;
        } catch (e) {
          notesOk = false;
          console.error("[targets-crm] note write failed — keeping targets:", e);
        }
      }

      // Verify against a fresh CRM read, then remove only confirmed targets.
      // Outreach / strategy tabs are left intact so history stays queryable.
      const toRemove: { urid?: string; key?: string }[] = [];
      if (notesOk && candidates.length > 0) {
        try {
          const fresh = new Set<string>();
          for (const c of await buildContacts()) {
            for (const k of dedupeKeys(c.name, c.company, c.email, c.linkedinUrl || "")) fresh.add(k);
          }
          for (const { t, keys } of candidates) {
            if ((t.urid || t.key) && keys.some((k) => fresh.has(k))) {
              toRemove.push({ urid: t.urid, key: t.key });
            }
          }
        } catch (e) {
          console.error("[targets-crm] verify read failed — keeping targets:", e);
        }
      }
      if (toRemove.length > 0) {
        try {
          const del = await bulkDeleteTargets(toRemove);
          result.removedFromProspecting = del.deleted;
        } catch (e) {
          console.error("[targets-crm] prospect removal failed:", e);
        }
      }
      result.keptInProspecting = targets.length - result.removedFromProspecting;

      // Anything not removed stays visible as Ready to Promote.
      const removedSet = new Set(toRemove.map((r) => r.urid || r.key));
      const stageEntries = targets
        .filter((t) => (t.urid || t.key) && !(result.removedFromProspecting > 0 && removedSet.has(t.urid || t.key)))
        .map((t) => ({
          urid: t.urid,
          key: t.key,
          fields: { stage: "Ready to Promote" as const },
        }));
      if (stageEntries.length > 0) {
        try {
          const stageRes = await bulkUpdateTargetFields(stageEntries);
          result.stagesUpdated = stageRes.updated;
        } catch (e) {
          console.error("[targets-crm] stage update failed:", e);
        }
      }

      await logOpsEvent({
        action: "import",
        source: "targets_crm",
        status: result.added > 0 || result.duplicates > 0 ? "ok" : "error",
        summary:
          `Promoted to CRM · +${result.added} contacts` +
          (result.duplicates ? ` · ${result.duplicates} already in CRM` : "") +
          (result.notesLogged ? ` · ${result.notesLogged} notes` : "") +
          (result.removedFromProspecting ? ` · ${result.removedFromProspecting} moved out of Prospecting` : ""),
        records: result.added,
        details: {
          requested: targets.length,
          added: result.added,
          duplicates: result.duplicates,
          failed: result.failed,
          stagesUpdated: result.stagesUpdated,
          notesLogged: result.notesLogged,
          removedFromProspecting: result.removedFromProspecting,
        },
        items: result.created,
      });

      if (result.added === 0 && result.duplicates === 0 && result.failed > 0) {
        return { ...result, ok: false, error: "Couldn't promote any targets to CRM" };
      }
      return result;
    } catch (err) {
      console.error("[targets-crm] promoteTargetsToCrm failed:", err);
      const message = err instanceof Error ? err.message : "Promote to CRM failed";
      await logOpsEvent({
        action: "import",
        source: "targets_crm",
        status: "error",
        summary: message,
        records: 0,
      });
      return { ...result, ok: false, error: message };
    }
  });

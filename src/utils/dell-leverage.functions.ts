import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireTeamAuth } from "./team-auth";
import type { DellRow, StatusChange } from "@/lib/dell-leverage";

export interface DellLeverageData {
  rows: DellRow[];
  changes: StatusChange[];
  /** False when Network people couldn't be read, so stakeholder names show unlinked. */
  stakeholdersLinked: boolean;
  /** Company website per row company name, for logos. */
  websites: Record<string, string>;
  /** False when the PortCo Change Log couldn't be read. */
  movementAvailable: boolean;
  error: string;
}

/**
 * Dell Leverage Dashboard data: only the Dell-facing fields of each Dell workstream (built by the
 * pure dellRowsFrom), so DTC priorities, ROI ratings, owners and notes never leave the server.
 */
export const fetchDellLeverageFn = createServerFn({ method: "GET" })
  .middleware([requireTeamAuth])
  .handler(async (): Promise<DellLeverageData> => {
    const { readWorkstreams, CHANGE_LOG_TAB } = await import("./portco-store.server");
    const { buildContacts, buildPortfolioCompanies, fetchSheetTabIfExists } = await import("./sheets.server");
    const { dellRowsFrom, statusChangesFromLog } = await import("@/lib/dell-leverage");
    const { domainCategory } = await import("@/lib/types");
    const { portCoKey } = await import("@/lib/portco-canonical");
    try {
      const [workstreams, contacts, companies, log] = await Promise.all([
        readWorkstreams(),
        buildContacts().catch((e) => { console.error("[dell-leverage] contacts read failed", e); return null; }),
        buildPortfolioCompanies().catch(() => []),
        fetchSheetTabIfExists(CHANGE_LOG_TAB).catch((e) => { console.error("[dell-leverage] change log read failed", e); return null; }),
      ]);
      const domains = new Map(companies.map((c) => [portCoKey(c.name || ""), domainCategory(c.domain)]));
      const rows = dellRowsFrom(workstreams, { contacts, domainOf: (company) => domains.get(portCoKey(company)) || "Other" });
      const sites = new Map(companies.map((c) => [portCoKey(c.name || ""), c.website || ""]));
      const websites: Record<string, string> = {};
      for (const r of rows) { const w = sites.get(portCoKey(r.company)); if (w) websites[r.company] = w; }
      return { rows, websites, changes: log ? statusChangesFromLog(log) : [], stakeholdersLinked: !!contacts, movementAvailable: !!log, error: "" };
    } catch (e) {
      console.error("[dell-leverage] read failed", e);
      return { rows: [], websites: {}, changes: [], stakeholdersLinked: false, movementAvailable: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

/**
 * V.I.C. drafts Dell-facing engagement notes and suggested asks of Dell for the given workstreams. It reads the workstream's
 * internal notes, statuses and recent Dell status changes as background only; the output is
 * sanitized (sanitizeDellNote) and returned as a draft — nothing is saved until a person approves it.
 */
export const draftDellNotesFn = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((data) => z.object({ gids: z.array(z.string().min(1).max(80)).min(1).max(40) }).parse(data))
  .handler(async ({ data }): Promise<{ drafts: Record<string, string>; asks: Record<string, string[]>; error: string }> => {
    const { draftDellEngagementNotes } = await import("./dell-notes.server");
    try {
      const r = await draftDellEngagementNotes(data.gids);
      return { drafts: r.notes, asks: r.asks, error: "" };
    } catch (e) {
      console.error("[dell-leverage] note drafts failed", e);
      return { drafts: {}, asks: {}, error: e instanceof Error ? e.message : String(e) };
    }
  });

import { createServerFn } from "@tanstack/react-start";
import { fetchPortcoFields, fetchPortfolioEvents, discoverFields, fetchAllAsanaEvents, fetchActivities } from "./asana.server";
import { fetchAliasActivities } from "./gmail.server";
import { buildContacts, buildPortfolioCompanies } from "./sheets.server";
import { canonicalizeActivities, dedupeAcrossSources } from "@/lib/activity-canonical";
import type { PortfolioEvent, AsanaEvent, AsanaActivity, Contact } from "@/lib/types";

export interface AsanaPortcoData {
  fieldsByCompanyName: Record<string, Record<string, string>>;
  /** Lowercased key -> original display name from the Asana portco project. */
  namesByCompanyName: Record<string, string>;
  eventsByCompanyName: Record<string, PortfolioEvent[]>;
}

let didDiscover = false;
// Bumping this version forces re-discovery on deploy when GIDs change.
const DISCOVERY_VERSION = "v2";
void DISCOVERY_VERSION;

export const fetchAsanaPortcoData = createServerFn({ method: "GET" }).handler(
  async (): Promise<AsanaPortcoData> => {
    try {
      // One-time field discovery logged to server output.
      if (!didDiscover) {
        didDiscover = true;
        const portcoGid = process.env.ASANA_PORTCO_PROJECT_GID;
        const eventsGid = process.env.ASANA_EVENTS_PROJECT_GID;
        const bdGid = process.env.ASANA_BD_PROJECT_GID;
        const gtmGid = process.env.ASANA_GTM_PROJECT_GID;
        if (portcoGid) await discoverFields(portcoGid, "portco");
        if (eventsGid) await discoverFields(eventsGid, "events");
        if (bdGid) await discoverFields(bdGid, "bd");
        if (gtmGid) await discoverFields(gtmGid, "gtm");
      }

      const [fieldsMap, eventsMap] = await Promise.all([
        fetchPortcoFields(),
        fetchPortfolioEvents(),
      ]);

      return {
        fieldsByCompanyName: Object.fromEntries(
          Array.from(fieldsMap.entries()).map(([k, v]) => [k, v.fields])
        ),
        namesByCompanyName: Object.fromEntries(
          Array.from(fieldsMap.entries()).map(([k, v]) => [k, v.name])
        ),
        eventsByCompanyName: Object.fromEntries(
          Array.from(eventsMap.entries()).map(([k, v]) => [k, v])
        ),
      };
    } catch (err) {
      console.error("[asana] fetchAsanaPortcoData failed:", err);
      return { fieldsByCompanyName: {}, namesByCompanyName: {}, eventsByCompanyName: {} };
    }
  }
);

// Flat list of all Asana events for the EventPicker + /events page.
export const fetchAsanaEvents = createServerFn({ method: "GET" }).handler(
  async (): Promise<AsanaEvent[]> => {
    try {
      return await fetchAllAsanaEvents();
    } catch (err) {
      console.error("[asana] fetchAsanaEvents failed:", err);
      return [];
    }
  }
);

// BD + GTM activities, matched client-side to Contacts / PortCos for display.
// Includes emails sent to / from the configured BD + GTM Gmail aliases so the
// Asana sync view shows email touches alongside Asana tasks.
export const fetchAsanaActivities = createServerFn({ method: "GET" }).handler(
  async (): Promise<AsanaActivity[]> => {
    const [asana, gmail, contacts, companies] = await Promise.all([
      fetchActivities().catch((err) => {
        console.error("[asana] fetchAsanaActivities failed:", err);
        return [] as AsanaActivity[];
      }),
      fetchAliasActivities().catch((err) => {
        console.error("[asana] BD/GTM alias email fetch failed:", err);
        return [] as AsanaActivity[];
      }),
      buildContacts().catch(() => [] as Contact[]),
      buildPortfolioCompanies().catch(() => [] as { name: string }[]),
    ]);
    // Same canonicalization the sheet sync applies, so the feed shows CRM names
    // and content-derived companies rather than raw header/domain guesses.
    const { activities } = dedupeAcrossSources([...asana, ...gmail]);
    const out = canonicalizeActivities(
      activities,
      contacts,
      companies.map((c) => c.name).filter(Boolean),
    );
    out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return out;
  }
);

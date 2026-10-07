import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  fetchPortcoFields,
  fetchPortfolioEvents,
  fetchAllAsanaEvents,
  fetchPortcoWorkstreams,
} from "./asana.server";
import type { Workstream } from "@/lib/workstream-parse";
import { buildActivities } from "./sheets.server";
import { loadAttributionCorrections } from "./activity-attribution.server";
import { applyAttributionCorrections } from "@/lib/activity-canonical";
import type { PortfolioEvent, AsanaEvent, AsanaActivity } from "@/lib/types";

export interface AsanaPortcoData {
  fieldsByCompanyName: Record<string, Record<string, string>>;
  /** Lowercased key -> original display name from the Asana portco project. */
  namesByCompanyName: Record<string, string>;
  eventsByCompanyName: Record<string, PortfolioEvent[]>;
}

// Bumping this version forces re-discovery on deploy when GIDs change.
const DISCOVERY_VERSION = "v2";
void DISCOVERY_VERSION;

export const fetchAsanaPortcoData = createServerFn({ method: "GET" }).handler(
  async (): Promise<AsanaPortcoData> => {
    try {
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

// BD + GTM activities for display — read from the mirrored BD / GTM sheet tabs
// (populated by Sync activity from Asana + Gmail aliases). Attribution flags
// overlay immediately so a correction shows before the next sync rewrites the tab.
export const fetchAsanaActivities = createServerFn({ method: "GET" }).handler(
  async (): Promise<AsanaActivity[]> => {
    try {
      const activities = await buildActivities();
      const corrections = await loadAttributionCorrections().catch(() => []);
      return applyAttributionCorrections(activities, corrections);
    } catch (err) {
      console.error("[activity] fetchAsanaActivities (sheets) failed:", err);
      return [];
    }
  }
);

// Flat workstream list (Asana subtasks under each portco task) for the
// portfolio-company Workstreams panel and the investor dashboards.
export const fetchPortcoWorkstreamsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<Workstream[]> => {
    try {
      return await fetchPortcoWorkstreams();
    } catch (err) {
      console.error("[asana] fetchPortcoWorkstreamsFn failed:", err);
      return [];
    }
  },
);

// Clears the server-side Asana response cache so the next load reflects
// edits just made in Asana.
export const refreshAsanaCacheFn = createServerFn({ method: "POST" }).handler(async () => {
  const { clearAsanaCache } = await import("./asana.server");
  clearAsanaCache();
  return { ok: true };
});

const fieldValue = z.union([z.string().max(5000), z.array(z.string().max(64)).max(100)]);

// Writes workstream edits back to the Asana subtask (only changed fields).
export const updateWorkstreamFn = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        gid: z.string().regex(/^\d+$/),
        changes: z
          .array(
            z.object({
              gid: z.string().regex(/^\d+$/),
              type: z.enum(["text", "number", "enum", "multi_enum", "date", "other"]),
              original: fieldValue,
              value: fieldValue,
            }),
          )
          .max(40),
        completed: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ ok: true; workstream: Workstream } | { ok: false; error: string }> => {
    try {
      const { updateWorkstream } = await import("./asana.server");
      return { ok: true, workstream: await updateWorkstream(data) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

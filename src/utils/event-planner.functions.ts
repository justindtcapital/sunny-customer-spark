import { createServerFn } from "@tanstack/react-start";
import type { PlannerAttendee, PlannerEvent } from "@/lib/event-planner";
import type { HistoryLink } from "@/lib/event-history";
import { requireTeamAuth } from "./team-auth";

export const fetchPlannerFn = createServerFn({ method: "GET" }).handler(async () => {
  const { readPlannerEvents, readAttendees, activeHistoryLinks } = await import("./event-planner.server");
  try {
    const [events, attendees, historyLinks] = await Promise.all([
      readPlannerEvents(), readAttendees(), activeHistoryLinks().catch(() => [] as HistoryLink[]),
    ]);
    return { events, attendees, historyLinks, error: "" };
  } catch (e) {
    console.error("[event-planner] read failed", e);
    return { events: [] as PlannerEvent[], attendees: [] as PlannerAttendee[], historyLinks: [] as HistoryLink[], error: (e as Error).message };
  }
});

export const addPlannerEventsFn = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((d: { events: Partial<PlannerEvent>[]; by: string }) => {
    if (!Array.isArray(d?.events) || d.events.length === 0) throw new Error("No events to add");
    if (d.events.length > 1000) throw new Error("Too many rows (max 1000)");
    return d;
  })
  .handler(async ({ data,context }) => {
    const { runJournalOperation } = await import("./bulk-journal.server");
    const { addPlannerEvents } = await import("./event-planner.server");
    const r = await runJournalOperation({ kind:"event-import",page:"/events",input:data.events,actor:context,run:async journal => {
      journal.step("checking event duplicates and preserving conflicts");
      const value=await addPlannerEvents(data.events,context.teamEmail);
      return { value,outcomes:value.outcomes };
    } });
    return { ...r.value,operationId:r.operationId };
  });

export const updatePlannerEventFn = createServerFn({ method: "POST" })
  .inputValidator((d: { urid: string; patch: Partial<PlannerEvent>; expectedUpdated: string }) => {
    if (!d?.urid) throw new Error("Missing event");
    return d;
  })
  .handler(async ({ data }) => {
    const { withDeadline } = await import("./request-deadline.server");
    const { updatePlannerEvent } = await import("./event-planner.server");
    return withDeadline("updatePlannerEvent", 55_000, async (step) => {
      step("checking for changes and saving");
      return updatePlannerEvent(data.urid, data.patch, data.expectedUpdated);
    });
  });

export const syncAsanaPlannerFn = createServerFn({ method: "POST" })
  .inputValidator((d: { by: string }) => d)
  .handler(async ({ data }) => {
    const { withDeadline } = await import("./request-deadline.server");
    const { syncAsanaEvents } = await import("./event-planner.server");
    const { fetchAllAsanaEvents } = await import("./asana.server");
    return withDeadline("syncAsanaPlanner", 55_000, async (step) => {
      step("reading Asana");
      const asana = await fetchAllAsanaEvents();
      step("adding new Asana events");
      return syncAsanaEvents(asana, data.by || "");
    });
  });

/** Live Asana events for the "Show Asana data" overlay toggle (read-only). */
export const fetchAsanaOverlayFn = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchAllAsanaEvents } = await import("./asana.server");
  try {
    return { events: await fetchAllAsanaEvents(), error: "" };
  } catch (e) {
    console.error("[event-planner] Asana overlay failed", e);
    return { events: [], error: (e as Error).message };
  }
});

/** One-time: enrich planner rows from Asana and merge same-date duplicates. */
export const enrichFromAsanaFn = createServerFn({ method: "POST" })
  .inputValidator((d: { by: string }) => d)
  .handler(async ({ data }) => {
    const { withDeadline } = await import("./request-deadline.server");
    const { enrichFromAsana } = await import("./event-planner.server");
    const { fetchAllAsanaEvents } = await import("./asana.server");
    return withDeadline("enrichFromAsana", 55_000, async (step) => {
      step("reading Asana");
      const asana = await fetchAllAsanaEvents();
      step("enriching and merging events");
      return enrichFromAsana(asana, data.by || "");
    });
  });

export const extractEventFromUrlFn = createServerFn({ method: "POST" })
  .inputValidator((d: { url: string }) => {
    const u = new URL(d?.url || "");
    if (!/^https?:$/.test(u.protocol)) throw new Error("Enter a web link");
    return { url: u.toString() };
  })
  .handler(async ({ data }) => {
    const { extractEventFromUrl } = await import("./event-planner.server");
    return extractEventFromUrl(data.url);
  });

export const addPlannerAttendeesFn = createServerFn({ method: "POST" })
  .inputValidator((d: { attendees: PlannerAttendee[] }) => {
    if (!Array.isArray(d?.attendees)) throw new Error("No attendees");
    return d;
  })
  .handler(async ({ data }) => {
    const { addAttendees } = await import("./event-planner.server");
    return { added: await addAttendees(data.attendees) };
  });

export const mergePlannerEventsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { keeper: PlannerEvent; loserUrids: string[] }) => {
    if (!d?.keeper?.urid || !Array.isArray(d.loserUrids) || !d.loserUrids.length) throw new Error("Pick events to merge");
    if (d.loserUrids.includes(d.keeper.urid)) throw new Error("Keeper cannot also be merged away");
    return d;
  })
  .handler(async ({ data }) => {
    const { withDeadline } = await import("./request-deadline.server");
    const { mergeEventsManually } = await import("./event-planner.server");
    return withDeadline("mergePlannerEvents", 55_000, async (step) => {
      step("merging events");
      return mergeEventsManually(data.keeper, data.loserUrids);
    });
  });

export const deletePlannerEventFn = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((d: { urid: string; expectedUpdated: string; name?: string }) => {
    if (!d?.urid) throw new Error("Missing event");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { withDeadline } = await import("./request-deadline.server");
    const { deletePlannerEvent } = await import("./event-planner.server");
    const { logOpsEvent } = await import("./sheets.server");
    return withDeadline("deletePlannerEvent", 55_000, async (step) => {
      step("archiving and deleting event");
      const r = await deletePlannerEvent(data.urid, data.expectedUpdated, context.teamEmail);
      step("logging deletion");
      await logOpsEvent({
        action: "maintenance",
        source: "events",
        status: "ok",
        summary: `Deleted event ${data.name || data.urid}`,
        details: { by: context.teamEmail, urid: data.urid, attendees: String(r.attendees), archive: "Deleted Events tab" },
      }).catch(() => undefined);
      return r;
    });
  });

/** Read-only: propose links from past events + confirmed event activity to future Potential events. */
export const previewEventHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((d: { year: number }) => {
    const year = Math.trunc(Number(d?.year));
    if (!(year >= 2000 && year <= 2100)) throw new Error("Pick a year");
    return { year };
  })
  .handler(async ({ data }) => {
    const { withDeadline } = await import("./request-deadline.server");
    const { readPlannerEvents, activeHistoryLinks } = await import("./event-planner.server");
    const { listHarvestedActivities, listKnowledgeRecords } = await import("./knowledge.server");
    const { reviewMap, isRegisteredActivity } = await import("./notes-inbox.server");
    const { planHistoryLinks, resolveMergedUrid } = await import("@/lib/event-history");
    const { splitList } = await import("@/lib/event-planner");
    return withDeadline("previewEventHistory", 50_000, async (step) => {
      step("reading events, activities and existing links");
      const [events, existing, acts, records, reviews] = await Promise.all([
        readPlannerEvents(true), activeHistoryLinks(true), listHarvestedActivities(), listKnowledgeRecords(), reviewMap(),
      ]);
      const from = `${data.year}-01-01`, to = `${data.year}-12-31`;
      const targets = events.filter((e) => e.status === "Potential" && e.start >= from && e.start <= to);
      const pastEvents = events.filter((e) => e.start && e.start < from);
      const typeOf = new Map(records.map((r) => [r.recordId, r.sourceType as string]));
      const activities = acts
        .filter((a) => a.date && a.date < from && a.track !== "News")
        .filter((a) => typeOf.has(a.recordId) && isRegisteredActivity(typeOf.get(a.recordId) || "", reviews.get(a.recordId)))
        .map((a) => ({
          kind: "activity" as const, id: a.activityId, name: a.title, date: a.date,
          portcos: splitList(a.portco), url: a.sourceUrl, summary: a.summary, type: a.type,
        }));
      step("matching");
      const resolved = existing.map((l) => ({ ...l, targetUrid: resolveMergedUrid(l.targetUrid, events) }));
      const plan = planHistoryLinks({ targets, pastEvents, activities, existing: resolved });
      return { ...plan, targets: targets.length };
    });
  });

export const saveEventHistoryLinksFn = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((d: { links: Array<Omit<HistoryLink, "linkedBy" | "linkedAt">> }) => {
    if (!Array.isArray(d?.links) || !d.links.length) throw new Error("Nothing selected to link");
    if (d.links.length > 1000) throw new Error("Too many links (max 1000)");
    for (const l of d.links) if (!l?.targetUrid || !l.sourceId || !["event", "activity"].includes(l.kind)) throw new Error("Invalid link");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { withDeadline } = await import("./request-deadline.server");
    const { saveHistoryLinks } = await import("./event-planner.server");
    const { logOpsEvent } = await import("./sheets.server");
    return withDeadline("saveEventHistoryLinks", 50_000, async (step) => {
      step("saving links");
      const now = new Date().toISOString();
      const r = await saveHistoryLinks(data.links.map((l) => ({
        targetUrid: String(l.targetUrid), kind: l.kind, sourceId: String(l.sourceId),
        sourceName: String(l.sourceName || "").slice(0, 300), sourceDate: String(l.sourceDate || ""),
        portcos: (l.portcos || []).map(String), reason: String(l.reason || "").slice(0, 200),
        sourceUrl: String(l.sourceUrl || ""), linkedBy: context.teamEmail, linkedAt: now,
      })));
      step("logging");
      await logOpsEvent({
        action: "maintenance", source: "events", status: "ok",
        summary: `Linked ${r.added} past history item${r.added === 1 ? "" : "s"} to future events`,
        details: { by: context.teamEmail, added: String(r.added), skipped: String(r.skipped), tab: "Event History Links" },
      }).catch(() => undefined);
      return r;
    });
  });

export const unlinkEventHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((d: { targetUrid: string; kind: string; sourceId: string }) => {
    if (!d?.targetUrid || !d.sourceId) throw new Error("Missing link");
    return d;
  })
  .handler(async ({ data }) => {
    const { removeHistoryLink } = await import("./event-planner.server");
    return { removed: await removeHistoryLink(data.targetUrid, data.kind, data.sourceId) };
  });

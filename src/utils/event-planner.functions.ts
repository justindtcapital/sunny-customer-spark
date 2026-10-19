import { createServerFn } from "@tanstack/react-start";
import type { PlannerAttendee, PlannerEvent } from "@/lib/event-planner";

export const fetchPlannerFn = createServerFn({ method: "GET" }).handler(async () => {
  const { readPlannerEvents, readAttendees } = await import("./event-planner.server");
  try {
    const [events, attendees] = await Promise.all([readPlannerEvents(), readAttendees()]);
    return { events, attendees, error: "" };
  } catch (e) {
    console.error("[event-planner] read failed", e);
    return { events: [] as PlannerEvent[], attendees: [] as PlannerAttendee[], error: (e as Error).message };
  }
});

export const addPlannerEventsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { events: Partial<PlannerEvent>[]; by: string }) => {
    if (!Array.isArray(d?.events) || d.events.length === 0) throw new Error("No events to add");
    if (d.events.length > 1000) throw new Error("Too many rows (max 1000)");
    return d;
  })
  .handler(async ({ data }) => {
    const { withDeadline } = await import("./request-deadline.server");
    const { addPlannerEvents } = await import("./event-planner.server");
    return withDeadline("addPlannerEvents", 55_000, async (step) => {
      step("saving events");
      return addPlannerEvents(data.events, data.by || "");
    });
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

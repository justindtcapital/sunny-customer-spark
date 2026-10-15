// Server functions for the Knowledge Base UI: activity timeline, workstream
// review queue, suggested contacts, and manual harvest trigger.

import { createServerFn } from "@tanstack/react-start";

export const fetchKnowledgeDataFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listKnowledgeRecords, listHarvestedActivities, listWorkstreamLinks, listSuggestedContacts } =
    await import("./knowledge.server");
  const [records, activities, links, suggested] = await Promise.all([
    listKnowledgeRecords().catch(() => []),
    listHarvestedActivities().catch(() => []),
    listWorkstreamLinks().catch(() => []),
    listSuggestedContacts().catch(() => []),
  ]);
  // Email-harvested activity only counts once confirmed in Activity Review.
  const { reviewMap, isRegisteredActivity } = await import("./notes-inbox.server");
  const reviews = await reviewMap();
  const typeOf = new Map(records.map((r) => [r.recordId, r.sourceType]));
  const registered = activities.filter((a) => isRegisteredActivity(typeOf.get(a.recordId) || "", reviews.get(a.recordId)));
  return { records, activities: registered, links, suggested };
});

export const reviewWorkstreamLinkFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { linkId: string; action: "confirm" | "ignore"; workstreamGid?: string; workstreamName?: string }) =>
      input,
  )
  .handler(async ({ data }) => {
    const { reviewWorkstreamLink } = await import("./knowledge.server");
    const status = data.action === "confirm" ? "confirmed" : "ignored";
    const ok = await reviewWorkstreamLink(data.linkId, status, data.workstreamGid || "", data.workstreamName || "");
    return { ok };
  });

export const reviewSuggestedContactFn = createServerFn({ method: "POST" })
  .inputValidator((input: { suggestionId: string; action: "approve-network" | "approve-prospecting" | "ignore" }) => input)
  .handler(async ({ data }) => {
    const { reviewSuggestedContact } = await import("./knowledge.server");
    const status =
      data.action === "approve-network"
        ? "approved-network"
        : data.action === "approve-prospecting"
          ? "approved-prospecting"
          : "ignored";
    const ok = await reviewSuggestedContact(data.suggestionId, status);
    return { ok };
  });

export const runKnowledgeHarvestFn = createServerFn({ method: "POST" }).handler(async () => {
  const { runKnowledgeHarvest } = await import("./knowledge-harvest.server");
  return runKnowledgeHarvest({ maxThreadsPerTrack: 15 });
});

export const fetchGranolaImportsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listGranolaImports, isGranolaConfigured } = await import("./granola.server");
  if (!isGranolaConfigured()) return { connected: false, imports: [] };
  return { connected: true, imports: await listGranolaImports().catch(() => []) };
});

export const verifyGranolaImportsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { noteIds?: string[]; retry?: boolean }) => input)
  .handler(async ({ data }) => {
    const { verifyGranolaImports } = await import("./granola.server");
    return { imports: await verifyGranolaImports({ noteIds: data.noteIds, retry: !!data.retry }) };
  });

/** Manual-only Granola pull (the scheduled harvest never touches Granola). */
export const syncGranolaFn = createServerFn({ method: "POST" })
  .inputValidator((input: { importedBy?: string }) => input || {})
  .handler(async ({ data }) => {
    const { runKnowledgeHarvest } = await import("./knowledge-harvest.server");
    return runKnowledgeHarvest({ includeGmail: false, includeGranola: true, maxGranolaNotes: 30, importedBy: data?.importedBy });
  });

export const fetchNotesInboxFn = createServerFn({ method: "POST" })
  .inputValidator((input: { history?: boolean; owner?: string; kind?: "notes" | "activity" }) => input)
  .handler(async ({ data }) => {
    const { listNotesInbox } = await import("./notes-inbox.server");
    const { isGranolaConfigured } = await import("./granola.server");
    return { granolaConnected: isGranolaConfigured(), items: await listNotesInbox(!!data.history, data.owner, data.kind || "notes") };
  });

export const uploadNoteFn = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string; text: string; base64: string; mimeType: string; importedBy?: string }) => {
    if (!input.name || input.base64.length > 8_000_000) throw new Error("File missing or too large");
    return input;
  })
  .handler(async ({ data }) => {
    const { uploadNote } = await import("./knowledge-harvest.server");
    return uploadNote(data);
  });

export const reviewNoteFn = createServerFn({ method: "POST" })
  .inputValidator((input: import("./notes-inbox.server").ReviewNoteInput) => input)
  .handler(async ({ data }) => {
    const { reviewNote } = await import("./notes-inbox.server");
    return reviewNote(data);
  });

export const reopenNoteFn = createServerFn({ method: "POST" })
  .inputValidator((input: { recordId: string }) => input)
  .handler(async ({ data }) => {
    const { reopenNote } = await import("./notes-inbox.server");
    await reopenNote(data.recordId);
    return { ok: true };
  });

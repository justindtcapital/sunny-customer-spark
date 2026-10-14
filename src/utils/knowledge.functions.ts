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
  return { records, activities, links, suggested };
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

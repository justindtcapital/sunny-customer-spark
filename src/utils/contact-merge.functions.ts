import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireTeamAuth } from "./team-auth";
import { MAX_MERGE } from "@/lib/contact-merge";

const urids = z.array(z.string().trim().min(1).max(100)).min(2).max(MAX_MERGE)
  .refine((u) => new Set(u.map((x) => x.toLowerCase())).size === u.length, "Each person can only be selected once.");

/** Fresh, read-only view of the selected people for the side-by-side merge review. */
export const fetchMergePreview = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((input) => z.object({ urids }).parse(input))
  .handler(async ({ data }) => {
    const { previewMerge } = await import("./contact-merge.server");
    return previewMerge(data.urids);
  });

export const mergeContacts = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((input) => z.object({
    operationId: z.string().uuid(),
    keeperUrid: z.string().min(1),
    urids,
    choices: z.record(z.string(), z.union([z.number().int().min(0).max(MAX_MERGE - 1), z.literal("combine")])),
    status: z.enum(["Council", "Hot", "Warm", "Cold", "Prospecting"]),
    seen: z.record(z.string(), z.string()),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { runJournalOperation } = await import("./bulk-journal.server");
    const { executeMerge } = await import("./contact-merge.server");
    const { operationId, ...input } = data;
    const result = await runJournalOperation({ id: operationId, kind: "contact-merge", page: "/crm", input, actor: context, run: async (journal) => {
      const value = await executeMerge(input, context, journal);
      return { value, outcomes: value.outcomes };
    } });
    return { outcomes: result.outcomes, operationId: result.operationId };
  });

export const undoContactMerge = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((input) => z.object({ operationId: z.string().uuid(), mergeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { runJournalOperation } = await import("./bulk-journal.server");
    const { executeUndo } = await import("./contact-merge.server");
    const input = { mergeId: data.mergeId };
    const result = await runJournalOperation({ id: data.operationId, kind: "contact-merge-undo", page: "/crm", input, actor: context, run: async (journal) => {
      const outcomes = await executeUndo(data.mergeId, context, journal);
      return { value: outcomes, outcomes };
    } });
    return { outcomes: result.outcomes, operationId: result.operationId };
  });

export const fetchDuplicateSuggestions = createServerFn({ method: "GET" })
  .middleware([requireTeamAuth])
  .handler(async () => {
    const { suggestDuplicates, listMerges } = await import("./contact-merge.server");
    const [suggestions, merges] = await Promise.all([suggestDuplicates(), listMerges()]);
    return { ...suggestions, merges };
  });

export const dismissDuplicateGroup = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((input) => z.object({ urids, names: z.array(z.string().max(200)).max(MAX_MERGE * 2) }).parse(input))
  .handler(async ({ data, context }) => {
    const { dismissDuplicate } = await import("./contact-merge.server");
    await dismissDuplicate(data.urids, data.names, context);
    return { ok: true };
  });

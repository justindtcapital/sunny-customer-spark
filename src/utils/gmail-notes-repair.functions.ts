import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RepairGmailNotesResult } from "./gmail-notes-repair.server";

const schema = z
  .object({ limit: z.number().int().positive().max(1000).optional(), dryRun: z.boolean().optional() })
  .optional();

/** One-time (re-runnable) backfill: rewrite Gmail Notes rows that lack real body text. */
export const repairGmailNotesFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data) ?? {})
  .handler(async ({ data }): Promise<RepairGmailNotesResult> => {
    const { repairGmailNotes } = await import("./gmail-notes-repair.server");
    return repairGmailNotes({ limit: data?.limit, dryRun: data?.dryRun });
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireTeamAuth } from "./team-auth";
import { nextRelationshipLevel } from "@/lib/relationship-rating";

export const bulkChangeRelationshipLevels = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .inputValidator((input) => z.object({
    contacts: z.array(z.object({ urid: z.string().optional(), name: z.string().optional(), email: z.string(), temperature: z.enum(["Council", "Hot", "Warm", "Cold"]) })).min(1).max(500),
    change: z.enum(["promote", "demote", "prospecting"]),
    operationId: z.string().uuid().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { changeRelationshipLevels } = await import("./relationship-levels.server");
    const { runJournalOperation } = await import("./bulk-journal.server");
    const input = { change: data.change, contacts: data.contacts.map(c => ({ ...c, destination: nextRelationshipLevel(c.temperature, data.change) })) };
    const result = await runJournalOperation({ id: data.operationId, kind: "relationship-change", page: "/crm", input, actor: context, run: async journal => {
      journal.step("checking identities and saving individual transitions");
      const value = await changeRelationshipLevels(input, journal.prior, journal.checkpoint,{maxItems:2,maxMs:25_000});
      return { value, outcomes: value.outcomes };
    } });
    return { ...result.value, operationId: result.operationId };
  });
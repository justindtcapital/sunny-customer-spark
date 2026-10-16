import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const bulkChangeRelationshipLevels = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({
    contacts: z.array(z.object({ urid: z.string().optional(), email: z.string(), temperature: z.enum(["Council", "Hot", "Warm", "Cold"]) })).min(1).max(500),
    change: z.enum(["promote", "demote", "prospecting"]),
  }).parse(input))
  .handler(async ({ data }) => {
    const { changeRelationshipLevels } = await import("./relationship-levels.server");
    return changeRelationshipLevels(data);
  });
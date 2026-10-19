import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireTeamAuth } from "./team-auth";

export const granolaConnectionStatusFn = createServerFn({ method: "GET" }).middleware([requireTeamAuth]).handler(async ({ context }) => {
  const { granolaConnectionStatus } = await import("./granola-connections.server");
  return granolaConnectionStatus(context.userId);
});

export const connectGranolaFn = createServerFn({ method: "POST" }).middleware([requireTeamAuth])
  .inputValidator((input: unknown) => z.object({ apiKey: z.string().trim().min(1).max(4096) }).parse(input))
  .handler(async ({ data, context }) => {
    const { saveGranolaKey } = await import("./granola-connections.server");
    return saveGranolaKey(context.userId, data.apiKey);
  });

export const disconnectGranolaFn = createServerFn({ method: "POST" }).middleware([requireTeamAuth]).handler(async ({ context }) => {
  const { disconnectGranola } = await import("./granola-connections.server");
  return disconnectGranola(context.userId);
});
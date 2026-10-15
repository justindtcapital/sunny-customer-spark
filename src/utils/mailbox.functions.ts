import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const mailboxStatusFn = createServerFn({ method: "GET" }).handler(async () => {
  const { mailboxStatus } = await import("./mailbox-oauth.server");
  return mailboxStatus();
});

export const mailboxAuthUrlFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ origin: z.string().url().max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { buildAuthUrl } = await import("./mailbox-oauth.server");
    return { url: await buildAuthUrl(new URL(data.origin).origin) };
  });

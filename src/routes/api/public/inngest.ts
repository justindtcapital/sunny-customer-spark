import { createFileRoute } from "@tanstack/react-router";

/**
 * Inngest serve endpoint — Inngest Cloud calls this for each job step.
 * Registered at the custom domain (see src/inngest/serve.ts); the daily
 * signals-scan cron re-syncs it, so no manual sync step is needed.
 *
 * All Inngest imports stay inside handlers so the client route tree never
 * pulls Node-only packages into the browser bundle.
 */
async function handle(request: Request): Promise<Response> {
  const { inngestHandler } = await import("@/inngest/serve");
  return inngestHandler()(request);
}

export const Route = createFileRoute("/api/public/inngest")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
      PUT: ({ request }) => handle(request),
    },
  },
});

// Daily Signals scan trigger — scheduled before the Morning Brief so its
// "Signals to know today" has fresh items. A full scan takes minutes, so the
// deployed app hands it to Inngest (durable, no Worker time limit) and answers
// the scheduler at once; local dev runs it inline.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/signals-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { inngest } = await import("@/inngest/client");

        if (process.env["NODE_ENV"] !== "development") {
          try {
            // Keep Inngest Cloud's copy of our job list current (idempotent),
            // in-process so no manual sync step is needed after publishing.
            const { serve } = await import("inngest/edge");
            const { functions } = await import("@/inngest/functions");
            const syncUrl = new URL("/api/public/inngest", request.url);
            await serve({ client: inngest, functions })(new Request(syncUrl, { method: "PUT" }));
          } catch (e) {
            console.error("[cron/signals-scan] inngest sync failed (continuing):", e);
          }
          const day = new Date().toISOString().slice(0, 10);
          // Event id makes repeat scheduler calls on one day start one scan.
          await inngest.send({ id: `signals-scan-${day}`, name: "signals/scan.requested", data: {} });
          return Response.json({ ok: true, queued: true, day }, { status: 202 });
        }

        const { runScheduledSignalScan } = await import("@/utils/gemini.functions");
        const r = await runScheduledSignalScan();
        return Response.json({ ok: r.found, skipped: r.skipped ?? false, newCount: r.newCount ?? 0, error: r.error ?? null });
      },
    },
  },
});

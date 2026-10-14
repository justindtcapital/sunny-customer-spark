// Scheduled knowledge harvest — reads the four tracking aliases from the
// connected Gmail inbox and saves extracted knowledge permanently.
// Call with Authorization: Bearer <CRON_SECRET> (or x-cron-secret header).

import { createFileRoute } from "@tanstack/react-router";
import { authorizeCronRequest } from "@/utils/cron-auth.server";

export const Route = createFileRoute("/api/public/cron/knowledge-harvest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorizeCronRequest(request)) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        try {
          const { runKnowledgeHarvest } = await import("@/utils/knowledge-harvest.server");
          const result = await runKnowledgeHarvest({ maxThreadsPerTrack: 15 });
          return Response.json(result);
        } catch (e) {
          console.error("[cron/knowledge-harvest] failed:", e);
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "harvest failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});

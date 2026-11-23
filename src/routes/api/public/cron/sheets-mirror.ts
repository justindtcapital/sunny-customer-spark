// Scheduled sync of the Sheets read mirror (every 15 minutes). Answers the
// scheduler at once and finishes the copy in the background, since the
// scheduler's call times out after a few seconds.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/sheets-mirror")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const body = (await request.json().catch(() => ({}))) as { force?: boolean; wait?: boolean };
        const { syncSheetMirror } = await import("@/utils/sheet-mirror-sync.server");
        const job = syncSheetMirror({ force: body.force === true });
        if (body.wait) return Response.json(await job);
        const { runInBackground } = await import("@/utils/background.server");
        await runInBackground(job.then((r) => { if (!r.ok) console.error("[cron/sheets-mirror]", JSON.stringify(r)); }));
        return Response.json({ ok: true, queued: true }, { status: 202 });
      },
    },
  },
});

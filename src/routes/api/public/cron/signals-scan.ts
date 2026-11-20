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
          // Keep Inngest Cloud pointed at this app's custom domain (idempotent)
          // before queueing, so the scan runs on this deployment.
          let sync: { ok: boolean; status: number; detail: string };
          try {
            const { syncInngest } = await import("@/inngest/serve");
            sync = await syncInngest();
          } catch (e) {
            sync = { ok: false, status: 0, detail: e instanceof Error ? e.message : String(e) };
          }
          if (!sync.ok) console.error("[cron/signals-scan] inngest sync failed (continuing):", sync);
          const day = new Date().toISOString().slice(0, 10);
          // Event id makes repeat scheduler calls on one day start one scan.
          const sent = await inngest.send({ id: `signals-scan-${day}`, name: "signals/scan.requested", data: {} });
          return Response.json({ ok: true, queued: true, day, eventIds: sent.ids, sync }, { status: 202 });
        }

        // Local dev: run one part inline ({"part":"news"|"scan"|"enterprise"|"headlines"}).
        const body = (await request.json().catch(() => ({}))) as { part?: string; windowDays?: number };
        const g = await import("@/utils/gemini.functions");
        if (body.part === "headlines") {
          const { writeMissingSignalHeadlines } = await import("@/utils/signal-headlines.server");
          return Response.json(await writeMissingSignalHeadlines({ max: 400 }));
        }
        if (body.part === "news") return Response.json(await g.archiveNewsInbox({ windowDays: body.windowDays, max: 200 }));
        const r = body.part === "enterprise" ? await g.runEnterpriseWatchScan() : await g.runScheduledSignalScan();
        return Response.json({ ok: r.found, skipped: r.skipped ?? false, newCount: r.newCount ?? 0, error: r.error ?? null });
      },
    },
  },
});

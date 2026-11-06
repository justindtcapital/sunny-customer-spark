// Scheduled Morning Brief build. Responds immediately and finishes the build
// in the background (Worker waitUntil) because the scheduler disconnects fast.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

async function runInBackground(task: Promise<unknown>): Promise<boolean> {
  try {
    const mod = (await import(/* @vite-ignore */ "cloudflare:workers" as string)) as { waitUntil?: (p: Promise<unknown>) => void };
    if (mod.waitUntil) { mod.waitUntil(task); return true; }
  } catch { /* not running on workerd (dev) */ }
  return false;
}

export const Route = createFileRoute("/api/public/cron/morning-brief")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { buildMorningBrief } = await import("@/utils/morning-brief.server");
        const task = buildMorningBrief().catch((e) => console.error("[cron/morning-brief]", e));
        if (await runInBackground(task)) return Response.json({ ok: true, started: true }, { status: 202 });
        return Response.json(await task);
      },
    },
  },
});

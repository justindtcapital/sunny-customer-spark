import { cron } from "inngest";
import { inngest } from "./client";

/**
 * Daily Signal Radar v2 intel sweep at 5:30 AM America/New_York — runs the
 * first-party collectors (ATS boards, GitHub, CT logs) BEFORE the 6:00 news
 * scan so the day's momentum signals land first. Also triggered by event
 * `intel/sweep.requested` (from POST /api/cron/intel-scan).
 * Disable with INTEL_CRON_ENABLED=false; batch size via INTEL_SWEEP_LIMIT.
 */
export const dailyIntelSweep = inngest.createFunction(
  {
    id: "daily-intel-sweep",
    name: "Daily Intel Sweep",
    triggers: [
      cron("TZ=America/New_York 30 5 * * *"),
      { event: "intel/sweep.requested" },
    ],
    retries: 2,
  },
  async ({ event, step }) => {
    // Off unless explicitly enabled — this sweep never ran live before, so
    // turning Inngest on for the Signals scan must not start it silently.
    if ((process.env["INTEL_CRON_ENABLED"] || "false").toLowerCase() !== "true") {
      return { skipped: true, reason: "INTEL_CRON_ENABLED is not true" };
    }
    const data =
      event && typeof event === "object" && "data" in event
        ? (event as { data?: { limit?: number; tier?: string } }).data
        : undefined;

    const result = await step.run("intel-sweep", async () => {
      const { runIntelSweep } = await import("@/utils/intel.server");
      const res = await runIntelSweep({ limit: data?.limit, tier: data?.tier });
      return {
        ok: res.ok,
        error: res.error || null,
        entitiesScanned: res.entitiesScanned,
        observations: res.observations,
        signalsEmitted: res.signalsEmitted,
      };
    });

    return result;
  },
);

/**
 * Daily Signals run — news@ inbox filing, the main scan, then the enterprise
 * watch — started each morning by the scheduled
 * /api/public/cron/signals-scan route (event `signals/scan.requested`) before
 * the Morning Brief. Runs here because a full scan takes minutes — longer than
 * a Worker may keep working after answering the scheduler.
 */
export const dailySignalScan = inngest.createFunction(
  {
    id: "daily-signal-scan",
    name: "Daily Signal Scan",
    triggers: [{ event: "signals/scan.requested" }],
    retries: 2,
  },
  async ({ step }) => {
    // Each step is its own request, so one slow part can't starve the others.
    const news = await step.run("archive-news-inbox", async () => {
      const { archiveNewsInbox } = await import("@/utils/gemini.functions");
      return archiveNewsInbox();
    });
    const scan = await step.run("scan-signals", async () => {
      const { runScheduledSignalScan } = await import("@/utils/gemini.functions");
      const r = await runScheduledSignalScan();
      // Throw so Inngest retries the step later (e.g. a Sheets rate limit).
      if (!r.found && !r.skipped) throw new Error(r.error || "scan failed");
      return { ok: r.found, skipped: r.skipped ?? false, newCount: r.newCount ?? 0, error: r.error ?? null };
    });
    const enterprise = await step.run("enterprise-watch", async () => {
      const { runEnterpriseWatchScan } = await import("@/utils/gemini.functions");
      const r = await runEnterpriseWatchScan();
      // Throw so Inngest retries the step later (e.g. a Sheets rate limit).
      if (!r.found && !r.skipped) throw new Error(r.error || "scan failed");
      return { ok: r.found, skipped: r.skipped ?? false, newCount: r.newCount ?? 0, error: r.error ?? null };
    });
    return { news, scan, enterprise };
  },
);

export const functions = [dailyIntelSweep, dailySignalScan];

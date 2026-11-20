// One Inngest serve handler for the /api/public/inngest route and the daily
// in-process sync. Inngest Cloud must call the custom domain directly: the
// lovable.app address answers with a redirect Inngest won't follow, and an
// older copy of this app once held the registration, so every scan request
// went to a deployment with a dead Google login.
import { serve } from "inngest/edge";
import { inngest } from "./client";
import { functions } from "./functions";

export const INNGEST_SERVE_ORIGIN = "https://crm.dt-capital.net";
export const INNGEST_SERVE_PATH = "/api/public/inngest";

export function inngestHandler() {
  return serve({ client: inngest, functions, serveOrigin: INNGEST_SERVE_ORIGIN, servePath: INNGEST_SERVE_PATH });
}

/**
 * Re-register our functions with Inngest Cloud at the custom-domain URL
 * (idempotent). Returns the SDK's status so callers can report a failed sync.
 */
export async function syncInngest(): Promise<{ ok: boolean; status: number; detail: string }> {
  const url = `${INNGEST_SERVE_ORIGIN}${INNGEST_SERVE_PATH}`;
  const res = await inngestHandler()(
    new Request(url, { method: "PUT", headers: { host: new URL(url).host, "content-type": "application/json" } }),
  );
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  return { ok: res.ok, status: res.status, detail };
}

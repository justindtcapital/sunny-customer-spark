/**
 * Finish non-critical work (audit log rows) after the response is sent.
 * On workerd this uses waitUntil so the Worker keeps the task alive; in dev
 * (Node) the promise simply keeps running.
 */
export async function runInBackground(task: Promise<unknown>): Promise<void> {
  const safe = task.catch((e) => console.error("[background]", e));
  try {
    // Built at runtime so non-Worker builds never try to resolve the module.
    const specifier = ["cloudflare", "workers"].join(":");
    const mod = (await import(/* @vite-ignore */ specifier)) as { waitUntil?: (p: Promise<unknown>) => void };
    if (mod.waitUntil) { mod.waitUntil(safe); return; }
  } catch { /* not running on workerd */ }
  void safe;
}

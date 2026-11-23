import { createServerFn } from "@tanstack/react-start";
import { requireTeamAuth } from "./team-auth";

/** "Refresh from Google Sheets": re-copy every tab now instead of waiting for the next scheduled check. */
export const refreshSheetMirrorFn = createServerFn({ method: "POST" })
  .middleware([requireTeamAuth])
  .handler(async () => {
    const { syncSheetMirror } = await import("./sheet-mirror-sync.server");
    const r = await syncSheetMirror({ force: true });
    const tabs = r.sheets.reduce((n, s) => n + s.tabs, 0);
    const updated = r.sheets.reduce((n, s) => n + s.replaced, 0);
    return { ok: r.ok, tabs, updated, errors: r.sheets.flatMap((s) => s.errors).slice(0, 3) };
  });

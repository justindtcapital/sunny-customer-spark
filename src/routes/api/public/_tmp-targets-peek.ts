import { createFileRoute } from "@tanstack/react-router";
import { fetchSheetTab } from "@/utils/sheets.server";

export const Route = createFileRoute("/api/public/_tmp-targets-peek")({
  server: {
    handlers: {
      GET: async () => {
        const rows = await fetchSheetTab("Targets");
        return new Response(JSON.stringify(rows.slice(0, 12)), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});

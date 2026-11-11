import { createFileRoute, redirect } from "@tanstack/react-router";

// Old address: the PortCo dashboard moved under Dashboards. Keep bookmarks and deep links working.
export const Route = createFileRoute("/dashboard")({
  validateSearch: (search: Record<string, unknown>): { owner?: string; section?: string } => ({
    owner: typeof search.owner === "string" ? search.owner : undefined,
    section: typeof search.section === "string" ? search.section : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/dashboards/portco", search, statusCode: 301 });
  },
});

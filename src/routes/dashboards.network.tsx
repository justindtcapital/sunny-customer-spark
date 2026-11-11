import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboards/network")({
  head: () => ({
    meta: [
      { title: "Network Dashboard — VenturePulse" },
      { name: "description", content: "Network pyramid, outreach, conversion and campaigns by teammate." },
      { property: "og:title", content: "Network Dashboard — VenturePulse" },
      { property: "og:description", content: "Network pyramid, outreach, conversion and campaigns by teammate." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="p-6 max-w-[1600px] mx-auto space-y-4">
      <Link to="/dashboards" className="text-xs text-muted-foreground hover:text-foreground">← Dashboards</Link>
      <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">Network Dashboard</h1>
      <p className="text-sm text-muted-foreground">
        Coming next: the Network pyramid with adds and removes, outreach and conversion by teammate, and campaigns by status and owner.
      </p>
      <Link to="/crm" className="text-sm text-primary underline">Open the Network page meanwhile</Link>
    </div>
  ),
});

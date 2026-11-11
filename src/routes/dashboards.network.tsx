import { createFileRoute, Link } from "@tanstack/react-router";
import { NetworkDashboard } from "@/components/dashboards/NetworkDashboard";

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
      <NetworkDashboard />
    </div>
  ),
});

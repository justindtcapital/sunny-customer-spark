import { createFileRoute, Link } from "@tanstack/react-router";
import { EventsDashboard } from "@/components/dashboards/EventsDashboard";

export const Route = createFileRoute("/dashboards/events")({
  head: () => ({
    meta: [
      { title: "Events Dashboard — VenturePulse" },
      { name: "description", content: "Event intensity by month and type, with attendees, PortCos, domains and cities." },
      { property: "og:title", content: "Events Dashboard — VenturePulse" },
      { property: "og:description", content: "Event intensity by month and type, with attendees, PortCos, domains and cities." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="p-6 max-w-[1600px] mx-auto space-y-5">
      <div>
        <Link to="/dashboards" className="text-xs text-muted-foreground hover:text-foreground">← Dashboards</Link>
        <h1 className="font-display text-2xl font-semibold text-foreground tracking-tight">Events Dashboard</h1>
      </div>
      <EventsDashboard />
    </div>
  ),
});

import { createFileRoute, Link } from "@tanstack/react-router";
import { DellLeverageDashboard } from "@/components/dashboards/DellLeverageDashboard";

export const Route = createFileRoute("/dashboards/dell")({
  head: () => ({
    meta: [
      { title: "Dell Leverage Dashboard — VenturePulse" },
      { name: "description", content: "Sell-In and Sell-With progress with Dell by business unit, stage, stakeholder and product, for QBRs." },
      { property: "og:title", content: "Dell Leverage Dashboard — VenturePulse" },
      { property: "og:description", content: "Sell-In and Sell-With progress with Dell by business unit, stage, stakeholder and product, for QBRs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="p-6 space-y-1">
      <Link to="/dashboards" className="text-xs text-muted-foreground hover:text-foreground">← Dashboards</Link>
      <DellLeverageDashboard />
    </div>
  ),
});

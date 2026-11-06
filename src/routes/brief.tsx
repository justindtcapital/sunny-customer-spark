import { createFileRoute } from "@tanstack/react-router";
import { MorningBriefView } from "@/components/home/MorningBrief";

export const Route = createFileRoute("/brief")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Morning Brief — Venture Pulse" },
    { name: "description", content: "Today's meetings enriched with PortCo status, people, actions, campaigns and events." },
    { property: "og:title", content: "Morning Brief — Venture Pulse" },
    { property: "og:description", content: "Today's meetings enriched with PortCo status, people, actions, campaigns and events." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <div className="mx-auto max-w-[1100px] space-y-3 p-4">
    <h1 className="font-display text-2xl font-semibold text-foreground">Morning Brief</h1>
    <MorningBriefView />
  </div>,
});

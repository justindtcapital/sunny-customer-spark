import { createFileRoute } from "@tanstack/react-router";
import { MorningBriefView } from "@/components/home/MorningBrief";

export const Route = createFileRoute("/brief")({
  ssr: false,
  // ?date=YYYY-MM-DD&add=<email or name> comes from the emailed brief's "Add to Venture Pulse" links.
  validateSearch: (search: Record<string, unknown>): { date?: string; add?: string } => ({
    date: typeof search.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.date) ? search.date : undefined,
    add: typeof search.add === "string" && search.add.trim() ? search.add.trim().slice(0, 200) : undefined,
  }),
  head: () => ({ meta: [
    { title: "Morning Brief — Venture Pulse" },
    { name: "description", content: "Today's meetings enriched with PortCo status, people, actions, campaigns and events." },
    { property: "og:title", content: "Morning Brief — Venture Pulse" },
    { property: "og:description", content: "Today's meetings enriched with PortCo status, people, actions, campaigns and events." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: BriefPage,
});

function BriefPage() {
  const { date, add } = Route.useSearch();
  return <div className="mx-auto max-w-[1100px] space-y-3 p-4">
    <h1 className="font-display text-2xl font-semibold text-foreground">Morning Brief</h1>
    <MorningBriefView date={date} add={add} />
  </div>;
}

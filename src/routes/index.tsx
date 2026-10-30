import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { teamProfile } from "@/lib/user-ownership";
import { reportingDay } from "@/lib/home-momentum";
import { ActionsPanel, CampaignsPanel, EventsPanel, NetworkPanel, PanelSkeleton, VicPanel } from "@/components/home/HomePanels";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Home — Venture Pulse" },
    { name: "description", content: "Your network, actions, events, campaigns and V.I.C. agents at a glance." },
    { property: "og:title", content: "Home — Venture Pulse" },
    { property: "og:description", content: "Your network, actions, events, campaigns and V.I.C. agents at a glance." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: HomePage,
});

function Slot({ children }: { children: ReactNode }) { return <Suspense fallback={<PanelSkeleton />}>{children}</Suspense>; }

function HomePage() {
  const { email, ready } = useAuth();
  const [today, setToday] = useState("");
  useEffect(() => setToday(reportingDay(new Date())), []);
  const profile = teamProfile(email);
  const loaded = ready && !!email && !!today;
  return <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
    <header>
      <h1 className="font-display text-3xl font-semibold text-foreground">Hello, {profile?.firstName || "there"}</h1>
      {today && <p className="mt-1 text-sm text-muted-foreground">{new Date(`${today}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>}
    </header>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {loaded ? <>
        <Slot><NetworkPanel email={email!} today={today} /></Slot>
        <Slot><ActionsPanel email={email!} today={today} /></Slot>
        <Slot><EventsPanel today={today} /></Slot>
        <Slot><CampaignsPanel /></Slot>
        <VicPanel />
      </> : Array.from({ length: 5 }, (_, i) => <PanelSkeleton key={i} />)}
    </div>
  </div>;
}

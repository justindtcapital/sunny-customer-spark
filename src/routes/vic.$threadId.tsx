import { createFileRoute } from "@tanstack/react-router";
import { VicChat } from "@/components/vic/VicChat";

export const Route = createFileRoute("/vic/$threadId")({
  head: () => ({ meta: [
    { title: "Vic conversation — Venture Pulse" },
    { name: "description", content: "Ask portfolio questions, compare companies and review introduction matches in your private Vic conversation." },
    { property: "og:title", content: "Vic conversation — Venture Pulse" },
    { property: "og:description", content: "Evidence-backed answers and shared Vic skills in a private conversation." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: VicThread,
});

function VicThread() {
  const { threadId } = Route.useParams();
  return <VicChat threadId={threadId} page="/vic" />;
}

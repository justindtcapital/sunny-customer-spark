import { createFileRoute } from "@tanstack/react-router";
import { VicChat } from "@/components/vic/VicChat";

export const Route = createFileRoute("/vic/$threadId")({
  head: () => ({ meta: [
    { title: "V.I.C. conversation — Venture Pulse" },
    { name: "description", content: "Ask portfolio questions, compare companies and review introduction matches in your private V.I.C. conversation." },
    { property: "og:title", content: "V.I.C. conversation — Venture Pulse" },
    { property: "og:description", content: "Evidence-backed answers and shared V.I.C. skills in a private conversation." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: VicThread,
});

function VicThread() {
  const { threadId } = Route.useParams();
  return <VicChat threadId={threadId} page="/vic" />;
}

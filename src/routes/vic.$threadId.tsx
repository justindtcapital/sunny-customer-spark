import { createFileRoute } from "@tanstack/react-router";
import { VicChat } from "@/components/vic/VicChat";

export const Route = createFileRoute("/vic/$threadId")({ component: VicThread });

function VicThread() {
  const { threadId } = Route.useParams();
  return <VicChat threadId={threadId} page="/vic" />;
}

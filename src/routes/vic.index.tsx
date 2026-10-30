import { useEffect, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createVicThread } from "@/lib/vic-client";

export const Route = createFileRoute("/vic/")({
  head: () => ({ meta: [
    { title: "Vic workspace — Venture Pulse" },
    { name: "description", content: "Open your private Vic chats and shared portfolio, overlap and introduction skills." },
    { property: "og:title", content: "Vic workspace — Venture Pulse" },
    { property: "og:description", content: "Portfolio intelligence and reviewed actions with Vic." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: VicHome,
});

// Opens the most recent chat, or starts one, then navigates to its page.
function VicHome() {
  const navigate = useNavigate();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const { data } = await supabase.from("vic_threads").select("id").order("updated_at", { ascending: false }).limit(1);
        const id = data?.[0]?.id || (await createVicThread());
        void navigate({ to: "/vic/$threadId", params: { threadId: id }, replace: true });
      } catch (e) { toast.error((e as Error).message); }
    })();
  }, [navigate]);
  return <div className="p-6 text-sm text-muted-foreground">Opening Vic…</div>;
}

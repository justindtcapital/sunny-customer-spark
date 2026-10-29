import { useEffect, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createVicThread } from "@/lib/vic-client";
import { VicMark } from "@/components/vic/VicMark";

export const Route = createFileRoute("/vic")({
  head: () => ({
    meta: [
      { title: "Vic — Venture Pulse" },
      { name: "description", content: "Talk to Vic, the Venture Pulse assistant, across Network, PortCos, Partners and Events." },
      { property: "og:title", content: "Vic — Venture Pulse" },
      { property: "og:description", content: "Ask questions and review actions across Venture Pulse." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VicLayout,
});

interface Thread { id: string; title: string; updated_at: string }

function VicLayout() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const activeId = path.split("/")[2] || "";

  const load = () =>
    supabase.from("vic_threads").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(100)
      .then(({ data }) => setThreads(data || []));
  useEffect(() => { void load(); }, [activeId]);

  const create = async () => {
    try {
      const id = await createVicThread();
      await load();
      void navigate({ to: "/vic/$threadId", params: { threadId: id } });
    } catch (e) { toast.error((e as Error).message); }
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("vic_threads").delete().eq("id", id);
    if (error) return toast.error("Couldn't delete that chat.");
    await load();
    if (id === activeId) void navigate({ to: "/vic" });
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] min-h-0">
      <aside className="w-60 shrink-0 border-r border-border flex flex-col">
        <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
          <VicMark className="h-5 w-5 text-primary" />
          <span className="font-semibold">Vic</span>
          <Button size="sm" variant="ghost" className="ml-auto h-7 px-2" onClick={() => void create()}><Plus className="h-3.5 w-3.5 mr-1" />New</Button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {threads.map((t) => (
            <div key={t.id} className={`group flex items-center rounded-md text-sm ${t.id === activeId ? "bg-muted font-medium" : "hover:bg-muted/60"}`}>
              <Link to="/vic/$threadId" params={{ threadId: t.id }} className="flex-1 truncate px-2 py-1.5">{t.title}</Link>
              <button type="button" aria-label="Delete chat" onClick={() => void remove(t.id)} className="px-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {threads.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No chats yet.</p>}
        </nav>
      </aside>
      <section className="flex-1 min-w-0"><Outlet /></section>
    </div>
  );
}

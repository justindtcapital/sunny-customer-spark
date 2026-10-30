import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createVicThread } from "@/lib/vic-client";
import { VicChat } from "./VicChat";
import { VicMark } from "./VicMark";
import { VicWorkspaceProvider } from "./VicWorkspaceControls";

const PAGE_LABELS: Record<string, string> = {
  "/": "your workspace",
  "/portfolio": "PortCos",
  "/events": "Events",
  "/partners": "Partners",
  "/crm": "Network",
  "/targeting": "Prospecting",
  "/campaigns": "Campaigns",
  "/my-actions": "My Actions",
  "/dashboard": "Notes & Activity",
  "/activity": "Admin",
};

/** Floating Vic button on every page; opens the latest chat with the current page as context. */
export function VicButton() {
  const location = useRouterState({ select: (s) => s.location });
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  if (location.pathname.startsWith("/vic")) return null;
  const page = `${location.pathname}${location.searchStr || ""}`;
  const pageLabel = PAGE_LABELS[location.pathname] || "this page";

  const openPanel = async () => {
    setOpen(true);
    if (threadId) return;
    try {
      const { data } = await supabase.from("vic_threads").select("id").order("updated_at", { ascending: false }).limit(1);
      setThreadId(data?.[0]?.id || (await createVicThread()));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const fresh = async () => {
    try { setThreadId(await createVicThread()); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <Button onClick={() => void openPanel()} className="fixed bottom-5 right-5 z-40 h-11 rounded-full px-4 shadow-lg gap-2" aria-label="Open V.I.C.">
        <VicMark className="h-5 w-5" /> V.I.C.
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-[520px] p-0 flex flex-col">
          <SheetHeader className="flex-row items-center gap-2 border-b border-border px-4 py-3 space-y-0">
            <VicMark className="h-5 w-5 text-primary" />
            <SheetTitle className="text-base">V.I.C.</SheetTitle>
            <div className="ml-auto mr-6 flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => void fresh()}>New chat</Button>
              {threadId && (
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/vic/$threadId" params={{ threadId }} onClick={() => setOpen(false)}>Full page</Link>
                </Button>
              )}
            </div>
          </SheetHeader>
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Ask V.I.C. about {pageLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">What can I help you with in {pageLabel}?</p>
          </div>
          <VicWorkspaceProvider><div className="flex flex-1 min-h-0">
            <div className="min-w-0 flex-1">{threadId ? <VicChat threadId={threadId} page={page} pageLabel={pageLabel} /> : <div className="p-6 text-sm text-muted-foreground">Starting…</div>}</div>
          </div></VicWorkspaceProvider>
        </SheetContent>
      </Sheet>
    </>
  );
}

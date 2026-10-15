import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { mailboxAuthUrlFn, mailboxStatusFn } from "@/utils/mailbox.functions";

/** Lets the tracking-mailbox owner authorize Gmail read access in one click. */
export function ConnectMailboxButton() {
  const getStatus = useServerFn(mailboxStatusFn);
  const getUrl = useServerFn(mailboxAuthUrlFn);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ["mailbox-status"], queryFn: () => getStatus(), staleTime: 60_000 });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const state = p.get("mailbox");
    if (!state) return;
    if (state === "connected") toast.success(`Mailbox connected: ${p.get("email") || ""}`);
    else toast.error(p.get("reason") || "Mailbox connection failed.");
    ["mailbox", "email", "reason"].forEach((k) => p.delete(k));
    const q = p.toString();
    window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : ""));
    qc.invalidateQueries({ queryKey: ["mailbox-status"] });
  }, [qc]);

  const connected = data?.connected;
  return (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0"
      disabled={busy}
      title={data?.mailbox ? `Tracking mailbox: ${data.mailbox}` : undefined}
      onClick={async () => {
        setBusy(true);
        try {
          const { url } = await getUrl({ data: { origin: window.location.origin } });
          window.location.href = url;
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not start Google sign-in.");
          setBusy(false);
        }
      }}
    >
      {connected ? (
        <CheckCircle2 className="h-4 w-4 mr-2 text-primary" />
      ) : (
        <Mail className="h-4 w-4 mr-2" />
      )}
      {connected ? "Mailbox connected" : "Connect Google Mailbox"}
    </Button>
  );
}

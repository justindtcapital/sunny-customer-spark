import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, ExternalLink, MessageCircle, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getMyWhatsAppLinkFn,
  saveMyWhatsAppLinkFn,
  unlinkMyWhatsAppFn,
  type WhatsAppLinkStatus,
} from "@/utils/vic-whatsapp.functions";

/** Compact sidebar button + dialog for linking a teammate's WhatsApp number to V.I.C. */
export function VicWhatsAppDialog() {
  const getLink = useServerFn(getMyWhatsAppLinkFn);
  const saveLink = useServerFn(saveMyWhatsAppLinkFn);
  const unlink = useServerFn(unlinkMyWhatsAppFn);

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<WhatsAppLinkStatus | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const res = await getLink();
      setStatus(res);
      setPhone(res.phoneE164 || "");
    } catch {
      /* signed-out or transient error */
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || busy) return;
    setBusy(true);
    try {
      const saved = await saveLink({ data: { phone: phone.trim() } });
      setStatus(saved);
      setPhone(saved.phoneE164 || "");
      toast.success("WhatsApp number linked to V.I.C.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save WhatsApp number.");
    } finally {
      setBusy(false);
    }
  };

  const onUnlink = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await unlink();
      setStatus((prev) => (prev ? { ...prev, phoneE164: null, threadId: null, lastMessageAt: null } : prev));
      setPhone("");
      toast.success("WhatsApp number unlinked.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't unlink WhatsApp number.");
    } finally {
      setBusy(false);
    }
  };

  const copyWebhook = async () => {
    if (!status?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(status.webhookUrl);
      setCopied(true);
      toast.success("Webhook URL copied.");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy to clipboard.");
    }
  };

  const linked = Boolean(status?.phoneE164);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="border-t border-border px-3 py-2.5">
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-full justify-between px-2 text-xs">
            <span className="flex items-center gap-1.5">
              <MessageCircle className="size-3.5 text-muted-foreground" />
              WhatsApp
            </span>
            <span className={linked ? "text-[11px] font-medium text-emerald-600 dark:text-emerald-400" : "text-[11px] text-muted-foreground"}>
              {linked ? "Linked" : "Connect"}
            </span>
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chat with V.I.C. on WhatsApp</DialogTitle>
          <DialogDescription>
            Link your WhatsApp mobile number so V.I.C. recognizes you and shares your conversation history here.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void onSave(e)} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="vic-whatsapp-phone">Your WhatsApp phone number</Label>
            <Input
              id="vic-whatsapp-phone"
              type="tel"
              placeholder="+1 555 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              Include your country code (for example +1 for US/Canada). Only linked teammates can message V.I.C.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={busy || !phone.trim()}>
              {linked ? "Update number" : "Link number"}
            </Button>
            {linked && (
              <Button type="button" size="sm" variant="outline" onClick={() => void onUnlink()} disabled={busy} className="gap-1">
                <Unlink className="size-3.5" />Unlink
              </Button>
            )}
            {status?.threadId && (
              <Button asChild size="sm" variant="ghost" className="ml-auto gap-1" onClick={() => setOpen(false)}>
                <Link to="/vic/$threadId" params={{ threadId: status.threadId }}>
                  Open chat <ExternalLink className="size-3" />
                </Link>
              </Button>
            )}
          </div>
        </form>

        {status?.webhookUrl && (
          <div className="space-y-1.5 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium">Twilio Sandbox webhook URL</p>
            <div className="flex items-center gap-1.5">
              <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-[11px] border border-border">
                {status.webhookUrl}
              </code>
              <Button type="button" size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={() => void copyWebhook()} aria-label="Copy webhook URL">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Paste into Twilio Console → WhatsApp Sandbox Settings → &ldquo;When a message comes in&rdquo; (POST). Text <code>/new</code> on WhatsApp anytime to start a fresh chat.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
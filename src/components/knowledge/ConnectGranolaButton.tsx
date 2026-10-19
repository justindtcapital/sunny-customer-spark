import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { connectGranolaFn, disconnectGranolaFn, granolaConnectionStatusFn } from "@/utils/granola-connections.functions";

export function ConnectGranolaButton({ onChange }: { onChange: (connected: boolean) => void }) {
  const status = useServerFn(granolaConnectionStatusFn);
  const connect = useServerFn(connectGranolaFn);
  const disconnect = useServerFn(disconnectGranolaFn);
  const [connected, setConnected] = useState(false);
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; void status().then((r) => { if (active) { setConnected(r.connected); onChange(r.connected); } }).catch(() => { if (active) onChange(false); }); return () => { active = false; }; }, [status, onChange]);
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Link2 className="h-3.5 w-3.5" />{connected ? "My Granola · Connected" : "Connect Granola"}</Button>
    <Dialog open={open} onOpenChange={(value) => { if (busy) return; setOpen(value); setApiKey(""); setError(""); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{connected ? "My Granola connection" : "Connect my Granola"}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={async (event) => {
          event.preventDefault(); setBusy(true); setError("");
          try { await connect({ data: { apiKey } }); setConnected(true); onChange(true); setApiKey(""); setOpen(false); toast.success(connected ? "Granola connection replaced." : "Connected to your Granola."); }
          catch (e) { setApiKey(""); setError(e instanceof Error ? e.message : "Connection failed."); }
          finally { setBusy(false); }
        }}>
          <div className="space-y-2"><Label htmlFor="personal-granola-key">{connected ? "Replacement API key" : "Personal API key"}</Label><Input id="personal-granola-key" type="password" autoComplete="off" value={apiKey} disabled={busy} onChange={(event) => setApiKey(event.target.value)} required /></div>
          <a className="text-sm text-primary underline" href="https://docs.granola.ai/help-center/sharing/integrations/granola-api" target="_blank" rel="noreferrer">Granola API key settings</a>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {connected && <Button type="button" variant="destructive" disabled={busy} onClick={async () => { setBusy(true); try { await disconnect(); setConnected(false); onChange(false); setApiKey(""); setOpen(false); toast.success("Disconnected. Imported notes are unchanged."); } catch (e) { setError(e instanceof Error ? e.message : "Disconnect failed."); } finally { setBusy(false); } }}><Unplug className="h-4 w-4" />Disconnect</Button>}
            <Button type="submit" disabled={busy || !apiKey.trim()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{connected ? "Replace connection" : "Connect"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
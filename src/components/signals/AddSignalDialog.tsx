import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { SignalNewsKind } from "@/lib/signals-page";
import { addSignalFn } from "@/utils/signals.functions";
import { cn } from "@/lib/utils";

export function AddSignalDialog({
  open,
  onOpenChange,
  portcos,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  portcos: string[];
  /** Called with the saved (or already-existing) signal ID. */
  onSaved: (id: string) => void;
}) {
  const [kind, setKind] = useState<SignalNewsKind>("PortCo");
  const [company, setCompany] = useState("");
  const [url, setUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [text, setText] = useState("");
  const [sendToNews, setSendToNews] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) return;
    setKind("PortCo"); setCompany(""); setUrl(""); setHeadline(""); setText(""); setSendToNews(false); setBusy(false);
  }, [open]);

  const canSave = !busy && (url.trim() || text.trim() || headline.trim()) && (kind === "Industry" || company);

  const save = async () => {
    setBusy(true);
    try {
      const res = await addSignalFn({ data: { kind, company, url, headline, text, sendToNews } });
      if (!res.ok) {
        if (res.duplicateOf) {
          toast.info(res.error);
          onSaved(res.duplicateOf);
          onOpenChange(false);
        } else toast.error(res.error);
        return;
      }
      if (sendToNews && res.sent === false) toast.warning(`Saved to Signals, but not sent to news@: ${res.sendError}`);
      else toast.success(sendToNews ? "Saved to Signals and sent to news@" : "Saved to Signals");
      onSaved(res.id);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the signal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a signal</DialogTitle>
          <DialogDescription>Paste a link or some text. It's saved to Signals for the whole team.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-1.5">
            {(["PortCo", "Industry"] as const).map((k) => (
              <Button key={k} type="button" size="sm" variant={kind === k ? "default" : "outline"} className="h-8 text-xs" onClick={() => setKind(k)}>
                {k === "PortCo" ? "PortCo news" : "Industry news"}
              </Button>
            ))}
          </div>

          {kind === "PortCo" ? (
            <div className="space-y-1.5">
              <Label>PortCo</Label>
              <Popover open={pickOpen} onOpenChange={setPickOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={pickOpen} className="w-full justify-between font-normal">
                    <span className={cn(!company && "text-muted-foreground")}>{company || "Pick a PortCo…"}</span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search PortCos…" />
                    <CommandList>
                      <CommandEmpty>No PortCo found.</CommandEmpty>
                      {portcos.map((p) => (
                        <CommandItem key={p} value={p} onSelect={() => { setCompany(p); setPickOpen(false); }}>
                          <Check className={cn("h-4 w-4", company === p ? "opacity-100" : "opacity-0")} /> {p}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="sig-company">Company (optional)</Label>
              <Input id="sig-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Who is the story about?" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="sig-url">Link</Label>
            <Input id="sig-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sig-headline">Headline (optional — taken from the link if blank)</Label>
            <Input id="sig-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sig-text">Text or summary</Label>
            <Textarea id="sig-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the key paragraph, or a note on why it matters." />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={sendToNews} onCheckedChange={(v) => setSendToNews(v === true)} />
            Also send to news@ so it's filed like any forwarded email
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save signal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

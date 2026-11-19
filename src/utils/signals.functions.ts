// Signals page server functions. Reads are team-only like other CRM data;
// writes (add, send to news@) require verified team sign-in.
import { createServerFn } from "@tanstack/react-start";
import { requireTeamAuth } from "./team-auth";
import type { SignalNewsKind } from "@/lib/signals-page";

export const fetchSignalsFeed = createServerFn({ method: "GET" })
  .middleware([requireTeamAuth])
  .handler(async () => {
    const { loadSignalsFeed } = await import("./signals.server");
    return loadSignalsFeed();
  });

const kindOf = (k: unknown): SignalNewsKind => (k === "PortCo" ? "PortCo" : "Industry");
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const sendSignalToNewsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id?: string; kind: SignalNewsKind; company?: string; headline: string; summary?: string; sourceUrl?: string }) => {
    const headline = str(d?.headline, 300);
    if (!headline) throw new Error("A headline is required.");
    return { id: str(d.id, 60) || undefined, kind: kindOf(d.kind), company: str(d.company, 200), headline, summary: str(d.summary, 4000), sourceUrl: str(d.sourceUrl, 2000) };
  })
  .middleware([requireTeamAuth])
  .handler(async ({ data, context }) => {
    const { sendSignalToNews } = await import("./signals.server");
    return sendSignalToNews(data, context.teamEmail);
  });

export const addSignalFn = createServerFn({ method: "POST" })
  .inputValidator((d: { kind: SignalNewsKind; company?: string; url?: string; headline?: string; text?: string; sendToNews?: boolean }) => ({
    kind: kindOf(d?.kind),
    company: str(d?.company, 200),
    url: str(d?.url, 2000),
    headline: str(d?.headline, 300),
    text: str(d?.text, 6000),
    sendToNews: d?.sendToNews === true,
  }))
  .middleware([requireTeamAuth])
  .handler(async ({ data, context }) => {
    const { addManualSignal } = await import("./signals.server");
    return addManualSignal(data, context.teamEmail);
  });

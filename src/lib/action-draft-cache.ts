import { z } from "zod";

const person = z.object({ name: z.string(), email: z.string() });
const schema = z.object({
  request: z.string(), to: z.array(person), addr: z.string(), portcos: z.array(z.string()),
  tracks: z.array(z.enum(["BD", "GTM"])), subject: z.string(), body: z.string(),
  messages: z.array(z.object({ id: z.string(), role: z.enum(["user", "assistant"]), parts: z.array(z.object({ type: z.literal("text"), text: z.string() })) })),
  tone: z.enum(["formal", "informal"]), length: z.enum(["short", "long"]), includePortcos: z.boolean(),
  mode: z.enum(["email", "log"]), logNote: z.string(), fuDate: z.string(), fuNote: z.string(),
  found: z.array(z.object({ phrase: z.string(), note: z.string(), preselected: z.array(z.string()), candidates: z.array(person.extend({ company: z.string(), title: z.string().optional(), where: z.string() })) })),
  picked: z.record(z.string(), z.array(z.string())), outlookOpened: z.boolean(),
});
export type CachedActionDraft = z.infer<typeof schema>;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function actionDraftKey(account: string, source: { sourceKind: string; sourceId: string; followUpActivityId?: string }) {
  return `vp:action-draft:v1:${encodeURIComponent(account.trim().toLowerCase())}:${encodeURIComponent(source.sourceKind)}:${encodeURIComponent(source.sourceId)}:${encodeURIComponent(source.followUpActivityId || "")}`;
}
export function readActionDraft(store: Store, key: string): CachedActionDraft | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
export function writeActionDraft(store: Store, key: string, draft: CachedActionDraft): boolean {
  try { store.setItem(key, JSON.stringify(draft)); return true; } catch { return false; }
}

export function outlookComposeLinks(to: string[], subject: string, body: string) {
  const query = `to=${encodeURIComponent(to.join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { app: `ms-outlook://compose?${query}`, web: `https://outlook.office.com/mail/deeplink/compose?${query}` };
}
export function isAppleMobile(userAgent: string, platform: string, maxTouchPoints: number) {
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}
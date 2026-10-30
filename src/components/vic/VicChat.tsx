import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, getToolName, type UIMessage } from "ai";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { vicFetch } from "@/lib/vic-client";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { AttendeesReview, CompleteFollowUpsReview, EmailReview, FollowUpReview, LogActionReview, RelationshipReview } from "./VicReviewCards";
import { KbFolderPicker } from "./KbFolderPicker";
import { useAuth } from "@/lib/auth-context";
import { VicMark } from "./VicMark";
import { VicSkillPicker } from "./VicSkillPicker";
import { getVicSkill, type VicSkillId } from "@/lib/vic-skills";
import { Button } from "@/components/ui/button";

const SUGGESTIONS = [
  "Do any PortCos work with vector databases?",
  "Who in my network is a CISO in healthcare?",
  "What events do we have in 2027?",
  "What do our meeting notes say about Maven pricing?",
];

/** Loads a thread's saved messages, then renders the chat. */
export function VicChat({ threadId, page }: { threadId: string; page?: string }) {
  const [initial, setInitial] = useState<UIMessage[] | null>(null);
  useEffect(() => {
    let live = true;
    setInitial(null);
    void supabase.from("vic_messages").select("message").eq("thread_id", threadId).order("created_at").then(({ data, error }) => {
      if (!live) return;
      if (error) toast.error("Couldn't load this chat.");
      setInitial((data || []).map((r) => r.message as unknown as UIMessage));
    });
    return () => { live = false; };
  }, [threadId]);
  if (!initial) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  return <VicChatWindow key={threadId} threadId={threadId} initial={initial} page={page} />;
}

function VicChatWindow({ threadId, initial, page }: { threadId: string; initial: UIMessage[]; page?: string }) {
  const [text, setText] = useState("");
  const [skillId, setSkillId] = useState<VicSkillId | undefined>();
  const skillRef = useRef(skillId);
  skillRef.current = skillId;
  const { email } = useAuth();
  const me = email || "";
  const [folders, setFolders] = useState<string[]>([]);
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/vic", fetch: vicFetch, body: () => ({ threadId, page, kbFolderIds: foldersRef.current, skillId: skillRef.current }) }),
    [threadId, page],
  );
  const { messages, sendMessage, status, stop } = useChat({
    id: threadId,
    messages: initial,
    transport,
    onError: (e) => toast.error(/402/.test(e.message) ? "AI credits are used up for this workspace." : /429/.test(e.message) ? "Vic is busy — try again in a moment." : e.message || "Vic hit an error."),
  });
  const busy = status === "submitted" || status === "streaming";
  const send = (t: string) => {
    if (!t.trim() || busy) return;
    void sendMessage({ text: t.trim(), metadata: skillId ? { skillId } : undefined });
    setText("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Conversation className="flex-1 min-h-0">
        <ConversationContent>
          {messages.length === 0 && (
            <ConversationEmptyState icon={<VicMark className="h-10 w-10" />} title="Ask Vic" description="Questions across Network, PortCos, Partners and Events — or ask Vic to do something. Changes always wait for your review.">
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} type="button" variant="outline" size="sm" onClick={() => send(s)} className="h-auto whitespace-normal text-left">{s}</Button>
                ))}
              </div>
            </ConversationEmptyState>
          )}
          {messages.map((m) => (
            <Message key={m.id} from={m.role}>
              <MessageContent className={m.role === "user" ? "bg-primary text-primary-foreground" : "bg-transparent"}>
                {m.role === "user" && getVicSkill((m.metadata as { skillId?: unknown } | undefined)?.skillId) && <p className="mb-2 text-xs font-semibold">{getVicSkill((m.metadata as { skillId?: unknown }).skillId)?.name}</p>}
                {m.parts.map((p, i) => {
                  if (p.type === "text") return m.role === "user" ? <p key={i} className="whitespace-pre-wrap">{p.text}</p> : <MessageResponse key={i}>{p.text}</MessageResponse>;
                  if (isToolUIPart(p)) {
                    const name = getToolName(p);
                    const out = p.state === "output-available" ? (p.output as Record<string, unknown>) : null;
                    if (out?.status === "awaiting_review" && name === "proposeRelationshipChange")
                      return <RelationshipReview key={i} proposal={out as never} />;
                    if (out?.status === "awaiting_review" && name === "proposeEmailDraft")
                      return <EmailReview key={i} draft={out as never} />;
                    if (out?.status === "awaiting_review" && name === "proposeFollowUp") return <FollowUpReview key={i} p={out as never} me={me} />;
                    if (out?.status === "awaiting_review" && name === "proposeCompleteFollowUps") return <CompleteFollowUpsReview key={i} p={out as never} />;
                    if (out?.status === "awaiting_review" && name === "proposeLogAction") return <LogActionReview key={i} p={out as never} me={me} threadId={threadId} />;
                    if (out?.status === "awaiting_review" && name === "proposeEventAttendees") return <AttendeesReview key={i} p={out as never} />;
                    return (
                      <Tool key={i} defaultOpen={false}>
                        <ToolHeader type={p.type as never} state={p.state} title={name.replace(/([A-Z])/g, " $1").toLowerCase()} />
                        <ToolContent>
                          <ToolInput input={p.input} />
                          <ToolOutput output={p.state === "output-available" ? p.output : undefined} errorText={p.state === "output-error" ? p.errorText : undefined} />
                        </ToolContent>
                      </Tool>
                    );
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}
          {status === "submitted" && <div className="text-xs text-muted-foreground px-1">Vic is thinking…</div>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="border-t border-border p-3">
        <PromptInput onSubmit={(msg) => send(msg.text || "")}>
          <PromptInputBody>
            <PromptInputTextarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={getVicSkill(skillId)?.placeholder || "Ask Vic…"} />
          </PromptInputBody>
          <PromptInputFooter className="flex-wrap justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <VicSkillPicker value={skillId} onChange={setSkillId} onDraft={setText} disabled={busy} />
              <KbFolderPicker value={folders} onChange={setFolders} />
            </div>
            <PromptInputSubmit status={status} onStop={stop} disabled={!busy && !text.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

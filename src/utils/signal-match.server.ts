// On-demand "V.I.C. suggests" for one signal: which PortCos fit the news and
// which people in the network would care, with a specific reason for each.
// Read-only — every action the card offers goes through existing reviewed
// paths (email draft dialog, follow-up, V.I.C. chat). Server-only.
import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";
import {
  PORTCO_ANGLES, personCandidates, personLine, portcoCandidates, portcoLine, validateMatches,
  type SignalMatches,
} from "@/lib/signal-match";
import { markPortCoContacts } from "@/lib/contact-kind";
import { readableSummary } from "@/lib/signals-page";
import { createLovableAiGatewayRunIdFetch } from "./morning-brief-run-id.server";

export interface SignalForMatch {
  company: string;
  headline: string;
  summary: string;
  body: string;
  sourceType: string;
  sourceUrl: string;
}

export type SignalMatchResult = ({ ok: true } & SignalMatches) | { ok: false; error: string };

const Schema = z.object({
  portcos: z.array(z.object({
    name: z.string(),
    angle: z.enum(PORTCO_ANGLES),
    short: z.string(),
    why: z.string(),
    talkingPoint: z.string(),
  })),
  people: z.array(z.object({ id: z.string(), short: z.string(), why: z.string(), opener: z.string() })),
  note: z.string(),
});

const SYSTEM = `You are V.I.C., chief of staff to the Dell Technologies Capital (DTC) venture team.
You read one news signal and decide, thoughtfully, who on our side should act on it.

Two lenses:
1. "portcos": our portfolio companies (PortCos) that this news is genuinely relevant to — the reverse match. Good reasons: the news creates a go-to-market opening (a buyer, budget or mandate in their space), a competitive threat or wedge, validation of their thesis, a partnership opening, or a risk they should hear about. Pick an "angle" from: ${PORTCO_ANGLES.join(", ")}. "talkingPoint" is one sentence a DTC partner could say to that PortCo's founder.
2. "people": people in our network who would care. Good reasons are specific: their role owns the problem in the news, their company is the subject or a direct buyer/competitor, or their stated interests match. Mention which PortCo (if any) would make the conversation worth their time. "opener" is one natural first line of a short note to them (no greeting, no sign-off).

Rules:
- Use ONLY the candidates given. Echo PortCo names exactly; echo people by their id (the first field).
- Fewer, better: at most 3 PortCos and 4 people, and an empty list is the right answer when nothing truly fits. Never pad with weak matches.
- Each "short" is the gist in at most 12 words (shown in a shortlist, e.g. "Owns IAM at Barclays; Entro is the angle").
- Each "why" is 1–2 sentences, concrete, tied to this news and to that company or person. No scores, no generic phrases like "may be interested".
- Never suggest the PortCo the news is about as its own match.
- "note": one short sentence on the overall read (e.g. "Mostly a GTM opening for identity PortCos"), or "" if nothing fits.`;

function friendlyError(e: unknown): string {
  const status = (e as { statusCode?: number })?.statusCode;
  if (status === 402) return "Your workspace is out of AI credits. Add credits in Settings → Plans & credits, then try again.";
  if (status === 429) return "V.I.C. is busy right now. Try again in a minute.";
  if (status === 403) return "V.I.C. isn't allowed to run this request right now. A workspace admin may need to check AI settings.";
  return "V.I.C. couldn't read this signal right now. Try again in a minute.";
}

export async function suggestSignalMatches(s: SignalForMatch): Promise<SignalMatchResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { ok: false, error: "V.I.C. isn't connected to the AI service." };
  const { buildContacts, buildPortfolioCompanies } = await import("./sheets.server");
  let portfolio, rawContacts;
  try {
    [portfolio, rawContacts] = await Promise.all([buildPortfolioCompanies(), buildContacts()]);
  } catch (e) {
    console.error("[signal-match] CRM read failed", e);
    return { ok: false, error: "Your people and PortCo lists are temporarily unavailable. Try again in a minute." };
  }
  const contacts = markPortCoContacts(rawContacts, portfolio.map((p) => p.name));
  const people = personCandidates(contacts, s.company);
  const portcos = portcoCandidates(portfolio);
  const subjectIsPortco = portcos.some((p) => p.name.toLowerCase() === s.company.trim().toLowerCase());

  const prompt = [
    "SIGNAL",
    `Company: ${s.company || "(industry)"}${subjectIsPortco ? " — this is one of our PortCos" : ""}`,
    `Type: ${s.sourceType}`,
    `Headline: ${s.headline}`,
    `Summary: ${readableSummary(s.summary)}`,
    s.body && s.body !== s.summary ? `Detail:\n${s.body.slice(0, 3500)}` : "",
    s.sourceUrl ? `Source: ${s.sourceUrl}` : "",
    "",
    `PORTCOS (${portcos.length}) — name | focus | about`,
    ...portcos.map(portcoLine),
    "",
    `PEOPLE (${people.length}) — id | name | title | company | level | interests | DTC prime | last contact`,
    ...people.map(personLine),
  ].filter((l) => l !== "").join("\n");

  try {
    const runId = createLovableAiGatewayRunIdFetch();
    const provider = createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" }, fetch: runId.fetch });
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      output: Output.object({ schema: Schema }),
      system: SYSTEM,
      prompt,
      providerOptions: { openai: { forceReasoning: true, reasoningEffort: "medium", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
    });
    const raw = await result.output;
    return { ok: true, ...validateMatches(raw, people, portcos, s.company) };
  } catch (e) {
    console.error("[signal-match] AI call failed", e);
    return { ok: false, error: friendlyError(e) };
  }
}

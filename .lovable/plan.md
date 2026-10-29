# Gemini-style agents in Venture Pulse: what's realistic

## What Venture Pulse already has
- **AI built in.** Ask Venture Pulse, Tell, the Admin assistant, email drafting and company lookup all use the app's built-in AI. There's no Google billing and no API key to manage, and it already includes Gemini models.
- **Direct access to your Google data.** The app already reads and writes your Sheets, reads the shared Drive (Venture Pulse KB), reads Gmail through each person's connected mailbox, and reads Asana.
- **Most of what Gemini described already exists.** That includes the "Copilot chat over Drive and Sheets", the buttons that trigger an agent, and Granola meeting notes (manual sync, as you chose).

## How each Gemini suggestion fits
| Gemini suggestion | Fit for you |
|---|---|
| Vertex AI Agent Builder | Needs a paid Google Cloud project. It adds setup without adding much the app can't already do. Skip it. |
| Gemini Enterprise connector | Needs a Gemini Enterprise licence and a Google Cloud setup, not just Workspace. Gemini is right that you don't have it. Skip it unless you buy that licence later. |
| AI Studio API key | Not needed, because the built-in AI already covers it. Only worth it for a Google-only feature. |
| Apps Script, Make or n8n | Would duplicate what the app already does, and spread logic across more tools. Skip it. |
| Granola connector | Already in use. Keep manual sync. |

## What's actually possible and worth building
1. **One "Venture Pulse Agent" panel.** Upgrade Ask so it can carry out actions, not just answer. Examples: "Draft follow-ups for everyone I met at RSA", "Move these 5 to Prospecting", "Summarize Maven's last 30 days". It uses the same tools the app already has: search contacts, read Drive notes, create follow-ups, bulk relationship changes and draft emails.
2. **Show every step and require review.** The agent displays a step-by-step plan, for example: found 12 contacts, will create 12 follow-ups, here are the drafts. Nothing is saved until you approve, the same rule as notes review. Every run goes into the Admin activity log, with Retry and Create fix request.
3. **Better answers from Drive.** Build a searchable index of the Venture Pulse KB documents, updated when new files are filed. Ask can then quote and link the exact documents behind each answer.
4. **Optional background agents.** Examples: a Monday digest, a daily check of BD/GTM mail, and alerts for overdue follow-ups. Results land in My Actions as items to review and are never written automatically.

## Open questions
- Which of the four first? I'd start with 1 and 2 together.
- For the agent's first actions, which matter most: follow-ups, emails, relationship changes, or event attendees?

## Technical notes
- Uses the app's existing server code and built-in AI with tool calling. There is no Google Cloud, Vertex or extra API key.
- The Drive index is stored in the app's database. Sheets stays the system of record.
- Actions reuse the existing protected write paths: duplicate checks, the journal, and per-person outcomes.

# PortCo Knowledge Base: Drive + Gmail + Gemini

## The idea in one line
Make a shared Google Drive and your BD/GTM email aliases the place where knowledge builds up. Venture Pulse reads from both, Gemini summarizes it, and you can ask it questions from the Dashboard and from PortCo pages, with sources shown.

## How it would work for the team

```text
Shared Drive "Venture Pulse KB"
  /Skan/  meeting minutes, decks, notes
  /Maven AGI/ ...
  /_Unsorted/   (files Gemini routes to the right PortCo)
Gmail aliases (bd@, gtm@)  ->  read automatically, no manual inbox work
            |
   Venture Pulse indexes them (by PortCo, date, type)
            |
   Dashboard / PortCo page:  Recent activity summary + "Ask" chat
```

1. **Folder per PortCo.** Venture Pulse creates a folder for each PortCo in one shared Drive and keeps the names in sync. You and the team just save minutes there, including Google Meet "Take notes with Gemini" docs, which can go straight to the folder.
2. **"Knowledge & meetings" section on the Dashboard** (when one PortCo is selected, below the workstreams) and on the PortCo popup:
   - A Gemini summary of the last 6 or 12 months, with a toggle between the two.
   - A list of meetings by date, newest first. Each one expands to its summary, decisions and next steps, and links to "Open source doc".
3. **Ask panel** on the Dashboard and PortCo pages: plain-language questions like "Summarize Skan in the last quarter" or "What did we promise Maven AGI?". Answers cite the docs and emails they came from. On a PortCo page, questions stay inside that company. On the Dashboard, they can cover all PortCos.
4. **Activity harvesting (replaces manual Asana alias logging):**
   - Gmail: the bd@/gtm@ aliases keep collecting mail. Venture Pulse reads them on a schedule, matches each thread to a PortCo and contacts (it already does some of this), and records activities.
   - Meeting minutes: Gemini pulls attendees, the PortCo, intros made, follow-ups owed and events mentioned. These become activity entries with a link back to the source.
   - Results show in Activity tracking next to the Asana data, marked by source. You choose whether they also get pushed into Asana or stay in Venture Pulse only.
5. **NotebookLM:** it has no API for apps like this, so it can't be built in. The Drive folders still work well with it: anyone can point a notebook at a PortCo folder for deep-dive or audio overviews. Venture Pulse would give you similar question-and-answer features inside the app.

## Suggested phases
- **Phase 1:** Drive folder per PortCo, a meetings list with summaries, and source links on the Dashboard and PortCo popup.
- **Phase 2:** The Ask panel, scoped to one PortCo or across all of them, with citations.
- **Phase 3:** Automatic activity harvesting from Gmail aliases and meeting minutes, plus the choice of whether to write it to Asana.

## Decisions needed from you
- Should Gmail aliases be read from one shared mailbox (simplest), or from each person's inbox?
- Should harvested activities be written back to Asana, or replace the Asana alias process over time?
- Default summary window: 6 or 12 months?
- Confidential documents: is it OK to send PortCo document contents to Gemini through your Workspace or Google Cloud account?

## Technical details
- Use the existing `drive.server.ts`, `gmail.server.ts` and `gemini.server.ts` (Vertex). New `knowledge.server.ts` holds the index: a sheet tab "Knowledge Index" with file id, PortCo, date, type, summary, extracted JSON and content hash. It re-reads only files that changed (Drive `modifiedTime` and hash).
- Retrieval: filter by PortCo and date first, then send the top documents to Gemini as grounding with citation ids. This avoids running a separate vector database at your size. Optional later: Vertex AI Search, or a Gemini Enterprise data store over the shared Drive.
- A scheduled job (existing cron pattern under `src/routes/api/cron/`) runs Drive indexing and the Gmail alias sync. Every LLM call is logged by hash, following the thread-reader convention.
- New UI: `KnowledgePanel` (summary + meetings + drill-in) and `AskPanel` (chat with citations), placed in the dashboard single-company view and in `PortfolioDetail`.

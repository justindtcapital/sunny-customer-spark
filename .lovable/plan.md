# Knowledge Repository + "Talk to My PortCos"

## What you'd get

1. A **Knowledge Repository** per portfolio company: one Google Drive folder per PortCo holding meeting notes (Granola exports), decks, proposals, memos.
2. A new page, **Talk to My PortCos**, where you pick one, several, or all PortCos and ask questions: current work streams, recent notes, suggested next steps, takeaways.
3. Answers come with **citations** (which document, which date) and each suggested next step has a **"Promote to CRM"** button that writes it into the CRM as a tracked work stream / next step.

## Your options for the AI side (and the recommendation)

| Option | How it works | Verdict |
| --- | --- | --- |
| **NotebookLM** | Upload docs to a notebook, chat there | No API for querying notebooks from an app. Great for you personally, cannot power a Venture Pulse page. Rejected. |
| **Gemini app "Gems"** | Build a Gem in the Gemini UI | Also not callable from code. The app already fakes this well: `src/utils/gems/*` is an in-app Gem pattern (persona + playbook + grounding) on top of Vertex. |
| **Vertex AI Search / RAG Engine** | Google-hosted index over the Drive folder, managed retrieval | Powerful, but adds a second Google product to provision, index-refresh lag, and ongoing cost. Worth it later at thousands of documents. |
| **Retrieve-then-ask in the app (recommended)** | Drive lists + fetches the relevant files, we extract text, hand it to Vertex Gemini as grounded KNOWLEDGE, model answers with citations | Uses exactly what's already wired: `google.server.ts` auth, `drive.server.ts` list/download, `gemini.server.ts` Vertex calls, `gems/` grounding pattern, Sheets for persistence. No new Google product. |

Recommendation: build the retrieve-then-ask version now, keep the retrieval layer behind one function so it can be swapped for Vertex AI Search later without touching the page.

## Drive layout

```text
Knowledge Repository/            <- GOOGLE_DRIVE_KNOWLEDGE_FOLDER_ID
  Acme Data/                     <- folder name matches PortCo name
    2026-07-14 Granola - QBR.md
    Acme Series B deck.pdf
  Foo Systems/
```

- Folder-name-to-PortCo matching reuses the existing fuzzy matcher in `src/lib/portco-names.ts` (the one that fixed VAST vs VAST Data), so "Acme" and "Acme Data" resolve to one company.
- Granola: export notes to that folder (Granola's Drive/Notion export, or drop the markdown in). If you want it automatic later, a scheduled sync is a follow-up, not part of this build.
- A **Documents** section on each PortCo detail page lists that company's files, so the repository is visible in-app, not just in Drive.

## How a question is answered

```text
pick PortCos -> ask question
      |
  list folders + files (Drive)         <- cached in a "Knowledge Index" sheet tab
      |
  pick candidate docs (recency + name/keyword match, capped)
      |
  download + extract text (PDF/Docs/Slides/markdown/txt)
      |
  build KNOWLEDGE blocks per company, budget-capped
      |
  Vertex Gemini via a new "PortCo Analyst" Gem -> JSON:
    { summary, workstreams[], recentNotes[], nextSteps[], risks[], citations[] }
      |
  render answer + sources; each nextStep has "Promote to CRM"
```

Long docs are chunked and only the top-scoring chunks are sent, so token spend stays bounded regardless of folder size.

## Promoting to the CRM

Suggested next steps and work streams are structured, not just prose. Promoting one writes a row to a new **PortCo Workstreams** tab (Company, Title, Owner, Status, Due, Source doc, Created by, Timestamp) and logs the action to the existing Ops Log, matching how the rest of the app persists. Promoted items then show on the PortCo detail page with status editing.

## Technical section

New files:
- `src/utils/knowledge.server.ts` — folder-per-PortCo discovery, file listing, text extraction (Docs/Slides export as text, PDF via Drive export, plain text direct), chunking + relevance selection, index cache in a new `Knowledge Index` sheet tab.
- `src/utils/knowledge.functions.ts` — server fns: `listKnowledgeFolders`, `listPortcoDocs({ company })`, `askPortcoKnowledge({ companies, question })`, `promoteWorkstream(...)`.
- `src/utils/gems/portco-analyst.ts` — the Gem instruction (persona, playbook, strict JSON output contract, "cite or omit" rule) registered in `gems/registry.ts`, run through the existing `runGemJSON`.
- `src/routes/knowledge.tsx` — the Talk to My PortCos page: multi-select PortCo picker, question box, preset prompts (work streams / recent notes / next steps / takeaways), streaming-style progress, answer with citations, promote buttons.
- `src/components/knowledge/` — picker, answer panel, citation list, promote dialog.

Changes to existing files:
- `src/utils/sheets.server.ts` — add `knowledgeIndex` and `portcoWorkstreams` to `TAB_NAMES`, headers, read/append/update helpers, reusing `sheetsFetch` (keeps the 429 backoff).
- `src/utils/drive.server.ts` — add folder listing + child listing and a text-export download; keep the existing signals-folder behavior untouched.
- `src/components/app-sidebar.tsx` — nav entry.
- `src/components/portfolio/PortfolioDetail.tsx` — Documents list + promoted workstreams section.
- `src/utils/health.functions.ts` — health row for the knowledge folder.

New secret: `GOOGLE_DRIVE_KNOWLEDGE_FOLDER_ID` (the parent folder). Everything degrades to a connect-prompt when it's unset, same as the signals folder does today. All Drive/Gemini calls stay in `.server.ts` behind server functions; no credentials reach the browser. Every LLM call logs to the existing LLM log tab.

## Scope notes

- Sessions are in-memory per page visit (like the old query-session store); persistent chat history is a follow-up if you want it.
- Automatic Granola-to-Drive sync is out of scope for this build.

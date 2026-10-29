# Vic: Venture Pulse's assistant

Vic is one assistant you can reach from anywhere in the app. It answers questions, searches the knowledge base, and carries out Venture Pulse actions. Every action is shown step by step and needs your review before anything is saved.

## What you'll see
- **A Vic button on every page.** It opens a side panel that already knows where you are. For example, on MavenAGI's PortCo page it knows the company, and on an event it knows the event and its attendees.
- **A Vic page** with your past chats down the left. Each chat has its own link, so you can come back to it. Chats are saved for each teammate and are private to you.
- **Answers with sources.** Every answer links the documents, contacts, companies and events it used.
- **Step-by-step actions with review.** When you ask Vic to do something, it shows a plan, for example "Create 12 follow-ups" with a preview of each. You can approve all, approve some, edit, or cancel. Results show per person or per item, with Retry, and every run appears in the Admin activity log.

## Phase 1: Vic core
- Side panel, Vic page and saved chats.
- **Read-only tools:**
  - search Network and Prospecting contacts
  - look up PortCos, Partners, events, workstreams and follow-ups
  - read recent notes and activity
- **Action tools (always reviewed):**
  - create, complete or edit follow-ups
  - promote, demote or move contacts to Prospecting
  - add event attendees
  - draft an email (opens Outlook, never sends)
  - log an action

  These reuse the app's existing safe save steps: duplicate checks, the activity journal and per-person results.

## Phase 2: Knowledge base search
- Index the Venture Pulse KB shared Drive: Docs, Sheets, Slides, PDFs and text files. The index updates as files are filed or changed, with a "Refresh index" button in Admin.
- **Folder picker in Vic.** Choose one or more Drive folders (for example "Meeting Notes / MavenAGI" or "PortCo Operations") to limit a question to them, or search everything.
- Answers quote passages and link the exact files.

## Phase 3: Skills (shared by the whole team)
- **PortCo questions.** "Do any PortCos work with vector databases?" or "Which PortCos sell to healthcare?" Vic answers across all or selected PortCos, with evidence from summaries, the PortCo List, notes and Drive.
- **New company overlap.** Paste a website or upload a deck. Vic summarizes the company and shows which PortCos overlap, compete or complement it, and why. It also suggests Network people to introduce.
- **Introduction matching.** "Who in my network should meet Arena AI?" Vic ranks people by area of interest, role, company and past interactions, and explains each pick. It never makes an introduction on its own.
- **A framework for adding skills.** Each skill has a name, a description, the tools it may use, and instructions. Skills are visible on the Vic page, so you can add more later, such as daily digest, Monday-morning actions, knowledge management and reporting.

## Phase 4: Scheduled skills (later)
- Monday-morning actions, a daily digest and a weekly report run on a schedule. Their results land in My Actions or the Vic page for review. Nothing is changed automatically.

## Risks and guardrails
- **Wrong actions.** Nothing is written without your approval, and every change goes through the existing protected save steps and is logged.
- **Privacy.** Chats are private to each teammate. Drive search respects the shared Venture Pulse KB only.
- **Cost.** The built-in AI is charged to workspace credits. Indexing runs once per file version, not on every question.
- **Wrong answers.** Answers must cite sources. When Vic can't find evidence, it says so instead of guessing.

## Build order
Phase 1 first (about the size of the My Actions build), then Phases 2, 3 and 4. Each phase is usable on its own.

## Technical details
- New `/vic` and `/vic/$threadId` pages, plus a global Vic button and side panel in the root layout that pass the current page as context.
- Saved chats: `vic_threads` and `vic_messages` tables, scoped to the signed-in teammate through access rules.
- Streaming chat on the built-in AI with tool calling, through a TanStack server route. Read tools call the existing server helpers. Action tools return a proposed plan only, and approved plans run through new review endpoints that wrap the existing journaled server functions.
- Drive index: a `kb_chunks` table with embeddings and file/folder metadata. Indexing is incremental by Drive modified time, and searches can be filtered by folder.
- Skills: a `vic_skills` registry (name, instructions, allowed tools), with the built-in skills seeded in the migration.
- The `AGENTS.md` rule is that Vic actions are proposals until reviewed, and run only through existing journaled write paths.

# PortCo Knowledge Base: Drive + Gmail + Gemini (replaces Asana activity tracking)

## The idea in one line
A shared Drive (meeting minutes and docs) and one shared alias mailbox (bd@/gtm@) feed Venture Pulse. Everything is pulled out, organized and **saved permanently in the Venture Pulse database**. Gemini then summarizes it and answers questions about it, showing where each answer came from.

## Your questions answered
- **Is email left in Gmail, or saved?** Saved. Each email thread and each meeting doc is pulled into the Venture Pulse database and kept there: sender, recipients, date, PortCo, a cleaned copy of the text, a summary, and the activities found in it. If the mailbox or a Drive file is deleted later, the record stays in Venture Pulse and is backed up along with everything else. Gmail and Drive are only where things come in.
- **Can contacts be pulled from alias emails?** Yes. Every person on From, To or Cc (plus names found in email signatures) is matched against Network and Prospecting.
  - A **known person** gets the interaction added to their history. Their stage and owner stay as they are.
  - A **new person** goes into a "Suggested contacts" review list with the PortCo, email thread and company domain already filled in. One click adds them to Network, or to Prospecting if you prefer, and Apollo fills in their details.
  - Internal team addresses, newsletters and automated senders are filtered out, using the existing noise filters.
- **Do we need Google Apps Script?** No. Venture Pulse can read the shared mailbox and the Drive directly with your Google account, on a schedule (every 15 minutes, for example). A small Apps Script would only make sense later, if you want instant pickup or Gmail labels applied automatically. It isn't required.
- **Asana:** Activities will no longer come from Asana or go back to it. A one-time import copies your existing Asana activity history into Venture Pulse so nothing is lost. After that, Activity tracking runs only on email and meeting minutes. Asana workstreams (status, priority, edits) stay as they are today, unless you want those moved too later.

## How it works
```text
Shared mailbox (bd@ / gtm@)      Shared Drive /<PortCo>/ minutes, decks
            \                         /
      Venture Pulse harvester (scheduled)
            |  extract: PortCo, people, intros, events, follow-ups
            v
  Venture Pulse database: Knowledge Records + Activities + Suggested Contacts
            |
  Dashboard / PortCo page: activity timeline, meetings, Ask panel
```

## What you'll see
1. **Folder per PortCo** in a shared Drive, created and kept in sync automatically. Meet's Gemini notes can be saved straight into the folder. Files Venture Pulse can't place go into an Unsorted folder for review.
   - **Upload notes / drop a file** inside Venture Pulse, on the PortCo popup, the Dashboard knowledge section and a Knowledge page. You can drag in files (PDF, Word, PowerPoint, text, images) or type and paste minutes in a quick form: PortCo, optional workstream, meeting date, attendees, notes. Venture Pulse saves the file to the right PortCo folder in Venture Pulse KB, named by date and title, then reads and indexes it straight away. Saving files directly into the Drive folders still works too.
2. **Activity tracking** (Dashboard with one PortCo selected, and the PortCo popup): a timeline built from email and meetings, filterable by type (intro, meeting, email, event, follow-up). Each entry opens its summary and the original source.
3. **Knowledge & meetings section** below the workstreams: a summary of the last 6 months by default, with a 12-month toggle. You can open any set of minutes to see the full notes and their source links.
4. **One matching engine for everything.** Meeting minutes, uploaded notes and workstreams@ emails all go through the same step:
   - Gemini works out the PortCo first, then the workstream, using the title, the people, the topics and the email domains.
   - It pulls out the same things every time: a summary, an update, next steps (with owners and dates), any timeline, and the attachments. Attachments are saved to `/<PortCo>/Workstream docs/` in Venture Pulse KB.
   - Nothing is written to Asana.
5. **Review queue with four choices.** Every match lands in a single "Workstream updates" queue, whether it came from minutes or email:
   - **Confirm**: accept the suggested PortCo and workstream.
   - **Change**: pick a different PortCo or workstream.
   - **Create new**: start a new suggested workstream. It is tracked in Venture Pulse and marked "Not in Asana yet".
   - **Ignore**: dismiss it. It stays saved but is hidden, and an "Ignored" filter brings it back.
   Confident matches still wait for your Confirm, shown as "Matched". Weak ones are shown as "Suggested". Only confirmed items appear under a workstream.
   **Where this shows:** only on the Dashboard workstream view (Action owners / Investor view), with a "Needs review (N)" panel beneath the workstreams. PortCo pages are left as they are.
6. **Three tracks**, all from the one shared mailbox: bd@ (BD activity), gtm@ (GTM activity) and workstreams@ (workstream updates). Meeting minutes feed all three.
7. **Suggested contacts** review list (on Network) for new people found in alias emails.
8. **Ask panel** on the Dashboard and PortCo pages. It draws on everything: knowledge records, activities, workstream updates, Network and Prospecting contacts, events and attendance, campaigns, and Asana workstreams. For example:
   - "Summarize all introductions made for Skan"
   - "Which events has Maven AGI been part of, and who attended?"
   - "Give me a business brief of the PortDev effort for this account"
   - One-click **Investor brief** and **Founder brief** buttons produce a polished write-up with citations, ready to export or copy.
9. **NotebookLM:** it has no API for apps like this. Anyone can still point a notebook at a PortCo folder.

## Phases
- **Phase 1:** Harvest the shared mailbox (all three aliases) and Drive, save the records permanently, build the new Activity timeline, and import the Asana activity history once.
- **Phase 2:** Match minutes to workstreams, add workstream updates and save attachments to Drive, and add the Suggested contacts review.
- **Phase 3:** Ask panel, plus the Investor and Founder briefs.

## Confirmed
- Use one shared mailbox. You will create the bd@, gtm@ and workstreams@ aliases.
- Gemini runs under your Workspace Google account, which is protected.
- The default summary window is 6 months.
- Activities stop coming from Asana. Nothing is written back to Asana.

- Shared KB Drive "Venture Pulse KB" (id `0AFtlyPes27_KUk9PVA`): Venture Pulse can see it and add files to it. It is empty today. PortCo folders get created inside it.

- Aliases: bd-tracking@dt-capital.net (BD activity), gtm-tracking@dt-capital.net (GTM activity), workstreams@dt-capital.net (workstream updates), news@dt-capital.net (PortCo news and press; saved as knowledge records tagged "News" and available to Ask and briefs, but not counted as activity).

## Still need from you
- The shared mailbox that receives all four aliases (Venture Pulse reads that one inbox).
- Make sure the Google account Venture Pulse uses has Content manager access to the shared KB Drive.

## Technical details
- New sheet tabs: `Knowledge Records` (source type, Gmail thread id or Drive file id, PortCo, date, participants, cleaned text, summary, extracted JSON, content hash), `Harvested Activities`, `Suggested Contacts`, and `Harvest State` (Gmail historyId, Drive page token). Writes are append-mostly and deduplicated by source id and hash.
- Large cleaned text goes into a Drive "VP Archive" JSON file when it exceeds the Sheets cell limit. The record keeps a pointer to it.
- Harvester: a cron server route reuses `gmail.server.ts` (incremental `history.list`), `drive.server.ts` (`changes.list`), and the thread-reader extraction in `thread-reader.server.ts`, generalized for Drive docs. Every Gemini call is logged by hash.
- Contact extraction reuses `email-address`, `email-noise`/`contact-noise` and `activity-match`. New people are written only to `Suggested Contacts` until approved.
- Activity tracking UI switches from `fetchAsanaActivities` to a new harvested-activities function. The one-time Asana import script maps rows into `Harvested Activities` with source "Asana (archived)".
- Ask: a server function gathers scoped context (PortCo, date window) across the tabs, sends it to Gemini with citation ids, and renders answers with `MarkdownMessage`. Brief templates are Gems in `src/utils/gems/registry.ts`.
- Track routing by the recipient alias in To/Cc/Delivered-To headers: bd / gtm / workstreams.
- Workstream matching: candidates are the PortCo's workstream subtasks. Gemini returns a gid and a confidence score; below the threshold the match is stored as suggested. Stored in a `Workstream Links` tab (record id, workstream gid, confidence, confirmed).
- Attachments: download them with Gmail `attachments.get`, upload them to `/<PortCo>/Workstream docs/` with `drive.server.ts`, and deduplicate by SHA-256. The Drive file id is stored on the record.
- Gemini goes through the existing Vertex setup (`gemini.server.ts`) under the Workspace project.

# Granola meeting notes → Venture Pulse knowledge base

## Goal
Any meeting note in your Granola workspace shows up in Venture Pulse automatically. Each note is saved permanently, linked to the right PortCo, and suggested for matching to a workstream. Granola joins Gmail and Drive as a third source the harvester reads.

## How it works for you
1. **Connect Granola once.** A connect card asks for your Granola API key (Granola → Settings → API). One workspace key covers every note the key can see.
2. **Automatic pickup.** Every harvest run (scheduled, or "Harvest now" on the dashboard) pulls Granola notes created since the last run. Granola only returns notes that already have an AI summary, so in-progress meetings are picked up on a later run.
3. **What gets saved for each note:**
   - A Knowledge Record: title, date, attendees, Granola summary, a link back to Granola, and the transcript when one is available.
   - A Harvested Activity on the PortCo's timeline (labeled "Meeting – Granola").
   - A copy of the note in the "Venture Pulse KB" Drive, in a `Meeting Notes/<PortCo>` folder, so NotebookLM and Gemini can use it too.
4. **Matching.** Gemini reads the summary and suggests a PortCo and workstream. The suggestion goes to the existing review queue on the Dashboard workstream view (Confirm / Change / Create new / Ignore). Only confirmed notes appear under workstreams.
5. **Contacts.** External attendees who aren't in Network or Prospecting go to Suggested Contacts for review. Nothing is added automatically.
6. **No duplicates.** Each Granola note is stored once, by its Granola ID. Re-running the harvest or editing a note in Granola never creates a second copy.

## Optional: Granola folders
If your team files notes in Granola folders named after PortCos, the folder name becomes the PortCo match. Gemini is only used when a note has no folder.

## Knowing when a note is safe to delete in Granola
- A new **Granola Imports** list on the dashboard knowledge area shows every Granola note Venture Pulse has seen: title, meeting date, PortCo, and three checkmarks: **Saved** (stored permanently in Venture Pulse), **Copied to Drive** (with a link to open the copy), and **Transcript** (included, or none available).
- A note shows a green **Safe to delete in Granola** badge only after Venture Pulse re-reads both the saved record and the Drive file and confirms they match the Granola note. Notes still missing anything show what's missing, plus a "Retry" button.
- After each harvest you get a short summary, e.g. "12 new Granola notes saved, 12 copied to Drive, 0 problems."
- Filter: "Safe to delete" lists only verified notes, so you can work through Granola with confidence.
- Deleting a note in Granola later never removes it from Venture Pulse or Drive, and it won't be re-imported.
- Venture Pulse will not delete anything in Granola itself; you stay in control of that.

## Limits to know
- Granola's API is read-only for this purpose. Venture Pulse copies notes in and never changes anything in Granola.
- API access depends on your Granola plan. If the key is refused, the connect step will say so.
- Google Meet / Gemini notes keep arriving through the Drive and Gmail harvest once Shane's mailbox delegation is active. The two sources sit side by side.

## Technical details
- Link the Granola connector (`standard_connectors--connect`, id `granola`). Calls go through the connector gateway from server code only: `GET /v1/notes?created_after=&cursor=` and `GET /v1/notes/{id}?include=transcript`, plus `GET /v1/folders` for the folder→PortCo map.
- New `src/utils/granola.server.ts`: gateway client with paging and surfaced error status and body.
- `knowledge-harvest.server.ts`: add a `granola` track with a `granola:notes` cursor in Harvest State. Bounded per run (default 25 notes). Source id is `granola:<noteId>`. Reuse the existing Gemini extraction for PortCo/workstream/contacts.
- Drive helper: create or find `Meeting Notes/<PortCo>` in drive 0AFtlyPes27_KUk9PVA and upload the note as markdown (`supportsAllDrives`). The Drive file id is stored on the Knowledge Record.
- KnowledgePanel: show a source badge (Granola / Gmail / Drive / Asana archive) and render summaries as markdown.
- Tests: dedup by note id and cursor advance. Then run a live harvest and check in the browser that a note appears on the PortCo timeline and in the review queue.
- Add the Granola track to `roadmap.md`. Record "external note sources plug in as harvester tracks keyed by stable source id" in AGENTS.md.

# Notes Imports: one review inbox for meeting notes

The "Granola Imports" and "Workstream Updates" sections on the dashboard become one section, **Notes Imports**. Every note shows up there until you review it. Once you review it, it moves to History.

## What you'll see

**Header**
- Title: **Notes Imports**, with a count of notes waiting for review
- Buttons: **Import from Granola**, **Upload notes** (file picker), and a drag-and-drop area for files (.md, .txt, .docx, .pdf)
- Toggle: **Show history** (off by default, so you only see notes you haven't reviewed)

**Each note row (collapsed):** same layout whatever the source
- Source badge: Granola / Drive / Upload
- Title, date, matched PortCo
- Check marks: Saved, Copied to Drive, Transcript included, Safe to delete
- Granola and Drive links

**Click a note to expand it:**
1. **Workstream:** the suggested workstream, with **Confirm**, **Change** (pick another workstream) and **Create new**. **Ignore** means "no workstream".
2. **Next steps:** the action items found in the note, each with its owner and due date when the note gives them. Each one has a **Create follow-up** button, which sets a reminder or follow-up the same way it works in Prospecting and Network today.
3. **People found:** names and emails from the note. People who are already contacts get a link to their contact card. New people get **Add to contacts** or **Skip**.
4. **Activity:** a preview of the activity entry. You can edit its type and summary before saving.
5. **Mark reviewed:** saves the workstream choice and the activity (with the PortCo and workstream tags) and records who reviewed it and when. The note then leaves the inbox.

**History view:** shows reviewed notes with the reviewer, the date and the decisions made. You can reopen any of them.

## What changes and what stays
- The separate "Workstream Updates" queue goes away. Email-based workstream suggestions show inside Notes Imports as "Email" source rows, so there is still one place to review everything.
- Only confirmed workstream links appear under workstreams. That rule doesn't change.
- Granola stays read-only. Notes that were reviewed or deleted in Granola are never imported again.
- **Granola syncs only when you click "Import from Granola".** The scheduled harvest no longer pulls from Granola, so you can tidy notes in Granola first. Email and Drive keep running on schedule. When you click sync, it pulls the latest version of every note that hasn't been imported yet.
- Uploaded files are saved to the Venture Pulse KB Drive under Meeting Notes/<PortCo>. Then they go through the same reading step as Granola notes.

## Technical details
- Add a review state to each note: `reviewStatus` (pending/reviewed), `reviewedBy`, `reviewedAt`, and a JSON blob with the decisions. It is stored in the Harvest State tab under the key `review:<recordId>`, so the existing tabs and columns stay as they are.
- `runKnowledgeHarvest` gets an `includeGranola` flag. The cron route passes false. A new `syncGranolaFn` runs only the Granola track, triggered by the button.
- Extend the Gemini extraction so it returns `nextSteps[{text, owner, due}]` and a richer `people[]`. Existing records get these fields filled in the first time they are opened, and the result is saved.
- New server functions: `fetchNotesInboxFn({history})`, which merges knowledge records with their workstream links and contact suggestions, plus `uploadNoteFn` (base64 → Drive → extract → record) and `reviewNoteFn` (applies the workstream link review, accepts or skips each contact suggestion, creates follow-up reminders through the existing reminder helper, writes the activity, and stamps the review).
- New `src/components/knowledge/NotesImports.tsx`. It replaces `GranolaImports.tsx`, and the dashboard drops the standalone `WorkstreamReviewQueue`. Its Confirm/Change/Create new logic is reused inside the expanded row.
- Safe to delete keeps the current rule: the saved note and its Drive copy are both re-read and found.
- Tests: a reviewed note is excluded from the pending inbox. Re-importing a reviewed Granola note doesn't create a duplicate.

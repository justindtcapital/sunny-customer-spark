# Activity Review panel (email activity inbox)

## Where it lives
On the Dashboard, directly beside Notes Imports as a second tab: **Notes Imports | Activity Review**. Same place, same layout, same owner scoping, so all "things waiting for my review" sit together. A count badge on each tab shows how many items are waiting.

## How it works
Every email the harvester pulls from bd-tracking@, gtm-tracking@, workstreams@ and news@ lands here first as **Pending**. It does not count as a registered activity (dashboard activity charts, PortCo timelines, workstream history) until someone reviews it.

Each pending item is a card, formatted like a note:
- Source badge showing which alias it came from (BD, GTM, Workstream, News), plus subject, sender, date and a short AI summary. Click to expand the full email body and attachments (linked to Drive).
- **Track**: the AI's guess (BD / GTM / Workstream / News), which you can change with one click.
- **PortCo, then Workstream**: same picker as Notes Imports. Choosing a PortCo limits the list to that company's open Asana workstreams, with a "New" option that creates the workstream in Asana.
- **Next steps**: edit, or create a follow-up.
- **People**: checked against Network and Prospecting. Add to contacts, Edit, or Skip.
- **Actions**: **Confirm** (register as activity with these tags), **Skip** (not an activity, for example noise or a duplicate), and Reopen from History.

News items get a lighter version: you confirm the PortCo tag, and they are saved as PortCo knowledge, not as activity.

## Filtering
- Pending by default; a **Show history** toggle shows confirmed and skipped items.
- Filter by track, PortCo, alias and date range, plus a text search.
- Scoped to the selected Action owner (the person who sent or forwarded the email to the alias). "All action owners" shows everything.

## Existing data
The 65 activities already harvested are treated as Pending so you can review them once. Asana-archived activities (506) stay registered as they are.

## Technical details
- New review-state tab "Activity Reviews" (activityId, status pending/confirmed/skipped, track, portco, workstreamGid, reviewer, reviewedAt), written append-only. This mirrors the notes review store. Harvested Activities rows stay untouched, so re-running the harvest is safe.
- `src/utils/activity-inbox.server.ts` (list, review, reopen) and server functions, reusing helpers from notes-inbox (workstream picker, people matching, follow-ups, Asana create).
- Registered-activity readers (dashboard charts, PortCo timeline, workstream activity) only include confirmed items, plus the Asana archive.
- `ActivityReview.tsx`, sharing card subcomponents pulled out of `NotesImports.tsx`.
- Tests: pending items are excluded from registered activity; confirm applies the edited track and PortCo; skip hides the item; reopen restores it.

## Open questions (answer when approving, or I will use the defaults)
1. Should items the AI tags with high confidence be auto-confirmed? Default: no, review everything.
2. Should the 65 existing activities be pending for review? Default: yes.

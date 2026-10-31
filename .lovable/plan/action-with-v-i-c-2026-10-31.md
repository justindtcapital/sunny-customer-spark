# Action with V.I.C.

Rename "Action Now" to **"Action with V.I.C."** everywhere in My Actions (workstream rows, follow-ups, notes/activity items) and redesign the side panel around one V.I.C. request box.

## New panel layout

```text
Action with V.I.C.                     Based on: <item title>
+--------------------------------------------------------------+
| Ask V.I.C. to write an email, log an action, etc.            |
| [ "Email the CEO of Aka and the three people from Exxon..." ]|
| [Mic Dictate]                                  [Ask V.I.C.]  |
+--------------------------------------------------------------+
V.I.C. found these people - confirm:
  "CEO of Aka"        (o) Jane Doe, CEO, Aka        [ ] other match
  "3 people at Exxon" [x] A   [x] B   [x] C   [ ] D
  [Confirm recipients]
To: chips (+ search Network & Prospecting / add email / new contact)
PortCos: [Aka x] [Exxon-linked PortCo x]   [+ Add more]
Activity tracking: BD | GTM
--- Email result ---                --- or Log result ---
Subject / Email body                 Title / What happened
Nudge box  Regenerate  Append PortCo list  Clear
Set a further follow-up (optional)
Cancel        Send via Outlook & complete  |  Log & complete
```

- The "What do you want to do?" Email / Log choice is removed. V.I.C. decides from what you type or say ("write an email…" vs "log that I called…"); a small switch lets you flip it if it guessed wrong.
- Dictation fills the request box (you can edit before asking); nothing sends automatically.
- **People lookup:** V.I.C. reads descriptions like "the CEO of Aka" or "the three people from Exxon", searches Network and Prospecting by company and role, and shows the candidates for you to tick. Single clear matches are pre-ticked; ambiguous ones (e.g. two possible CEOs, 4 people at Exxon when you said 3) wait for your choice. Nobody is added without confirmation; people with no email on file are flagged.
- **PortCos:** only show the ones already tagged on the action plus any V.I.C. detects in your request, with an "Add more" searchable picker over the full PortCo list (instead of 60 chips).
- Kept as-is: Regenerate + nudge (shorter, more formal…), Append PortCo list, set follow-up, Send via Outlook & complete, Log & complete.
- Follow-up asks ("make it shorter") can also be typed in the V.I.C. box after a draft exists and will revise the draft.

## Action with V.I.C. on contact and PortCo pages
- Add an "Action with V.I.C." button to each individual contact's detail view (Network, Prospecting and Partners contacts) and each PortCo's detail view.
- From a contact: the panel opens with that person already in "To" and their company/linked PortCos pre-tagged, so you can just say "send a catch-up email" or "log that we had coffee".
- From a PortCo: the panel opens with that PortCo tagged and its known contacts offered as suggestions (e.g. "email their CEO" resolves within that company first).
- Completing from these pages logs the email/activity against the contact or PortCo without needing an existing next step.

## Rules preserved
- V.I.C. only drafts and proposes; sending/logging still happens only when you click the final button, through the existing completion and logging steps.
- Ratings and contact records are never edited; "Add new contact" stays manual.

## Technical details
- New server function `interpretActionRequestFn` (authenticated, Lovable AI Gateway, structured tool output): input = source context + request text; output = `{ mode: "email"|"log", personQueries: [{ phrase, company?, role?, count? }], portcos: string[], subject, body | logNote }`.
- Server resolves each person query against the unified Contacts view (company match via existing company/domain helpers, role text match), returning candidates with role/company; pure resolver in `src/lib/action-people.ts` with tests (exact count, ambiguous role, unknown company → review).
- PortCo detection matches request text against canonical PortCo options (shared review-tagging helpers, non-fuzzy).
- Draft generation reuses `draftFollowUpFn` with the request as the nudge; log mode pre-fills title/notes.
- `ActionComposer.tsx` restructured; button labels updated in `my-actions.tsx` and `NotesImports.tsx`; route description text updated.
- Add `sourceKind: "contact" | "portco"` to the action context; `completeActionFn` skips marking a source item done for these and only records the email/activity. Buttons added in `ContactDetail.tsx` and the PortCo detail on `portfolio.tsx`, sharing one mounted `ActionComposer`.

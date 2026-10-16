# My Actions — personal inbox for workstreams, notes and activity

## What changes

**Menu:** Home, Network, Prospecting, **My Actions**, Events, PortCo, Campaigns, Dashboard, Activity.

**Dashboard:** the Workstreams and Notes & Activity summary boxes (big numbers, chips, PortCo logos) stay at the bottom. Their **Manage** buttons now open My Actions on the matching tab instead of expanding in place. The homepage Notes & Activity / Workstreams Open buttons go to My Actions too.

## My Actions page layout

```text
+--------------------------------------------------------------+
| My Actions        [Chris Falloon v]   Inbox 42 | Done this wk |
+--------------------------------------------------------------+
| [Workstreams 18] [Notes & Activity 24] [Follow-ups 6] [Done]  |
+-----------------------------+--------------------------------+
| Inbox list (sorted by due / | Selected item detail           |
| priority, filters: PortCo,  |  - Workstreams: status,        |
| track BD/GTM, status)       |    priority, due, owner edit   |
|                             |  - Notes: current review card  |
|  item  [Action Now]         |    (roster, File to, Activity  |
|  item  [Action Now]         |    tracking, next steps)       |
+-----------------------------+--------------------------------+
```

- Shows only the signed-in person by default (via the existing teammate identity), with an owner picker for viewing a teammate's inbox.
- **Workstreams tab:** my open GTM/BD workstreams with inline status, priority, due date and owner edits (same Asana-safe edit logic as today).
- **Notes & Activity tab:** the same Notes Imports and Activity Review cards as the Dashboard today; Confirm / Skip / Reopen work the same way.
- **Follow-ups tab:** next steps marked "Assigned to me" plus reminders, ordered by due date.
- **Done tab:** items completed via Action Now or confirmed in the last 30 days.

## Action Now

Every inbox item gets an **Action Now** button that opens a side pane:

1. **Prefilled context:** PortCos, recipients (from the meeting roster / workstream contacts), the source note or workstream summary, and the next step.
2. **Pre-written follow-up:** when the pane opens, a draft is already written for you. It builds on whatever created the action: the triggering email thread (what they said, what was asked), the meeting notes and their next steps, or the workstream's latest updates. It also uses recent history with those contacts. The tone is warm, simple and specific: thank them, recap the key points, confirm the next steps with owners and dates, and close with one clear ask. A small "Based on: <source>" line shows what it read. You can edit it freely, use **Regenerate** with a quick nudge (shorter, more formal, add a PortCo intro), or clear it and write your own.
3. **Email builder:** the same one used in Campaigns, with the PortCo blurb and company-site links.
4. **Tags:** PortCo multi-select, BD/GTM, contacts (searchable).
5. **Send:** opens an Outlook compose window with to/cc/subject/body filled in. At the same moment Venture Pulse:
   - records an Interaction Trail entry for each tagged contact (linked to the source note or workstream),
   - counts it as a BD/GTM activity for the tagged PortCos,
   - marks the follow-up complete (or confirms the note if it was still waiting for review),
   - moves the item to Done.
6. **Undo / Reopen** from the Done tab if the email was never actually sent.

Note: Outlook doesn't report back whether the email was sent. Venture Pulse treats clicking Send as done, and Undo is there to fix mistakes.

## Build order

1. Add the My Actions page, menu item, and point the Manage/Open buttons to it.
2. Move the Workstreams and Notes & Activity managers into its tabs (shared with the Dashboard, no duplicate copies).
3. Add the Follow-ups and Done tabs.
4. Add the Action Now side pane, reusing the Campaigns email builder.
5. Completion logging (interactions, activity, follow-up close, provenance) plus tests for "Action Now marks the follow-up complete and logs one interaction per contact."

## Technical details

- New route `src/routes/my-actions.tsx` with validated `tab` and `owner` search params. The Dashboard `section` deep link becomes a redirect to `/my-actions?tab=...`.
- Pull the expanded manager bodies out of `dashboard.tsx` / `NotesImports.tsx` into reusable components that both pages mount.
- Pull the Campaigns composer and `EmailDraftDialog`'s Outlook deeplink and `draftEmail` into a shared `ActionComposer`.
- New server fn `completeAction`: appends Interactions rows (Source Ref `kb:<id>` or `ws:<gid>`, deduped), writes a Harvested Activities row stamped with the actor, closes reminder completion, and writes an Ops Log entry. The original `importedBy` author stays unchanged.
- Workstream edits keep the existing changed-fields-only Asana writes with the conflict check.

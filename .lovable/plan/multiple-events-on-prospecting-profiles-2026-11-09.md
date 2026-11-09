# Multiple events on Prospecting profiles

## What you'll get
- A Prospecting profile gets the same **Events** section as a Network profile, with **Attended** and **Invited** columns, an **Add Events** button and a remove (x) on each event.
- Adding an event keeps every event already linked. Adding the same event twice does nothing.
- Removing an event only unlinks it from that person. The event stays in the Event Planner, and the change stays saved after a refresh.
- Each prospect's current single "Event" tag shows up as one of their linked events, and it is kept as-is in Provenance.
- **Tag to Event** for selected prospects adds the event to each person instead of overwriting their current one.
- The Prospecting **Event** filter finds a person by any of their linked events, not only the first one.
- Network profiles work exactly as they do now.

## Approach
1. **One place for links.** Prospect events are saved where Network events already live: the CRM "Events" tab, one row per person and event, matched by the person's ID first and then by email. Because prospects are now flags on the shared Contacts list, a person who later moves to Network keeps their events.
2. **Prospects without email.** Some prospects only have a LinkedIn URL or a name and company. The current save step skips anyone without an email. It will accept the person's ID instead, but only for prospect saves.
3. **Reading links.** Prospect records will collect their link rows the same way Network does (by ID, then email). The legacy Event tag counts as an **Invited** link, and duplicates are merged by event name, ignoring capitalization.
4. **Removing links.** Removal stamps a "Removed At" date on the link row instead of deleting it, the same append-only pattern used for event history links. For the legacy Event tag, removal is recorded without clearing the tag, so where the person came from is still visible.
5. **Picker.** The same event picker as Network, listing the Event Planner's events with search.
6. **Bulk Tag to Event** adds one link per selected person, skips people who already have that event, and fills the old Event tag only when it's blank.

## Affected areas
- Prospecting profile panel on the Prospecting page: new Events section and Add Event dialog, Event filter, Tag to Event.
- Shared server save step for event links: ID-only keys for prospects, duplicate check by ID or email, new unlink action.
- Prospect record loading: collect linked events.
- A shared helper that merges links, removes duplicates and handles removals, with unit tests: no duplicates, add keeps existing links, remove hides only that link, the legacy tag is kept.

## Risks and how they're handled
- **Duplicates:** before saving, the app re-reads the Events tab fresh and skips existing pairs, matched by ID or email, ignoring capitalization.
- **Data loss:** nothing is deleted, and the legacy Event tag is never overwritten.
- **Network side effects:** the Network screen is not changed. Network reads ignore "Removed At" stamps, so nothing changes there until Network starts using the unlink action.
- **Sheets limits:** each add or remove is one small write. Bulk tagging is one batched write.

## Something I found (not changing without your OK)
On Network profiles, the x on an event hides it on screen but **doesn't save**, so the event comes back after a refresh. Prospecting will save removals properly. I can switch Network to the same saved removal as a follow-up, or leave it for now because the request says to leave Network unchanged.

## Technical details
- `src/routes/targeting.tsx`: Events section mirroring `ContactDetail.tsx` lines 1561-1635; reuse `EventPicker`; rework `tagSelectedToEvent`; Event filter uses `t.events`.
- `src/lib/types.ts`: add `eventsAttended` / `eventsInvited` to `TargetLead`, keeping `event`.
- `src/lib/prospect-events.ts` + test: pure merge, dedupe and removal helpers.
- `src/utils/sheets.server.ts`: `buildTargets` gathers Events-tab rows by URID/email; `ensureEventAttendanceBatch` allows URID-only items (opt-in flag) with URID|event dedupe; new `unlinkEventAttendance` stamps a `Removed At` column (`ensureColumn`), with the legacy Event cell's removal recorded as a stamped row.
- `src/utils/sheets.functions.ts`: `addEvent` passes the URID-only option; new `removeEventLink` server function.
- Add a root AGENTS.md rule: prospect events use the shared Events tab with append-only removal stamps.

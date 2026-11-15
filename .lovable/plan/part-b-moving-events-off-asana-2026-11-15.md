# Part B: Moving events off Asana

## Where things stand
The Event Planner already keeps its events in the shared Event Tracker spreadsheet. Asana is still used in a few places:
- An optional "Show Asana data" layer and a "Merge Asana data" button in the Event Planner.
- The homepage event counts, the event list on each PortCo page, and the event exposure sync. These still read events from Asana.
- V.I.C.'s "find events" question, which searches Asana, plus V.I.C.'s general Asana lookup.
- The event picker used in uploads and tagging. This will be confirmed during the scan.

## Steps

1. **Read-only comparison (nothing changes yet).** Pull all 85 Asana events and compare them field by field with the Event Tracker. You get a short report with:
   - Asana events not in the Tracker, or matched only by date or a similar name.
   - Fields filled in Asana but empty in the Tracker: lead, PortCos, role, format, attendee count, type, location, notes.
   - Disagreements between the two. The Tracker wins unless you say otherwise.
   - Asana fields with no home in the Tracker. You choose to keep or drop each one, like you did for PortCos.

2. **Your sign-off.** You confirm the matches, which missing events to add, and which fields to keep. Any field you don't keep is saved in an "Archived Fields" column, so nothing is lost.

3. **One-time import, run by me as admin.**
   - Back up the Tracker tabs to a dated tab first.
   - Add the approved missing events.
   - Fill in empty fields only. Tracker values and DTC Status are never overwritten.
   - Keep each event's Asana ID in Source Ref, so older links to contacts and history still resolve.
   - Save a read-only "Asana Events Archive" tab with every Asana event as it was.

4. **Switch every remaining reader to the Tracker.** This covers homepage counts, PortCo page events, the exposure sync, V.I.C.'s event search, and the event picker. They all read from the Tracker, and nothing ever writes to Asana.

5. **Remove the Asana controls.** Take out "Show Asana data" and "Merge Asana data" from the Event Planner.

6. **Final cut-off, combined with Part A after the parallel check.**
   - Remove the remaining Asana read code.
   - Remove V.I.C.'s Asana access.
   - Tell you which Asana settings can be deleted. After that, Asana can be turned off.

## Technical details
- Reuse the pure matcher `planAsanaEnrichment` (`src/lib/event-planner.ts`) and the event-cleanup plan for matching and merging. The comparison runs as a read-only admin script.
- Replace `fetchAllAsanaEvents` and `fetchPortfolioEvents` callers with Tracker-backed equivalents that return the same shapes. The callers are `home.functions`, `asana.functions`, `portco-sync.functions`, `event-exposure.functions`, `llm.server` `query_events`, and `event-planner.functions`. Each switch is a small edit.
- Exposure sync dedupe keys stay the same, so re-running it creates no duplicates.
- Add tests for the Tracker-backed PortCo-events mapping and for the "fill empty only, never overwrite status" rule.
- Update AGENTS.md (the Asana overlay rule), the memory notes and roadmap.md.

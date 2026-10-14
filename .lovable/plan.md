# Fix missing event tags on Prospecting

## What we found
- The Prospecting sheet has 1,279 people and an **Event** column, but **every row is blank**. No one is tagged to an event today.
- The event list in the Prospecting filter comes from the Events catalog, so it shows every event even when nobody is tagged. That is why the list looks full but each event returns no people.
- Past uploads did get **Campaign** labels: Innovation Leader Outreach (339), CX Leaders (204), Vation Virtual Events (41), GBI Impact Events (19). These are the lists you meant to tie to events.
- The upload screen does have an Event picker now, and the code saves it. But nothing has ever been saved through it. Most likely it was added after those lists went in, or it was left blank. I'll confirm this with a test upload.

## What we'll do
1. **Confirm new uploads work.** Upload a 1-row test list with an event picked. Check that the Event column fills in and the person shows up under that event filter. Then delete the test row.
2. **Tag past lists in bulk.** Add a "Tag to event" action on Prospecting. You pick a campaign (or people you've selected) and an event, and the Event column fills in for those people. Nothing else on their records changes. Each run is recorded in the Ops Log.
3. **Show counts in the filter.** Show how many people are tagged next to each event, like "Briefing - KKR (0)", and put events with people at the top. Empty events will be easy to spot.
4. **Warn at upload.** When the Source is Event or the campaign name looks like an event, and no event is picked, show a small warning before importing.

## Your input needed
Tell me which event each campaign belongs to (for example, CX Leaders goes with which event?), or tag them yourself with the new bulk action.

## Technical details
- New server function `tagTargetsToEvent({ urids | campaign, event })`. It writes only the Event cell for each row, matched by header and URID, in one batched write.
- Filter counts: `targetEventCounts` already exists in `targeting.tsx`. It only needs to be shown in the label.
- Test upload goes through the existing `importTargets`, and the test row is removed afterward with `deleteSheetRows`.

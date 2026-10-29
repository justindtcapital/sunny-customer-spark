# Fix: 2027 CSV events missing from the calendar

## What I found (likely causes, to confirm first)
The upload reads dates in the browser before saving. Several common date styles lose the year:
- Dates without a year (e.g. "1/15", "15-Jan") are assumed to be the current year (2026).
- "15-Jan-2027" style dates match the "day-month" pattern first and ignore the 2027, so they land in 2026.
- Rows whose date can't be read are still saved with no date, so they never appear on any calendar day, yet still count as "Imported".
- The success message counts everything sent, with no list of rejected rows.

Not yet confirmed: which of these hit Julia's file. Step 1 is to look at her saved CSV rows in the Event Tracker (source = her file name) and see which dates came out blank or as 2026.

## Changes
1. **Date reading** — one shared date reader that keeps an explicit year in every format (1/15/2027, 2027-01-15, 15-Jan-2027, Jan 15 2027, ranges like 1/15-1/17/2027). Optional "Year" column mapping and a "Default year" picker in the upload dialog (defaults to the year most dates in the file use) for year-less dates.
2. **Preview before import** — each row shows its parsed start/end date; rows with no readable date or end before start are flagged with the reason and not saved.
3. **Honest results** — after saving, show Imported / Exact duplicates / Need review / Rejected counts, with a downloadable list of rejected rows and reasons. Only rows the server confirms saved count as imported. The operation appears in the Admin activity log.
4. **Server guard** — the server also rejects events without a valid date instead of saving them blank.
5. **Calendar jump** — after import, the calendar moves to the first imported event's date (e.g. Jan 2027) so new events are visible immediately; confirm year navigation and status filters (new rows default to "Potential", which must be in the selected statuses) don't hide them — show a hint if filters hide imported events.
6. **Repair Julia's upload** — after a backup, fix the dates of her already-saved rows from the original file (or delete and re-import them if she prefers), with no duplicates.

## Tests
- Date reader: each format above resolves to the correct 2027 date; year-less dates use the chosen default year; unreadable dates are rejected.
- Import of a mixed 2027 CSV: valid rows saved with correct dates, invalid rows rejected with reasons, counts match.
- Browser check: import a 2027 test CSV, see events on their 2027 dates, then remove the test rows.

## Risks
- Year-less dates are guesses; the default-year picker makes it explicit.
- Repairing existing rows touches the shared tracker — done only after backup and your OK.

## Technical details
- `src/lib/event-planner.ts`: new `parseEventDate(raw, defaultYear)`; fix `parseTrackerDate` day-month-year case.
- `src/components/events/EventPlanner.tsx` (`CsvImportDialog`, `toIsoDate`): preview column, year controls, result summary, navigate view to first imported date.
- `src/utils/event-planner.server.ts` / `.functions.ts`: validate dates, return `rejected[]` with reasons in the journaled outcome.
- Tests in `scripts/event-planner.test.ts`.

# Event Planner: one-column layout, new categories, inline editing

## 1. Collapse the two left columns
- Remove the separate Filters column on the left of the planner.
- The category checkboxes (coloured squares) move into the planner's own row-label column: each row (DTC-led, Partner-led, Briefings) lists its categories with the same coloured squares, now clickable to show/hide them.
- Search moves into the toolbar above the calendar.
- DTC Status, Sector, PortCo, Partner, Owner and Source move into the Venture Pulse left menu, in a clearly labelled "Event filters" section placed under Admin, only while you're on Events. Same colours and dots as today. If the menu is collapsed, they show in a compact bar above the calendar instead.
- PortCo becomes multi-select.

## 2. Category changes
**DTC-led events** — one category, "DTC Event" (one colour). Both old "No partnership" and "With partner" events become "DTC Event".

**Partner-led events** (renamed from DTC Partnered) — GBI Roundtable, CDO Events, ISSA, Other. "3rd Party Events" is removed; those events become "Other".

**Briefings** — DTC Curated Briefings, Vation Briefs, Other. "Virtual Pitches (Sagetap)" is removed; those events become "Other" in Briefings.

**Add partner (+)** on Partner-led and Briefings rows: pick from the Partners list. The partner becomes its own category in that row with a new colour, available in filters and in the event's category dropdown. Can be removed later (its events fall back to "Other").

## 3. DTC Status
- "Executed" is renamed "Completed" and "Accepted" is renamed "Confirmed" everywhere; existing tracker rows are updated.
- Final list: Completed, Confirmed, Considering, Potential, Declined.

## 4. Potential vs. planning rows
- The grey bottom row is renamed **Potential**.
- Events with status Potential always sit in the Potential row, whatever category they have.
- Changing an event to Considering (or later: Confirmed/Completed) moves it up into its category row (DTC-led, Partner-led or Briefings). If it has no category yet, you're asked to pick one when changing status.

## 5. Edit directly in the side panel
- Clicking an event opens the side panel with every field editable in place, in smaller text: name, dates, location, category dropdown, DTC status, sector, PortCos (multi), partners, owner, notes, links, etc.
- Each change saves on leaving the field (with a small "Saved" tick); the separate edit pop-up is no longer used from the panel. "Add event" keeps the pop-up for new events.
- Attendees and Campaigns sections stay below the fields.

## One-time data update
A backed-up, one-time update of the Events DB tab: Executed → Completed; Accepted → Confirmed; the two DTC subcategories → DTC Event; 3rd Party Events → Other (Partner-led); Sagetap → Other (Briefings). Shows counts before applying.

## Technical details
- `src/lib/event-planner.ts`: new `PLANNER_CATEGORIES`, `DTC_STATUSES` with "Completed"/"Confirmed" (reading still accepts "Executed"/"Accepted" as aliases), legacy subcategory alias map, `placementRow(event)` (Potential status → Potential row) + tests.
- Custom partner categories stored in a new "Planner Partners" tab of the Event Tracker spreadsheet (row, partner URID/name, colour, removed at) — keeps event data in one place; colour assigned from an unused palette slot.
- Left-menu filters rendered via a new portal slot in `app-sidebar.tsx` placed under Admin (similar to the existing page-actions slot); filter state lifted into a small shared store so menu and planner stay in sync.
- Side panel inline fields call the existing update-event server function with only the changed field (re-read, conflict-check), canonicalizing PortCos as today.
- Migration via existing backed-up Sheets batch pattern (like event cleanup).
- Update `src/components/events/AGENTS.md` and memory `mem://design/event-planner`.

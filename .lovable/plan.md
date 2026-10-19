# Event Planner

Turn the Events page from a read-only Asana view into a full event planner backed by your own event tracker sheet (link provided). Asana keeps syncing new events into the sheet until you switch it off.

## What you'll see

**Planner view (default)** — matches your picture:
- Rows grouped by category down the left: DTC Led (Customer Advisory Council, DTC Event no partner, DTC Event with partner), DTC Partnered (3rd Party, GBI Roundtable, Other), Briefings (DTC Curated, Vation Briefs, Virtual Pitches/Sagetap). Categories are editable.
- Columns across the timeline. **Month** view: small tiles (name, Network count, PortCo count). **Week** view: bigger tiles adding date, city, format, owner, sector chips.
- Tiles color-coded by sector (Cyber, Data/AI, Supply Chain) as in the picture; outline style shows status.
- Right-hand summary per row group: Events, Network, PortCo, Cyber, Data/AI, Supply Chain counts.
- Year selector with previous/next, so planning spans multiple years.

**Confirmed vs Potential**
- Toggle at top: Confirmed, Potential, or Both.
- Confirmed = solid tiles. Potential (under consideration, imported, from a link) = dashed, lighter tiles with a "Potential" chip. One click promotes a Potential event to Confirmed.
- Potential view sorts inbound events a few months ahead for the events team.

**Calendar view** — the existing calendar with counts stays as a second tab.

**Filter panel on the left** — search plus sector/industry, category, status, PortCo, Partner, owner, city, format, source (Asana / sheet / CSV / link). Existing tags kept.

**Detail pane on the right** (like PortCo pages) when a tile is clicked:
- Name, dates, location, format, category, status, owner, source (Asana / CSV / link / manual).
- Links: Luma page, event website, Asana task.
- Attendees (Network + Prospects, existing tags), PortCos, Partners, linked campaigns.
- Prior years: same-named event in earlier years with their counts.
- Edit button for full editing.

**Add / import**
- **Add event** form with every field.
- **Import CSV**: drop a file, match its columns to event fields (auto-guessed, editable), preview, then add as Potential or Confirmed. Duplicates (same name + date) flagged, not overwritten.
- **Add from link**: paste a Luma or event website URL; Venture Pulse reads the page and fills name, dates, city, description, link for you to review before saving.

## Cross-references
Events link by name to PortCos, Partners, Network/Prospecting people and campaigns, using the same matching already in place. Existing contact and campaign records are never edited.

## Technical details
- First step: read the tracker sheet's tabs and headers and map them; add missing columns (URID, Status Confirmed/Potential, Category, Source, Source URL, Luma URL, Year, PortCos, Partners, Network count, PortCo count, Sectors) without deleting data.
- New `event-planner.server.ts` / `.functions.ts` reading/writing that sheet (service account, batch reads, cached); Asana sync upserts by Asana gid into the sheet, never overwriting fields edited in Venture Pulse.
- Writes use `withDeadline` steps; edits write only changed cells after a re-read conflict check.
- Link import uses Firecrawl (connect card) plus AI extraction; falls back to plain page fetch.
- Pure helpers (`event-planner.ts`) for timeline bucketing, week/month layout, category grouping, prior-year matching, CSV mapping — with tests.
- `/events` route: tabs Planner | Calendar; existing components reused.

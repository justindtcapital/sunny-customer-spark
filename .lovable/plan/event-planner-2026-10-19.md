# Event Planner

Turn the Events page from a read-only Asana view into a full event planner backed by your own event tracker sheet (link provided). Asana keeps syncing new events into the sheet until you switch it off.

## What you'll see

**Planner view (default)** — matches your picture:
- Rows grouped by category down the left (DTC Led, DTC Partnered, Briefings), with subcategories beneath (Customer Advisory Council, DTC Event no partner, DTC Event with partner, 3rd Party, GBI Roundtable, Other, DTC Curated, Vation Briefs, Virtual Pitches/Sagetap). Categories and subcategories are editable.
- **Tile color = subcategory**, matching the left-hand labels.
- **Sector (Cyber, Data/AI, Supply Chain, etc.) = small colored dot** on each tile.
- Three zoom levels: **Week** (largest tiles: name, date, city, format, owner, Network/PortCo counts), **Month** (smaller tiles: name, Network/PortCo counts), **Year** (compact tiles across 12 months, like your picture).
- **Previous / Next** steps by the current zoom: a week, a month, or a year. A Today button jumps back. Planning spans multiple years.
- **Right-hand summary per category row** totals what is on screen: events, Network attendees, PortCos, and per-sector counts. Week view shows the week's totals, Month the month's, Year the year's — so it doubles as a dashboard.

**Confirmed vs Potential**
- Toggle at top: Confirmed, Potential, or Both.
- Confirmed = solid tiles. Potential (under consideration, imported, from a link) = dashed, lighter tiles with a "Potential" chip. One click promotes Potential to Confirmed.

**Calendar view** — the existing calendar with counts stays as a second tab.

**Filter panel on the left** — search plus sector, category/subcategory, status, PortCo, Partner, owner, city, format, source. Existing tags kept.

**Detail pane on the right** (like PortCo pages) when a tile is clicked:
- Name, dates, location, format, category, status, owner, source (Asana / CSV / link / manual).
- Links: Luma page, event website, Asana task.
- Attendees and invites (Network + Prospects), PortCos, Partners, linked campaigns.
- Prior years: same event in earlier years with their counts.
- Edit button for full editing.

**Add / import**
- **Add event** form with every field.
- **Import CSV**: drop a file, match its columns to event fields (auto-guessed, editable), preview, then add as Potential or Confirmed. Duplicates flagged, not overwritten.
- **Add from link**: paste a Luma or event website URL; Venture Pulse reads the page and fills the details for you to review before saving.

## Where attendees live (recommendation)
- **People stay in the CRM** (Network / Prospecting) — one record per person, as today.
- **The event database holds the invite/attendance list**: one row per (event, person) in an "Event Attendees" tab — person reference, invited / registered / attended, date. Same append-only pattern as Campaign Members.
- Why: one person can attend many events across years without duplicating contacts; the event's counts and the person's event history both read from the same list. Existing event tags on contacts are copied into this list once, untouched in the CRM.

## Technical details
- First step: read the tracker sheet's tabs and headers and map them; add missing columns (URID, Status, Category, Subcategory, Source, Source URL, Luma URL, Sectors, PortCos, Partners) without deleting data; add "Event Attendees" and "Event Categories" tabs.
- New `event-planner.server.ts` / `.functions.ts` reading/writing that sheet (batch reads, cached); Asana sync upserts by Asana gid, never overwriting fields edited in Venture Pulse.
- Writes use `withDeadline` steps; edits write only changed cells after a re-read conflict check.
- Link import uses Firecrawl (connect card) plus AI extraction; falls back to plain page fetch.
- Pure helpers (`event-planner.ts`) for week/month/year windows, prev/next stepping, per-window row totals, prior-year matching, CSV mapping — with tests.
- `/events` route: tabs Planner | Calendar; existing components reused.

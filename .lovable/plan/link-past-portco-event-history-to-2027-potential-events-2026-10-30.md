# Link past PortCo event history to 2027 potential events

## What Julia will see
- Event Planner gets a **"Link past history"** button (2027 view). It scans past events (Event Planner, 2025–2026) and confirmed event activities from Activity Review, and proposes links to existing **2027 Potential** events.
- A review dialog with three groups:
  - **Clear matches** — preselected; one click to link.
  - **Needs review** — several possible 2027 events, or the name matches but PortCos differ; pick one or skip.
  - **Unmatched** — shown for information; nothing happens.
- On a 2027 event's detail panel, a new **"Past history"** section lists linked prior years: event name/date, DTC status, PortCos that took part, attendee count, and linked activity entries, each clickable back to its source.
- No new events are ever created, and no original event, attendee or activity record is changed.

## How matching works
- **Event identity:** normalized name (year, "20xx", edition numbers, punctuation stripped), plus names from earlier merges ("Merged event:" in Source Ref), same category, and the website/Luma domain when both have one.
- **PortCo association:** PortCos tagged on the past event or its activities. They add confidence; they never create a match by themselves.
- **Clear match** = exactly one 2027 Potential event with the same identity and no conflicting PortCo or category. Anything else goes to **Needs review**.
- Activities from Activity Review count only when they have been confirmed and either name the event or sit inside a past event's dates with a shared PortCo. Unconfirmed imports are skipped.

## Storage (no changes to existing rows)
- New append-only tab **"Event History Links"** in the shared Event Tracker spreadsheet: one row per (2027 event URID, source kind, source ID), with match reason, PortCos, linked by, and date.
- Each source reference is kept (past event URID, or activity record ID).
- Running again skips pairs that are already linked, so there are no duplicates. Unlinking removes only the link row.
- Merged or deleted events stay valid: lookups follow merged URIDs recorded in Source Ref.

## Affected areas
- New pure helper `src/lib/event-history.ts` (normalize, score, classify) + unit tests: clear vs ambiguous, PortCo conflicts, merged names, and running twice adds nothing.
- `src/utils/event-planner.server.ts` / `.functions.ts`: read-only "preview links" function; "save links" function that is team-authenticated, re-reads existing links before appending and writes only the new tab.
- Read of confirmed activities through the existing Activity Review / Harvest State readers (read only).
- `EventPlanner` UI: the button, the review dialog, and the "Past history" section in the detail panel.
- Admin activity log entry for each save (who linked how many).

## Risks and mitigations
- **False links from generic names** ("Summit", "Dinner"): too-generic names never count as clear matches and always go to review.
- **Sheets quota:** one batched read per tab, one append per save, inside a deadline; no per-row calls.
- **Concurrent runs:** re-read links and remove duplicates right before appending.
- **Large history:** matching happens in memory; the dialog pages the results.
- **Not covered:** no links to Asana-only overlay events; 2027 events that are not marked Potential are excluded. This can be widened later if wanted.

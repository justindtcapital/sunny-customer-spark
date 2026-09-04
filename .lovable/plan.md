# Dashboard: workstreams + expandable activity, company-only sections

## Confirmed about workstreams

Major workstreams already come only from Asana subtasks under each portfolio-company task, and the displayed name is the part of the subtask name after the GTM or BD marker (e.g. "MavenAGI -> GTM -> Pitch Evolution" shows as "Pitch Evolution"). No change needed there.

## Changes

1. Show only for a single company
   - "Major workstreams" and "Activity tracking" appear only when one portfolio company is selected in the chart. With no selection, or with just an investor or domain filter, both sections are hidden.

2. Expandable activity rows
   - Each activity in the go-to-market and business development boxes becomes clickable.
   - Clicking expands it in place to show the extra detail Asana holds for that item: the note/description body (email text when it was logged from email), plus owner, type, status, date, person and company, and the Asana link.
   - Rows with no extra detail show a short "no additional detail" line instead of expanding to an empty box.

## Technical notes

- `src/routes/dashboard.tsx`: gate both `<WorkstreamSummary>` and `<ActivityFeed>` behind `scopeKind === "company"`; drop the now-unused `allScope`/`showCompany` variations accordingly.
- `src/components/dashboard/ActivityFeed.tsx`: make `Row` a controlled expandable (local `useState`), rendering `a.notes` (already on `AsanaActivity`) plus the metadata fields when open; keep the external-link icon.
- No server/API changes: `notes` is already returned by the activity fetch.

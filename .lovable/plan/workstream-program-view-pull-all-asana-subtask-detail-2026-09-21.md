# Workstream program view: pull all Asana subtask detail

## Goal

When a single portfolio company is selected, the workstream boxes at the bottom of the dashboard become a status/program view showing everything Asana holds on each BD or GTM subtask — not just name, owner and status.

## Changes

1. Keep every subtask field
   - The Asana read already returns all custom fields on each subtask, but most are discarded. Keep the full set on each workstream record so newly added Asana fields appear automatically without a code change.

2. Named fields for reporting
   - BD workstreams surface: status, momentum, channel, targets, stakeholders, next steps, traction.
   - GTM workstreams surface: SageTap status, last pitch reviewed, GTM maturity, sales maturity, strategy workstream status, GTM category, next steps.
   - Anything else Asana returns on the subtask is listed in an "Other fields" group so the reporting grows as you add fields.

3. Expandable workstream rows
   - Each workstream row in the dashboard boxes becomes clickable and expands in place into a labelled field grid (BD or GTM set, then other fields), plus the description/notes body, owner, last activity and a link to the subtask in Asana.
   - Blank fields show "Not set" rather than being hidden, so the program view reads as a checklist of what still needs filling in.

4. Compact summary line
   - Collapsed rows show the two or three most telling values for their type (BD: status, momentum, targets; GTM: SageTap status, GTM/sales maturity) so the boxes stay scannable.

5. Owner marker
   - Each workstream row carries a small owner badge in its corner: the owner's initials in a circle, with the full name on hover. Unassigned workstreams show a neutral person icon.

## Technical notes

- `src/lib/workstream-parse.ts`: extend `Workstream` with `fields: Record<string, string>` plus `momentum`, `channel`, `targets`, `sageTapStatus`, `lastPitchReviewed`, `gtmMaturity`, `salesMaturity`.
- `src/utils/asana.server.ts` (`fetchPortcoWorkstreams`): store the whole `fields` map and add the new `pickField` regex matches; `SUBTASK_FIELDS` already requests all custom fields, no API change needed.
- `src/components/portfolio/WorkstreamsPanel.tsx`: `WorkstreamRow` gains local expanded state and a detail grid; keeps current collapsed layout so the portfolio-company panel stays consistent with the dashboard.
- Segment-specific field ordering lives in a small pure map in `workstream-parse.ts` so it is easy to extend; unknown keys fall through to "Other fields".
- No schema or Sheets changes; no writes back to Asana.

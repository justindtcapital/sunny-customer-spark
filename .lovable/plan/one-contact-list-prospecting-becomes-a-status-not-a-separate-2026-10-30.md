# One contact list: Prospecting becomes a status, not a separate list

## Goal
Every person lives in one row in Contacts. Moving someone between Prospecting, Cold, Warm, Hot and Council only changes their status cell — nothing is copied or deleted. Bulk moves of 142 people become one save instead of ~850.

## What the data looks like today
- Contacts (Network): 1,847 people — Warm 1,047, Cold 565, Hot 129, Council 65, blank 41.
- Targets (Prospecting): 1,391 people.
- 67 prospects share an email with a Network contact (same person in both lists).
- 298 prospects have no email; all have an ID.
- 95 prospect rows have an industry name in the Stage column ("information technology & services") — likely a shifted import; they need a look.
- Stage values: Prospecting 916, blank 284, Outreach Sent 95, Ready to Promote 1.

## Steps

### 1. Unblock and back up (no data changes)
- Release the stale lock on Julia's interrupted batch (33 moved; Sharon Steele, Jawad Hyder, Andrey Malashenko verified still in Network, untouched) and mark it reconciled.
- Pause bulk relationship changes with a clear "upgrading — back shortly" message until step 4 is live.
- Full copy of Contacts and Targets into dated backup tabs in the same spreadsheet.

### 2. Prepare Contacts (add columns only)
Add to Contacts, never removing or reordering: First Name, Last Name, Prospecting Stage, Research Purpose, Reason Surfaced, Last Contacted, Follow Up Due, Network Profile, Origin (Network / Prospecting).
- Relationship Status gains the value "Prospecting".

### 3. Merge (a dry-run report first, then you approve)
- Each prospect with no email match is appended to Contacts with its same ID, Relationship Status "Prospecting", stage kept in Prospecting Stage, names joined into Name.
- The 67 shared-email people are not merged automatically. They go on a review list; the Network row stays as-is and you choose per person (keep Network status, or mark Prospecting). No silent merge.
- The 95 shifted-Stage rows are moved with their values untouched and flagged for review.
- Afterwards verify: every prospect ID appears exactly once in Contacts; row counts add up; no Network cell changed.
- Targets is kept, renamed "Targets (archived)", read-only — not deleted.

### 4. Switch the app over
- Network page, pyramid, PortCo contacts: Contacts where status is Council/Hot/Warm/Cold (unchanged view).
- Prospecting page: Contacts where status is Prospecting; stage edits write Prospecting Stage.
- Bulk promote/demote and move to Prospecting: one batched status update, re-reading the rows first and skipping anyone whose status changed meanwhile (reported per person). Movement history still logged to Rating History.
- Campaigns, Event attendees, notes review, harvest, imports and V.I.C. read one list — IDs already match, so links keep working.
- Retire the copy/verify/delete transfer code, slices, auto-resume and per-item reconciliation for relationship changes. The journal and Admin activity log stay for audit.

### 5. Julia reruns
Her 142-person demotion then runs as one save.

## Risks and how they are handled
- Code reading Targets that is missed → every Targets reference (≈45 places) is switched in one change and covered by tests; archived tab stays as fallback.
- Duplicate people → only exact ID/email checks; shared emails go to review, never auto-merged.
- Teammates editing during the merge → merge runs while bulk writes are paused; verification re-reads before finishing.
- Sheet size → about 3,200 rows, well within Sheets limits.

## Technical notes
- New pure helper `src/lib/unified-contacts.ts` (target row → contact row mapping, status filters) with tests: no-email-match moves, shared-email goes to review, ID preserved, Network cells never changed, bulk status update skips changed rows.
- `relationship-levels.server.ts` becomes a single `values:batchUpdate` of the Relationship Status (and Prospecting Stage) cells.
- `TAB_NAMES.targets` readers/writers in sheets.server.ts, campaigns.server.ts, bulk-import.server.ts, notes-inbox, knowledge-harvest and targeting.tsx move to Contacts filtered by status.
- AGENTS.md rule about bulk Network transfers is replaced with the single-list rule.

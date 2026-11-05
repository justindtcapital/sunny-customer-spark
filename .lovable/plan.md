# Investigate and fix Network contact bulk actions

## Scope
Address Shane's high-priority November 5 report on **Network → contact list** (`/crm`), not Activity Review. Fix confirmed failures only; preserve unrelated contact data and existing relationship rules.

## What is known
- Network exposes bulk field edits, promotion/demotion, direct moves to Prospecting, Apollo enrichment, interest loading, tech-stack loading and deletion. Selected-contact export is also available.
- Field edits and deletion currently identify contacts by email; other actions also carry contact IDs. Missing or shared emails require investigation.
- Several failures currently display “see console” rather than a useful explanation. Refresh and result handling differ between actions.
- Relationship operations have saved progress and controlled retries; other actions follow different execution paths. A shared write lock can reject writes.
- A signed-in, read-only Network check succeeded. Available recent logs contain no matching bulk error. **The reported failure has not yet been reproduced; no root cause is confirmed.** No contacts have been changed.

## Approach

### 1. Reproduce and trace each action
Use multiple isolated test contacts in the actual Network list. Capture the selected IDs, submitted values, authorization checks, validation, server response and resulting saved state. Check list/sidebar entry points, filtered selections and select-all behavior.

| Action | Checks |
| --- | --- |
| Set Status, Sector, Contact Prime, Title, Company, Location, Contact Type, Area of Interest, Primary Area of Interest or Source | Valid field/value, exact selected targets, changed fields only, accurate saved count |
| Promote, demote, move directly to Prospecting | Mixed starting levels, unchanged cases, preserved identity/history, progress and retry |
| Apollo enrichment | Missing emails, no matches, provider failures, fill-only preservation |
| Load interests | Missing input, existing interests preserved, partial results |
| Load tech stack | Shared-company lookup deduplication, credit confirmation, provider errors, saved results |
| Delete | Explicit confirmation, exact selected targets, no unrelated or Prospecting-row deletion |
| Export selected / Clear selection | Export includes only the selection; clear never writes data |

Test small and larger selections, stale records, missing/shared emails, repeated submission, permission denial, busy locks, provider limits and interrupted requests. Inspect existing operation records read-only where useful; do not replay Shane's jobs automatically.

### 2. Fix evidence-backed causes
- If identity targeting is implicated, resolve by stable contact ID first; use email fallback only when uniquely safe. Explain missing or ambiguous targets instead of updating multiple people silently.
- Repair confirmed selection, payload, runtime validation or authorization issues without weakening team access checks.
- Keep relationship moves as in-place flags in unified Contacts—no copy/delete migration or new contacts store.
- Bound slow work and address confirmed lock/deadline failures through the existing journal and reconciliation safeguards. Never force-unlock uncertain operations or replay completed steps.
- Preserve manual ratings and enrichment's fill-only behavior. Write only the requested fields.

### 3. Make outcomes and refresh trustworthy
- Show succeeded, unchanged, skipped, failed and still-pending counts, with contact-specific explanations where available.
- Keep unresolved contacts available for correction; do not present an entire selection as saved or remove it locally after only partial success.
- Separate save failures from refresh failures. Re-read the saved list and refresh affected Network totals after changes; accurately reflect contacts that move out of the current filter.
- Offer safe retries only where completion can be reconciled. Explain the next step for expired sign-in, invalid values, provider limits or a blocked operation without exposing internal errors.

## Affected areas — technical details
- `src/components/crm/BulkEditBar.tsx`: action submission, confirmations, progress and errors.
- `src/components/crm/ContactList.tsx`, `ContactTable.tsx`, `src/lib/selection-context.tsx`, `src/routes/crm.tsx`: selected records, sidebar entry points and saved-list refresh.
- `src/utils/sheets.functions.ts`, `sheets.server.ts`, `sumble.functions.ts`: bulk validation, row targeting, writes and provider outcomes.
- `src/utils/relationship-levels.functions.ts`, `bulk-operations.functions.ts`, `bulk-journal.server.ts`, `bulk-execution.server.ts`: only if tracing confirms execution, locking or retry faults.
- Focused tests beside the existing bulk-operation, resume and relationship tests. No unrelated page redesign or data migration.

## Risks and safeguards
- **Production contact changes:** reproduce writes with clearly identified, isolated test contacts; snapshot their original values and restore edited fixtures. Never test deletion on existing contacts. Use mocks for destructive and provider-failure cases before controlled verification.
- **Shane-specific permissions:** the available preview session is Chris's, not Shane's. Check authorization without impersonation; if account-specific reproduction is needed, request approved access through the managed sign-in flow.
- **Shared emails and stale selections:** resolve fresh records and report ambiguity; compare untouched fields and identities before/after.
- **Limits, costs and interruptions:** Apollo/Sumble verification may consume credits. Respect confirmations, use minimal live lookups and mock rate-limit/time-out scenarios. Preserve journal evidence before any recovery.
- **Partial persistence:** reconcile what actually saved before retrying; retries must not repeat a promotion/demotion or duplicate history.

## Acceptance checks
1. Every listed write action is tested with multiple selected contacts; each field-edit option is covered.
2. Successful changes survive reload, target exactly the intended records and leave unrelated fields, IDs and history unchanged.
3. Partial or failed batches show accurate counts, useful reasons and a safe next step—not false success.
4. Mixed-level relationship changes and approved retries preserve the existing transition rules and do not apply a step twice.
5. Selection, filtered-list membership and affected Network totals reflect persisted outcomes.
6. Focused automated tests pass and signed-in Network flows are checked end-to-end. Any action lacking a live verification is explicitly reported with its blocker.

## Approval boundary
This is investigation and implementation planning only. **Wait for approval before changing application code, running bulk writes, recovering jobs or altering contacts.**
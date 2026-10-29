# Bulk-action reliability, activity troubleshooting and duplicate prevention

## Goal and scope
Resolve both Admin fix requests in one coordinated change, since they share the same selection, save and refresh flow. Keep the existing relationship ladder, manual ratings and data-preservation rules. No contact cleanup, automatic merges or live bulk changes during planning.

Also expand the existing Venture Pulse Admin activity log to cover bulk changes and people/event imports, with troubleshooting, fix-request creation and safe retry. Automatically prevent repeat records and writes; ambiguous matches remain reviewable without discarding tags or contact information.

## Findings so far
- Multiple failures currently share one “unchanged” message; there is no per-contact explanation.
- A completed transfer retried from an old selection is reported as skipped because the contact is no longer in Network.
- Partial transfer retries require an identical saved snapshot; existing prospect conflicts correctly block deletion but do not explain why.
- Rating saves switch from URID matching to email matching, and do not repeat the expected-rating check at the write boundary.
- Retrying after a partially successful request can advance successful contacts a second step because the selection adopts refreshed ratings.
- Selected-row counts can disagree with the filtered records actually submitted.
- Baseline tests: 8 passed, 3 failed. Two expectations predate the Council ladder; one transfer mock lacks movement logging. These test failures are not proof of the reported live cause.

## 1. Network → Prospecting transfers
**Priority:** High · **Reporter:** Julia Beech

### Approach
1. Trace affected records read-only to distinguish missing identity, an existing target conflict, stale source data and a completed/partial transfer. Do not change real contacts as part of diagnosis.
2. Match by stable URID first. Use email only when uniquely identifiable; never overwrite an unrelated prospect or infer a completed transfer from email alone.
3. Preserve URID and the complete profile snapshot. Verify the destination identity, profile and mapped fields before removing the Network source. Compare snapshots structurally so harmless JSON ordering does not reject a valid retry.
4. Treat a verified completed transfer as **already moved**, an idempotent success. Resume a verified partial copy without adding another target. Changed source data or an incompatible target remains blocked with its exact reason.
5. Re-read and conflict-check the source before deletion, then verify persisted destination presence and source absence. A failed or ambiguous write is reconciled before retry, not blindly repeated.
6. Refresh Network and Prospecting from saved data. Remove verified moved records from the current Network selection/detail view; do not hide a source merely because a partial target copy exists.

### Affected areas
Transfer helper and Sheets read/write helpers; bulk-action result display; Network list, selection and refresh; Prospecting refresh; transfer tests.

### Risks and safeguards
- Legacy missing URIDs, duplicate identities or differing snapshots may remain blocked. Report the reason rather than weakening safety checks.
- Sheets copy/delete is not transactional. Coordinate overlapping bulk requests, guard positional writes, and avoid automatic replay of ambiguous append/delete responses. If external edits cannot be safely reconciled, stop that contact and preserve its source.
- Preserve campaign membership and existing histories; append movement history only for newly verified transitions.

## 2. Promotion/demotion and partial-batch feedback
**Priority:** Medium · **Reporter:** Chris Falloon

### Approach
1. Keep the ladder **Prospecting → Cold → Warm → Hot → Council**, with reverse demotion and direct transfer to Prospecting unchanged.
2. Make count, preview and submitted contacts agree. Default to current filtered-row selection; prune hidden/stale IDs rather than silently submitting fewer contacts than shown.
3. Freeze each submitted identity, expected rating and intended destination. A retry means finishing that original transition, not applying another relative step.
4. Check fresh saved state near the write, preserve URID-based targeting, and block conflicting teammate changes. Already at the verified intended destination is a reconciled success, not another promotion/demotion.
5. Process contacts independently. Return one outcome per submitted contact, with accurate totals for changed, moved, already complete, blocked and failed/uncertain records.
6. Replace the grouped warning with a compact results panel showing each contact and reason: top-tier limit, saved rating changed, missing/ambiguous identity, existing prospect conflict, verification failure, source changed, or save failure.
7. Keep unresolved results available for safe retry; exclude successful records. Separate “save succeeded, refresh failed” from save failure and offer refresh-only recovery.
8. Refresh the contact list, selection, open details and expanded pyramid after completion, including partial success.

### Affected areas
Shared selection context, Bulk Edit bar and confirmation/results views, relationship-change server function and helpers, Network list/route, pyramid refresh, ladder and batch tests.

### Risks and safeguards
- Selection is shared with other bulk tools: regression-test select-all and filter changes without redesigning those tools.
- Update response handling and callers together so partial successes cannot disappear behind a thrown batch error.
- Do not overwrite concurrent edits or bypass Council boundaries, transfer verification or manual-rating policy.

## Technical implementation
- Extend the existing relationship-change contract with stable per-contact outcomes, original destinations and request identity for retry reconciliation. Derive aggregate counts from outcomes.
- Keep ordinary bulk-field editing separate; use identity-aware expected-state writes for relationship transitions.
- Use the existing named deadline pattern and bounded batches for Sheets calls. Coordinate overlapping app bulk writes and reconcile uncertain writes; document the remaining limits of direct external Sheets edits rather than claiming atomic transactions.
- Keep helpers server-only and require verified teammate access for operation creation, reads and retries. No CRM storage migration or new contact schema is planned. Add a small durable Lovable Cloud operation journal for deduplication, outcomes and retry context, not a second CRM store. Apply explicit grants and access policies; clients cannot forge completion states or execute arbitrary logged instructions.

## 3. Admin activity log → troubleshoot, retry or fix request

### Confirmed starting point
The existing Admin page reads the workbook’s Ops Log, with expandable items and OK/Error filters. The log writer accepts warnings too, but the page lacks a Warning filter. Logs have no explicit operation ID or structured retry context, and log-write errors are swallowed. Network CSV imports record totals, but some tagging failures are only sent to the console; relationship-change and planner-event entry points do not write an Ops Log entry themselves. Coverage of remaining bulk entry points will be inventoried before implementation.

### Approach
1. Keep the activity log collapsible at the bottom of Admin and preserve existing log history. Display new journal-backed operations alongside legacy entries without duplicate display rows.
2. Record each bulk upload/CSV import, event import, promotion/demotion, transfer and other existing bulk mutation entry point found in the inventory. Capture who initiated it, originating page, time, operation ID, intended action, totals, per-item outcomes and safe error explanations. Represent running, succeeded, partial, failed and uncertain outcomes accurately; interrupted runs must not appear successful.
3. Make an activity selectable and expandable. Show its original attempt and subsequent retries as a linked history.
4. **Troubleshoot:** load the selected activity’s sanitized details into the existing assistant for discussion. The assistant may explain or draft requests, never run writes or claim it fixed code.
5. **Create fix request:** open an editable draft with the activity ID, observed failure, affected items and attempt history; save through the existing request workflow. Include this evidence in the Lovable handoff. Repeated clicks should reopen/link the existing request rather than create duplicate tickets.
6. **Retry:** offer only for operations supported by a safe server-side retry handler. Preview unresolved items and original destinations, revalidate access and current saved data, then require confirmation. Already successful items are excluded. Disable retry for legacy entries with insufficient context, conflicts requiring review, and unsupported/destructive operations, with a clear reason.
7. Capture failures before/after each persisted stage in the durable journal. If journaling cannot start, do not begin the bulk mutation; if result finalization fails after a write, reconcile from saved data rather than reporting an untouched batch.

### Affected areas and risks
Admin activity page, Admin assistant and request drafts/handoff; shared operation journal and logging wrapper; the inventoried bulk/import entry points; additive operation metadata and request linkage.

- Do not store credentials, raw provider responses or whole uploaded files in visible logs or prompts. Store only validated retry fields and minimal necessary evidence with teammate-only access.
- Old entries are historical evidence, not automatically replayable commands. Retrying from text alone is forbidden.
- Existing log coverage is not a complete historical record. New coverage starts when deployed; no invented backfill of missing failures.

## 4. Automatic duplicate prevention for imports and bulk writes

### Confirmed starting point
Prospecting imports already check a target key (email, otherwise name/company), but proceed when that lookup fails. Event additions check a series-name/date key within the incoming batch and existing events. These are useful checks, but separate reads/appends are not cross-request uniqueness protection. Network CSV uploads also fall back to client checks if their fresh duplicate read fails.

### Approach
1. Reuse existing normalizers through shared, pure identity helpers for people, events and operation items. Run checks within each batch and against fresh persisted data before writing; if authoritative duplicate checks are unavailable, stop/retry later rather than import unchecked.
2. **People:** prefer URID, then normalized email aliases/LinkedIn where reliable. Name/company alone is a candidate match, not permission to merge two people. Check Network and Prospecting together so imports do not create a second CRM identity across tabs. Recognized existing people retain their ratings, owner and profile.
3. **Events:** distinguish repeat delivery of the same source/event from recurring events and same-day events in different locations. An exact replay is skipped; a likely match with new tags, dates, venue, notes or status goes into review with both versions preserved. Never silently skip information just because a series/date key matches.
4. For existing people/events, preserve incoming campaign memberships, attendance and new tags as reviewable association changes; dedupe those associations by their established keys. Do not overwrite the underlying record or silently discard new information.
5. **Transfers and rating changes:** dedupe selected identities and operation-item writes, preserve intended destinations across attempts and verify completion before replay. A retry must not add a second prospect, movement record or rating step.
6. Assign operation/item identities before writes and coordinate overlapping app requests. Reconcile provider timeouts against saved rows before retrying non-idempotent appends/deletions.
7. Report added/changed, exact duplicates skipped, already complete, conflicts awaiting review and failures separately in both the results screen and Admin log. Keep unresolved input available through the operation record for review/retry.

### Affected areas and risks
Network and Prospecting upload/paste entry points, event CSV/bulk creation and shared ingestion paths identified in the inventory; membership/attendance helpers; relationship transitions; journal and duplicate-policy tests.

- False matches can lose information: automatic prevention applies to exact/replayed identities; uncertain semantic matches require review. Existing duplicates are not automatically merged or deleted.
- Sheets has no cross-tab transaction. The journal coordinates participating app writers but cannot lock direct spreadsheet edits; uncertain states remain blocked until reconciled.
- No paid enrichment calls or new matching credits are needed for duplicate checks.

## Implementation sequence
1. Inventory entry points and repair baseline tests.
2. Build the operation journal, identity/replay checks and per-item outcome contract.
3. Fix the two Network requests and add import duplicate safeguards.
4. Connect Admin activity selection, troubleshooting, safe retry and request creation.
5. Verify the integrated flows and record these new tasks in the roadmap after approval (only the plan can be edited in plan mode).

## Verification and acceptance
- Repair the stale test baseline, then add realistic mocked persistence that actually removes source rows.
- Test both directions and Council boundaries; blank/case-normalized ratings; mixed eligible/already-moved/blocked batches; missing/duplicate identities and duplicate emails.
- Test copy verification, unrelated-target protection, changed source snapshots, partial copies, interrupted writes, overlapping requests and ambiguous responses.
- Test retry after partial success and page reload: no duplicate targets, no second ladder step, no loss of profile fields or history.
- Test selection/filter changes, accurate per-contact counts, list/detail/pyramid refresh and refresh-only failures.
- Test repeated CSV/event files, duplicate rows within a batch, cross-tab people matches, concurrent imports, duplicate-check read failures and timeouts after committed writes.
- Test that different people with similar names and recurring/different-location events are not collapsed; all incoming tags, memberships and attendance are either preserved or explicitly held for review.
- Verify success, partial failure and interruption appear in Admin; select an activity → troubleshoot → edit/save a linked fix request → read it back with history in the Lovable handoff.
- Verify retry previews only unresolved items, unsupported legacy retries are disabled, and double-clicking retry/request creation produces no duplicate writes or tickets.
- Test verified-teammate access, sanitized log/assistant context, journal failure before/after mutation and preservation of legacy log entries.
- Exercise the signed-in UI against isolated fixtures first. Any real write verification uses explicitly designated disposable test contacts, never Julia’s or Chris’s selected production relationships by default. If those fixtures are unavailable, report live-write verification as outstanding.

## Approval gate
Only planning files have changed. Implementation and contact mutations will wait for your approval.
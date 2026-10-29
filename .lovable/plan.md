# Network bulk-action reliability

## Goal and scope
Resolve both Admin fix requests in one coordinated change, since they share the same selection, save and refresh flow. Keep the existing relationship ladder, manual ratings and data-preservation rules. No contact cleanup, automatic merges or live bulk changes during planning.

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
- Keep helpers server-only and preserve existing access checks. No CRM storage migration or new contact schema is planned. If cross-request coordination needs a small durable operation store, include only application-owned operation metadata with server-validated access, not duplicate CRM profiles.

## Verification and acceptance
- Repair the stale test baseline, then add realistic mocked persistence that actually removes source rows.
- Test both directions and Council boundaries; blank/case-normalized ratings; mixed eligible/already-moved/blocked batches; missing/duplicate identities and duplicate emails.
- Test copy verification, unrelated-target protection, changed source snapshots, partial copies, interrupted writes, overlapping requests and ambiguous responses.
- Test retry after partial success and page reload: no duplicate targets, no second ladder step, no loss of profile fields or history.
- Test selection/filter changes, accurate per-contact counts, list/detail/pyramid refresh and refresh-only failures.
- Exercise the signed-in UI against isolated fixtures first. Any real write verification uses explicitly designated disposable test contacts, never Julia’s or Chris’s selected production relationships by default. If those fixtures are unavailable, report live-write verification as outstanding.

## Approval gate
Only planning files have changed. Implementation and contact mutations will wait for your approval.
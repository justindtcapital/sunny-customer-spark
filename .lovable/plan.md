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
**Starting point:** Admin reads the workbook’s Ops Log. It has expandable entries but no stable operation IDs or retry context. Warnings are accepted by the writer but not selectable in the status filter. Logging errors are swallowed; some CSV tagging failures only reach the console. The full entry-point inventory is still required.

### Approach
- Keep the log collapsible at the bottom, preserve old entries, and display new journal-backed operations without duplicate display rows.
- Cover CSV/bulk people and event uploads, promotions/demotions, transfers, and other existing bulk mutations found in the inventory. Record actor, page, time, operation ID, intent, totals and per-item results. Distinguish running, success, partial, failure and uncertain/interrupted outcomes.
- Track creation, enrichment and each tagging/membership step separately so retrying a failed tag never recreates an already-saved person.
- Selecting an entry reveals linked attempts and three actions: **Troubleshoot** supplies previewable, sanitized evidence to the existing assistant; **Create fix request** opens an editable draft linked to the activity/history; **Retry** previews unresolved supported steps and requires confirmation.
- Request creation is idempotent: repeated clicks reopen/link the existing request. Include redacted evidence in the Lovable handoff. The assistant only discusses/drafts; it never authorizes retries or changes code.
- Disable retry for unsupported/destructive actions, conflicting records and legacy entries without sufficient context. Revalidate saved state and teammate access server-side; never execute log text.
- Journal intent before mutation. If that fails, do not start. If recording the result fails after a write, reconcile persisted state before any retry. Do not label partial or uncertain operations successful.

**Affected areas:** Admin log/assistant, request creation/handoff, operation journal, bulk/import wrappers and additive request linkage.

**Risks:** New logs cannot recreate missing historical failures. Protect evidence/retry inputs with verified-team access; derive actors server-side. Redact secrets, raw provider responses and unnecessary personal data from visible logs, AI prompts and URL handoffs. Read failures must show unavailable, not an empty history. Validate deployed access before making exposure claims.

## 4. Automatic duplicate prevention
**Starting point:** Prospecting checks email or name/company but proceeds if its lookup fails. Network CSV similarly falls back to client checks. Events check normalized series/date, ignoring potentially conflicting tags/location. Separate reads and appends do not enforce cross-request uniqueness.

### Approach
- Centralize conservative server-side classification: **new**, **exact replay**, **needs review**, **invalid**. Check fresh persisted data and the incoming batch. Fail closed when authoritative checking is unavailable.
- People: URID first; normalized individual emails/aliases and reliable LinkedIn matches identify candidates. Check Network and Prospecting together. Weak or contradictory identifiers require review, not a new identity or automatic merge.
- Events: use source identity and business fields to prove a replay; series/date alone identifies candidates. Preserve recurring and different-location events. New/conflicting tags, venue, notes or status go to review with both versions retained.
- Exact replay/review rows cause no profile, rating, tag, attendance, note or enrichment writes. Keep incoming associations available for explicit review/approval and dedupe approved memberships/attendance by their established keys.
- Deduplicate transfers by resolved identity; freeze intended ratings and use operation/item replay keys. No second prospect, history entry or ladder step on retries. Same-value rating requests do not append fictitious movements.
- Coordinate overlapping app writes and reconcile ambiguous provider responses before replay. Report new, duplicate, already complete, review and failed counts in the results and activity log.

**Affected areas:** Network/Prospecting upload and paste, event CSV/bulk ingestion, discovery producers feeding these imports, association helpers and relationship writes. Confirm any legacy bypass is reachable before rerouting it.

**Risks:** Do not auto-merge/delete existing duplicates or discard differing tags. The journal coordinates participating app writers, not direct Sheets edits; uncertain states stay blocked. No paid matching/enrichment is needed.

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
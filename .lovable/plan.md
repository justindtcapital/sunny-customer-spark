# Network transfers and interrupted-operation reconciliation

## What the read-only investigation confirmed
- Operation `fb66f977-4422-49e1-a2a7-61506a6d6e09` requested **22 contacts**, not just 11. Its journal contains **11 recorded successful moves**, but its overall status is **uncertain**.
- That operation still holds the shared bulk-write lock. This is a safety measure; it must not be cleared simply because the journal says some items succeeded.
- Safe transfer checks and per-contact outcomes already exist. There is currently no reconciliation action for uncertain operations; Retry explicitly refuses them.
- The 11 recorded successes have **not yet been independently checked against live Network and Prospecting rows**. No code, lock, journal status or contact record has been changed for this investigation.

## 1. Fix inconsistent Network → Prospecting demotion
**Priority:** High · **Effort:** Medium

### Approach
- Trace the actual blocked cases through canonical contact ID, current rating, destination matches, saved profile verification, transfer results and refreshed Network lists.
- Keep copy → verify destination → reread source → delete source → verify absence as the transfer sequence. Preserve URIDs, complete profiles, history, tags and campaign memberships.
- Recognize an already-completed transfer only when the persisted destination is uniquely verified and the Network source is absent. Never treat a journal entry alone as proof.
- If both lists contain the person, distinguish a safely resumable verified copy from a conflicting/changed copy. Retain the source whenever verification is incomplete or ambiguous; do not overwrite or merge conflicting records automatically.
- Return explicit reasons per person, with separate counts for newly moved, already complete, blocked, failed and not started. Deduplicate repeated selections and avoid duplicate destination rows/history on retries.
- Reconcile the visible list with authoritative saved membership after the operation, including partial success. Refresh contact data, selection, counts and any open detail; do not hide a source merely because the operation claimed success. Preserve active filters and layout.

### Affected areas
Network bulk controls and contact list; relationship-transfer helpers; operation journal/results; relevant Network and Prospecting refresh paths.

### Risks and safeguards
- Teammate edits, duplicate identities and changed destination profiles can make deletion unsafe: keep those sources and explain exactly what needs review.
- A successful Sheets write followed by a timeout can leave an incomplete checkpoint: verify saved state before any replay.
- Preserve the distinction between one-tier demotion and an explicit move to Prospecting; retries retain the original destination rather than calculating another demotion.

## 2. Reconcile interrupted relationship changes
**Priority:** Medium · **Effort:** Medium

### Approach
- Add an explicit **Reconcile saved state** action in Admin for interrupted relationship operations. The first pass reads persisted data and records evidence; it does not transfer contacts.
- For the named operation, verify **all 22 requested contacts**, explicitly including each of the 11 recorded successes, using canonical IDs, unique membership, Prospecting stage and preserved profile evidence.
- Show an item-by-item report: verified complete, unfinished/source retained, conflicting memberships/profile, missing identity, or verification unavailable. Do not guess matches from names.
- Keep all shared bulk writes blocked while the operation is uncertain or reconciliation cannot finish. Do not expire or forcibly clear its lock.
- Once every item has a reliable classification and the interrupted writer is no longer active, save the reconciliation evidence and resulting status. Release only this operation's lock, with race checks; unresolved unsafe discrepancies keep the operation locked for review.
- Offer confirmed, owner-authorized Retry only for items verified unfinished and safe. Revalidate before each write, keep the same operation and original destinations, and skip verified-complete items without writing them again.
- Preserve the original request, attempts and outcomes as audit history. If reconciliation itself times out or fails, retain the uncertainty and lock instead of reporting success.

### Affected areas
Admin activity detail/actions; authenticated bulk-operation helpers; journal/lock handling; pure reconciliation classification helpers; relationship-change retry path.

### Risks and safeguards
- Journal successes may disagree with saved rows; live verification is authoritative.
- The remaining 11 may include changes that succeeded without a checkpoint; do not assume they were never started.
- Concurrent reconciliation/retry requests must not unlock an active writer or run duplicate transfers.
- Maintain existing teammate access checks and deadline-bounded named steps for Sheets work. No broad permissions change or new contact store is planned.

## Verification
- Add targeted tests for eligible + already-moved + blocked mixed batches; duplicate selections; source/destination ambiguity; altered profiles; teammate rating changes; and preserved canonical IDs.
- Test interruptions before copy, after copy, after deletion and before checkpoint/finalization; verify retry never repeats completed moves or changes a rating twice.
- Test full-request reconciliation when the journal has only 11 outcomes for 22 inputs, unavailable reads, retained locks, concurrent requests and owner-only retries.
- Exercise the signed-in Network → Admin → reconcile/retry → reload flow, confirming membership, accurate counts, per-person reasons and preserved filters.
- After approval, verify and reconcile the named operation first. Show the results before executing any unfinished-contact retry; this plan does **not** authorize replaying the remaining batch automatically.

## Scope
No automatic deduplication/merge of ambiguous people, no wholesale replay, no disabling safety checks, and no unrelated UI changes. If a profile discrepancy needs a human decision, leave that item blocked and report it.

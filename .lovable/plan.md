# Reconcile and finish interrupted batch 3155327a

## What the investigation found (read-only, nothing changed)

Operation `3155327a-b110-458f-814e-bf1b8e2034a9` (Julia, 36 people, Warm→Prospecting, last activity 17:03 UTC, 8 attempts):

- **18 people verified moved** — in Prospecting, gone from Network.
- **17 people untouched** — still in Network only, never started. Safe to retry.
- **1 person (Sandeep Agarwal) half-moved** — his Prospecting row is *complete* (all fields plus the full Network profile snapshot), but his Network row was never removed. He is in both lists.
- **No data lost anywhere.** Every person exists with full profile and tags in at least one list.
- The safety lock is still held by this batch. Its worker has been idle ~2 hours, so it is dead; the lock is stale.

## Root cause of the "hesitating"

Each Resume step processes 2 people inside a 55-second window. The auto-continue added earlier removes the repeated clicking, but the retry path has a gap: it does not handle someone who is *already* in Prospecting. Resuming as-is would copy Sandeep a second time and create a duplicate Prospecting row.

## Changes

### 1. Make retries idempotent (code, before any retry)
In the Network→Prospecting transfer path (`src/utils/relationship-levels.server.ts`):
- Before copying, check whether the URID already exists in Prospecting.
- If yes: verify the existing row carries the full profile (name, company, email, and the Network Profile snapshot); if complete, skip the copy and proceed straight to removing the Network row; if incomplete, block that person with a specific reason instead of overwriting.
- Add a test in `scripts/relationship-transfer.test.ts` covering the already-in-destination case (no duplicate row, source removed, outcome recorded as moved).

### 2. Release the stale lock
Delete the `shared-bulk-writes` lock row held by this operation (worker confirmed idle ~2h). No other batch is running.

### 3. Correct the operation record
Update the operation so Admin shows the truth: Sandeep's outcome recorded from verified sheet state, the 17 marked as still pending, status set to partial. Journal data is preserved, not rewritten.

### 4. Finish the batch
Julia opens the batch in Admin → Activity log and clicks **Resume** once. Auto-continue then processes the remaining people a few at a time until done. Sandeep's half-move completes via the idempotent path (source row removed, no duplicate).

## Verification
- New test passes; existing transfer tests still pass.
- After the retry: re-run the read-only reconciliation for all 36 URIDs — every person in Prospecting exactly once, nobody left in Network, nobody in both.
- Admin shows the batch as complete with accurate per-person outcomes.

## Out of scope
- No changes to ratings, tags, campaigns, or any other contact data.
- No automatic dedupe or merging beyond the single verified Sandeep case.

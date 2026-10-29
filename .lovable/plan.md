# Fix: relationship changes blocked by "Missing stable contact ID"

## What I found (confirmed)
- In operation dcbe1ccd, Julia tried to move 17 Warm contacts to Prospecting. Every one was blocked with "Missing stable contact ID; source was retained". Nothing was moved or lost.
- The blocking is correct. Each contact's row in the Network sheet has no permanent ID (the URID column is blank).
- This affects more than these 17. **1,270 of 1,892 Network contacts** and **532 of 1,346 Prospecting contacts** have no ID. No two contacts share an ID.
- Moves to Prospecting need that ID to copy, verify and then remove the original safely. Without it, every move is blocked.

## Plan
1. **One-time ID fill (backed up first).**
   - Copy the Network and Prospecting tabs to dated backup tabs.
   - Give every contact with a blank ID a new unique ID. Only empty ID cells are written; names, emails, ratings and every other field stay exactly as they are.
   - Re-read the tabs to confirm: every row has an ID, there are no duplicate IDs, and the row count is unchanged.
2. **Keep it from happening again.**
   - Every path that creates a contact (manual add, CSV/paste import, enrichment, Tell, notes review) gets an ID at creation.
   - Before each read and before each bulk change, a small automatic fill gives IDs to any blank rows. It uses the same blank-cells-only rule, so rows added by hand in the sheet are covered too.
3. **Bulk changes always carry the ID.**
   - The contacts you select send their ID with the change.
   - If an ID is still missing, the server first runs the automatic fill from step 2 and checks that the contact matches exactly one row (same email and name). If it matches more than one row, that contact stays blocked with "Multiple possible matches — review", and nothing is guessed.
4. **Clearer per-person results and safe retries.**
   - Each blocked person shows a specific reason and an action (for example "Open contact" or "Retry").
   - Retrying the failed operation re-checks each person. Anyone already moved is marked "already complete", so nobody is duplicated in Prospecting.
5. **Retry Julia's 17** from Admin history once the IDs are filled, and report how many moved.

## Affected areas
- Network and Prospecting sheet tabs (blank ID cells only, after backups)
- Contact creation paths and the bulk promote/demote/move tool
- Admin activity log entries and per-person messages

## Risks
- **Sheet edits on about 1,800 rows:** I'll back up first, write only blank ID cells in small batches, and re-read to check every write.
- **A teammate editing during the fill:** each write targets a cell that is still blank, and the final check catches any gap.
- **A Prospect and a Network contact for the same person** get different IDs. The existing duplicate check still flags them on a move; they are not merged automatically.

## Tests
- Missing ID: the automatic fill gives the row a unique ID and leaves every other cell unchanged. Running it twice changes nothing.
- A selection with no ID and two matching rows stays blocked as ambiguous.
- Valid ID: the move to Prospecting completes, and a retry reports "already complete" with no second copy.

# Individual Granola connections

## What your team gets
- A **Connect Granola** control in Notes Imports, also available from My Actions.
- Each teammate enters their own personal Granola API key in a masked field, then sees their connection status and can replace or disconnect it.
- **Import from my Granola** remains manual. Imports stage in **Unfiled Documents**, then move to the appropriate folder after review.
- Original authors remain attached to notes; importing or reviewing another person's shared note does not make the importer its author.
- Disconnecting never deletes previously imported notes or Drive copies.

## Required security change
The current sign-in accepts a typed team email without verifying ownership. Before allowing personal keys, replace that with verified sign-in for the existing allowed team accounts. Use a real authenticated session for connection and import requests; never use a typed email or browser-stored name as proof of identity.

This changes how teammates sign in. Their existing CRM records and canonical teammate aliases stay intact.

## Granola requirements
- Granola currently offers personal REST API keys, not a supported per-user REST OAuth connection in Lovable.
- Personal keys require a compatible Granola Business or Enterprise plan. Teammates create keys in Granola **Settings → Connectors → API keys**; workspace admins may restrict available access.
- Each key can see only the notes its Granola permissions allow. A workspace key is an alternative for shared notes, but does not replace personal connections for private notes.
- Keep the existing connection available during transition without letting another teammate use it as their personal connection.

## Technical details
1. Configure verified app authentication, map authenticated users to the existing teammate roster, and require verified sessions for every new connection operation and Granola sync/retry that uses personal credentials.
2. Store personal keys AES-GCM encrypted in dedicated server-side storage, keyed by stable authenticated user ID. Never return keys, ciphertext, or connection mappings to the browser; never store them in browser storage or logs. Use a generated server-only encryption secret.
3. Validate each personal key with a minimal read against Granola before saving; preserve a working connection if replacement fails. Personal raw API keys go to Granola's documented REST API server-side, not into the workspace connector gateway. Retain the existing gateway path only for its already-linked connection.
4. Give each connection its own harvest cursor. Deduplicate globally by Granola note ID so overlapping shared access never creates extra notes or reminders.
5. Stamp author from Granola owner metadata once. Record the authenticated importer separately. If author metadata is absent, preserve unknown provenance instead of attributing every note to Chris.
6. Use the existing import/review/Drive pipeline and named deadline steps. No scheduled Granola imports.

## Verification
- Test that signed-out requests cannot store, replace, disconnect, or use personal credentials.
- Test that one user cannot select or use another user's connection.
- Test per-connection cursors, duplicate shared-note handling, and separate author/importer attribution.
- Verify successful connection, manual import, read-back in Notes Imports, replacement failure, and disconnect with an authorized account. If a real personal key is unavailable, report that live import verification is blocked rather than claiming success.

## Out of scope
No automatic Granola sync, deletion in Granola, changes to event planning, or migration of unrelated CRM data.
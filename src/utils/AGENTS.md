# Server utils rules (knowledge harvest, Drive, Gmail)

- Mailbox tokens: per-mailbox Gmail refresh tokens are stored AES-GCM encrypted in the private "Mailbox Tokens" sheet tab, accepted only when Google confirms the consenting account equals GMAIL_KB_MAILBOX — app sign-in is an allowlist, so Google is the identity proof.
- Alias-harvested (gmail-*) activities count as registered activity only after Activity Review confirms them (review state shared with Notes Imports in Harvest State) — keeps automated tagging from polluting dashboards.
- KB Drive meeting files are imported by moving them into Meeting Notes/<PortCo> and marking appProperties.vp=1; files Venture Pulse created carry the same mark and are never re-imported — keeps Drive scans idempotent.
- Network (NWK) notes come from the NWK@ alias (GMAIL_NWK_ALIAS, default nwk@dt-capital.net) or "NWK" in a note title; on review, tagged contacts get one Interaction Trail row each (Source Ref kb:<recordId>, deduped) and the review stores their emails — keeps contact history traceable to the source note.
- New KB files land in Drive 'Unfiled Documents' and move to Meeting Notes/<PortCo>, PortCo Operations or Network Updates only on review — Drive mirrors reviewed state.
- Personal Granola keys are encrypted in Cloud, keyed by verified auth UUID; connection/import operations require a confirmed roster email — typed names cannot select another person's credentials. CRM data stays in Sheets.
- Google Groups rewrite From to the alias; parseMessage unwraps the real sender from X-Original-Sender/Reply-To so per-owner inboxes attribute correctly. Gmail harvest cursors overlap 2 days because existing threads are skipped.

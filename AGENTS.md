# Project rules

- Keep workstream bar status and priority separate from segment-specific program fields so GTM and BD share the same Asana bar mapping without replacing their detail fields.- Workstream edits write only changed Asana custom fields, typed from Asana's own field metadata (enum by option gid), after a server re-read conflict check — avoids clobbering concurrent Asana edits.

- Campaign membership lives in the "Campaign Members" sheet tab, one append-only row per (campaign, person); adding existing Network/Prospecting people never edits their records — so people can join many campaigns without data loss.
- External note sources (Gmail aliases, Drive, Granola) plug in as knowledge-harvester tracks keyed by a stable source id, read-only toward the source — keeps re-runs idempotent and never mutates the origin system.
- Granola is pulled only by the manual sync button, never by the cron harvest — users clean notes in Granola before importing.
- Mailbox tokens: per-mailbox Gmail refresh tokens are stored AES-GCM encrypted in the private "Mailbox Tokens" sheet tab, accepted only when Google confirms the consenting account equals GMAIL_KB_MAILBOX — app sign-in is an allowlist, so Google is the identity proof.
- Alias-harvested (gmail-*) activities count as registered activity only after Activity Review confirms them (review state shared with Notes Imports in Harvest State) — keeps automated tagging from polluting dashboards.
- KB Drive meeting files are imported by moving them into Meeting Notes/<PortCo> and marking appProperties.vp=1; files Venture Pulse created carry the same mark and are never re-imported — keeps Drive scans idempotent.

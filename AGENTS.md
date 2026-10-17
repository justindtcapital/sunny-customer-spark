# Project rules

- Scope pending Sheets work to the originating request and run review saves under withDeadline named steps; Workers kill stranded/idle waits as "hung".
- Wrap request-context access and exported server helpers in createServerOnlyFn when reachable through client-imported function modules; filename suffixes alone do not prevent server imports entering the browser graph.

- Keep workstream bar status and priority separate from segment-specific program fields so GTM and BD share the same Asana bar mapping without replacing their detail fields.- Workstream edits write only changed Asana custom fields, typed from Asana's own field metadata (enum by option gid), after a server re-read conflict check — avoids clobbering concurrent Asana edits.

- Campaign membership lives in the "Campaign Members" sheet tab, one append-only row per (campaign, person); adding existing Network/Prospecting people never edits their records — so people can join many campaigns without data loss.
- External notes preserve origins. Harvested activities skip existing IDs on save and collapse repeated IDs on read, with completion winning — prevents repeated reminders.
- Granola sync is manual-only; users clean notes before importing.

- Bulk Network transfers preserve URID and a full profile snapshot in Targets, verify the copy and re-read the source before deletion; history and campaign tabs stay untouched to prevent data loss.
- Mailbox tokens: per-mailbox Gmail refresh tokens are stored AES-GCM encrypted in the private "Mailbox Tokens" sheet tab, accepted only when Google confirms the consenting account equals GMAIL_KB_MAILBOX — app sign-in is an allowlist, so Google is the identity proof.
- Alias-harvested (gmail-*) activities count as registered activity only after Activity Review confirms them (review state shared with Notes Imports in Harvest State) — keeps automated tagging from polluting dashboards.
- KB Drive meeting files are imported by moving them into Meeting Notes/<PortCo> and marking appProperties.vp=1; files Venture Pulse created carry the same mark and are never re-imported — keeps Drive scans idempotent.

- Home momentum uses a dedicated read-only Sheets/Asana aggregate and pure date/scope helpers; provider failures must never fall back to demo rows because KPI counts must reflect real records.
- Contact creation uses a shared manual-rating policy and the legacy recalculation endpoint is inert; this prevents imports and sync callers from silently overriding human ratings.
- Follow-up edits use per-task Harvest State overlays before owner filtering; source match keys stay unchanged. Dates/completion use Notes or Harvested Activities; KB trails stay informational.

- Dashboard deep links use validated owner and section search parameters to select the action owner, expand the requested section, and scroll there; URL state keeps homepage navigation and browser history consistent.
- Network (NWK) notes come from the NWK@ alias (GMAIL_NWK_ALIAS, default nwk@dt-capital.net) or "NWK" in a note title; on review, tagged contacts get one Interaction Trail row each (Source Ref kb:<recordId>, deduped) and the review stores their emails — keeps contact history traceable to the source note.
- Original author (email sender to an alias, Granola note owner, uploader, Drive file owner) is stamped once on ingest as importedBy:<recordId>; owner filters use it before any name matching, and reviewers are stored separately — keeps provenance after re-filing.
- New KB files land in Drive 'Unfiled Documents' and move to Meeting Notes/<PortCo>, PortCo Operations or Network Updates only on review — Drive mirrors reviewed state.
- Note review uses one meeting roster for next-step assignment. Normalize assignees via team-next-steps; dated team steps store canonical assignee emails as follow-up owners, not reviewers. External steps stay informational; contact trails never duplicate team reminders.
- Teammate identity is one roster entry per person (primary Dell email plus other addresses and name aliases) resolved via teamMemberFor; every owner/author/roster match goes through it so any address identifies the same user.
- My Actions owns management; Dashboard links there. Date calendar and follow-ups share one owner query and inclusive date-range helpers — counts and filtering stay consistent.
- PortCo bullets in emails come only from the newest Drive "PortCo List" sheet (name, website, first sentence of Summary; PORTCO_LIST_FILE_ID overrides), never AI — keeps approved wording and links exact.
- Action Now completions are Harvested Activities with activityId "action:<hash>[:track]", undone via Harvest State "action-undone" — reuses activity counting without a new store.
- Partners are a separate entity from PortCos ("Partners" sheet tab, own review tag fields); contacts are linked to a partner by company match at read time and never moved or edited — keeps Network/Prospecting records intact while every upload auto-tags.

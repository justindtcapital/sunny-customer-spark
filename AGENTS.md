# Project rules

- Keep pending Sheets reads, metadata checks, write queues and partner reconciliation scoped to the originating HTTP request; cache only settled data across requests because Worker request cancellation can strand shared promises.
- Wrap request-context access and exported server helpers in createServerOnlyFn when reachable through client-imported function modules; filename suffixes alone do not prevent server imports entering the browser graph.

- Keep workstream bar status and priority separate from segment-specific program fields so GTM and BD share the same Asana bar mapping without replacing their detail fields.- Workstream edits write only changed Asana custom fields, typed from Asana's own field metadata (enum by option gid), after a server re-read conflict check — avoids clobbering concurrent Asana edits.

- Campaign membership lives in the "Campaign Members" sheet tab, one append-only row per (campaign, person); adding existing Network/Prospecting people never edits their records — so people can join many campaigns without data loss.
- External note tracks use stable source ids and never mutate origins, ensuring idempotent imports.
- Granola sync is manual-only; users clean notes before importing.

- Bulk Network transfers preserve URID and a full profile snapshot in Targets, verify the copy and re-read the source before deletion; history and campaign tabs stay untouched to prevent data loss.
- Mailbox tokens: per-mailbox Gmail refresh tokens are stored AES-GCM encrypted in the private "Mailbox Tokens" sheet tab, accepted only when Google confirms the consenting account equals GMAIL_KB_MAILBOX — app sign-in is an allowlist, so Google is the identity proof.
- Alias-harvested (gmail-*) activities count as registered activity only after Activity Review confirms them (review state shared with Notes Imports in Harvest State) — keeps automated tagging from polluting dashboards.
- KB Drive meeting files are imported by moving them into Meeting Notes/<PortCo> and marking appProperties.vp=1; files Venture Pulse created carry the same mark and are never re-imported — keeps Drive scans idempotent.

- Home momentum uses a dedicated read-only Sheets/Asana aggregate and pure date/scope helpers; provider failures must never fall back to demo rows because KPI counts must reflect real records.
- Contact creation uses a shared manual-rating policy and the legacy recalculation endpoint is inert; this prevents imports and sync callers from silently overriding human ratings.
- Network reminder due dates live on Notes interaction rows; note-created reminder completion lives on Harvested Activities, so calendar counts and completion survive reloads without altering campaign membership.

- Dashboard deep links use validated owner and section search parameters to select the action owner, expand the requested section, and scroll there; URL state keeps homepage navigation and browser history consistent.
- Network (NWK) notes come from the NWK@ alias (GMAIL_NWK_ALIAS, default nwk@dt-capital.net) or "NWK" in a note title; on review, tagged contacts get one Interaction Trail row each (Source Ref kb:<recordId>, deduped) and the review stores their emails — keeps contact history traceable to the source note.
- Original author (email sender to an alias, Granola note owner, uploader, Drive file owner) is stamped once on ingest as importedBy:<recordId>; owner filters use it before any name matching, and reviewers are stored separately — keeps provenance after re-filing.
- New KB files land in Drive 'Unfiled Documents' and move to Meeting Notes/<PortCo>, PortCo Operations or Network Updates only on review — Drive mirrors reviewed state.
- Note review uses one meeting roster (link/add/guest/skip per person) that feeds next-step assignment; next steps are informational and stored on the review, only explicitly tracked ones become follow-ups — avoids follow-up bloat from others' actions.
- Teammate identity is one roster entry per person (primary Dell email plus other addresses and name aliases) resolved via teamMemberFor; every owner/author/roster match goes through it so any address identifies the same user.
- My Actions (/my-actions) is the only place to manage workstreams, notes and follow-ups; Dashboard summary boxes link there and old ?section deep links redirect — one inbox avoids duplicate review UIs.
- PortCo bullets in emails come only from the newest Drive "PortCo List" sheet (name, website, first sentence of Summary; PORTCO_LIST_FILE_ID overrides), never AI — keeps approved wording and links exact.
- Action Now completions are Harvested Activities with activityId "action:<hash>[:track]", undone via Harvest State "action-undone" — reuses activity counting without a new store.
- Partners are a separate entity from PortCos ("Partners" sheet tab, own review tag fields); contacts are linked to a partner by company match at read time and never moved or edited — keeps Network/Prospecting records intact while every upload auto-tags.

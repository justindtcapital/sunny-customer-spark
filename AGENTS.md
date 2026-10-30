# Project rules
- Subdirectories have their own AGENTS.md; read it before changing files there.

- Scope pending Sheets work to the originating request and run review saves under withDeadline named steps; Workers kill stranded/idle waits as "hung".
- Wrap request-context access and exported server helpers in createServerOnlyFn when reachable through client-imported function modules; filename suffixes alone do not prevent server imports entering the browser graph.

- Workstream bars separate status/priority from program fields. Edits re-read Asana, conflict-check, and write changed fields only (enum gids); title edits preserve company/track prefixes and compare the original task name.

- Campaign membership lives in the "Campaign Members" sheet tab, one append-only row per (campaign, person); adding existing Network/Prospecting people never edits their records — so people can join many campaigns without data loss.
- External notes preserve origins. Harvested activities skip existing IDs on save and collapse repeated IDs on read, with completion winning — prevents repeated reminders.
- Granola stays manual-only; personal auth/storage rules live in src/utils/AGENTS.md.

- Bulk Network transfers preserve URID and a full profile snapshot in Targets, verify the copy and re-read the source before deletion; history and campaign tabs stay untouched to prevent data loss.
- Relationship changes use bounded authenticated slices with frozen destinations and request-scoped abort/fenced checkpoints; pending items require explicit Resume, and inspection never releases uncertain locks or assigns IDs, preventing whole-batch replays after interruption.

- Home momentum uses a dedicated read-only Sheets/Asana aggregate and pure date/scope helpers; provider failures must never fall back to demo rows because KPI counts must reflect real records.
- Contact creation uses a shared manual-rating policy and the legacy recalculation endpoint is inert; this prevents imports and sync callers from silently overriding human ratings.
- Follow-up edits use per-task Harvest State overlays before owner filtering; source match keys stay unchanged. Dates/completion use Notes or Harvested Activities; KB trails stay informational.

- Dashboard deep links use validated owner and section search parameters to select the action owner, expand the requested section, and scroll there; URL state keeps homepage navigation and browser history consistent.
- Original author (email sender to an alias, Granola note owner, uploader, Drive file owner) is stamped once on ingest as importedBy:<recordId>; owner filters use it before any name matching, and reviewers are stored separately — keeps provenance after re-filing.
- Note review uses one meeting roster for next-step assignment. Normalize assignees via team-next-steps; dated team steps store canonical assignee emails as follow-up owners, not reviewers. External steps stay informational; contact trails never duplicate team reminders.
- Teammate identity is one roster entry per person (primary Dell email plus other addresses and name aliases) resolved via teamMemberFor; every owner/author/roster match goes through it so any address identifies the same user.
- My Actions owns management; Dashboard links there. Date calendar and follow-ups share one owner query and inclusive date-range helpers — counts and filtering stay consistent.
- PortCo bullets in emails come only from the newest Drive "PortCo List" sheet (name, website, first sentence of Summary; PORTCO_LIST_FILE_ID overrides), never AI — keeps approved wording and links exact.
- Completed aggregates owner-scoped workstreams, resolved follow-ups, confirmed reviews and Action Now across all dates. Action Now uses "action:<hash>[:track]" and "action-undone"; dedupe tracks and represented follow-ups without a new store.
- Partners are a separate entity from PortCos ("Partners" sheet tab, own review tag fields); contacts are linked to a partner by company match at read time and never moved or edited — keeps Network/Prospecting records intact while every upload auto-tags.
- Event Planner data lives in the shared Event Tracker spreadsheet ("Events DB" + "Event Attendees" tabs, EVENT_TRACKER_SHEET_ID overrides); FY tabs are read only for the one-time seed, and people stay in the CRM with attendance as (event, person) rows — keeps one contact record across many events and years.
- Asana is a read-only overlay in the Event Planner ("Show Asana data" toggle, off by default); the one-time "Merge Asana data" action enriches empty fields and merges same-date duplicate rows (Tracker row wins, DTC Status never overwritten) via planAsanaEnrichment — no recurring Asana writes.
- One-time event cleanup uses the pure event-cleanup plan and an explicitly applied, backed-up Sheets batch; keeper URIDs/statuses survive, attendee URIDs are remapped atomically, and merged names/Asana IDs remain in Source Ref for legacy contact links and read-only overlay suppression.
- EventPlanner owns the persistent shared sidebar and canonical filtered tracker rows for all event views; event-views adapts rows only for legacy list/chart presentation, and every selection opens the tracker detail to avoid divergent Asana datasets.
- vite.config.ts seeds public VITE_ backend env into process.env; .env is git-ignored, so published builds would crash.
- Admin fix/feature requests live in the Lovable Cloud admin_requests table (not Sheets); the in-app assistant only drafts tickets and never changes code — avoids Sheets quota/conflicts and false "fixed" claims.
- Admin dictation uses complete PCM WAV capture and the existing transcription service; transcripts append to the editable message without sending, and leaving the page releases microphone tracks.
- Network Pyramid counts come from pure helpers in src/lib/network-pyramid.ts (one primary domain per person, market roll-up from free-text location, no market column). Movements reuse the append-only Rating History tab (deletes log "Removed", moves log "Prospecting"), and per-tier targets live in "Network Targets". Data loads only when the pyramid is expanded, so the Network page stays fast.
- Network Pyramid presentation responds to its available container width, with a separate scalable tier chart and compact mobile breakdowns; sidebar width must not force dashboard overflow.
- PortCo people are derived at read time (company matches a PortCo name or legacy Portfolio sector) via src/lib/portco-contacts.ts: shown and searchable in Network with a "PortCo" tag, excluded from tier filters and the pyramid, and saved ratings are never changed — so new PortCo hires drop out automatically without data loss.
- Company↔contact linking uses src/lib/company-domains.ts: exact registrable domains from the website or human-verified aliases ("Domain Aliases"/"Email Domains" columns) only; shared mail providers never link, and similar domains are review-only suggestions — prevents false links and silent merges.
- Vic (src/routes/api/vic.ts, src/utils/vic-ai.server.ts) only proposes changes; approved proposals run through the existing journaled server functions, and chats are per-teammate rows under RLS — so the assistant can never write data without human review.
- Vic knowledge search uses Google Drive full-text search on the KB shared drive (GOOGLE_KB_DRIVE_ID) plus live text export for snippets — no copied index to keep in sync.
- Vic's shared in-app skill registry is browser-safe metadata plus fixed server instructions; introduction shortlists use recorded evidence and canonical Relationship Prime identity, never change ratings or infer consent, and all writes remain reviewed proposals.
- Assistant layouts own shared skill/folder selection through VicWorkspaceProvider so left-menu controls and the chat transport use the same state on full pages and panels.
- Event history links live in the append-only "Event History Links" tab of the Event Tracker (one row per target event, source kind and source ID; unlink stamps Removed At). Pure matching in src/lib/event-history.ts proposes only, generic names, multiple candidates, conflicts and date-only activity matches go to review, and the system never creates events or edits sources. This keeps reruns idempotent and history traceable.

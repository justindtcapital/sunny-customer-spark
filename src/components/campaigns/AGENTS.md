# Campaign manager rules

- Campaign results: append-only "Campaign Results" tab, latest per campaign+person wins, read into contacts; only "closed" leaves the list; the pickable results come from RESULT_OPTIONS in src/lib/campaign-results.ts, legacy values stay readable (attending = confirmed), and closing an event campaign registers confirmed people via addAttendees (email/name dedupe) — no duplicate marks, attendees or hidden old marks.
- Campaign email sends (individual / per-company / one BCC email) are planned by pure `campaignEmailBatches` in src/lib/campaigns.ts; every recipient list goes through `joinAddresses`/`mailtoLink` (semicolon-separated) and group sends log with one batched `logCampaignSends` — Outlook ignores commas and per-person logging would exhaust Sheets quota.

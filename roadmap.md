# Roadmap — PortCo Knowledge Base (Drive + Gmail + Gemini)

## Homepage momentum and manual ratings
- [ ] Enforce Cold promotions and manual-only saved ratings; remove auto-rating controls
- [ ] Project Asana creation/completion dates and event owners
- [ ] Build scoped workspace momentum and Workstreams summary on Home
- [ ] Persist follow-up due dates/completion and show due/overdue/undated reminders
- [ ] Add rule tests and verify signed-in homepage flows

- [ ] Explore existing code: sheets tab helpers, gmail, asana workstreams, gemini, dashboard
- [ ] P1: knowledge.server.ts — Knowledge Records / Harvested Activities / Suggested Contacts / Workstream Links / Harvest State tabs
- [ ] P1: Harvester (4 aliases via shane@dt-capital.net + Venture Pulse KB drive 0AFtlyPes27_KUk9PVA), extraction, dedupe, matching engine (portco → workstream, confirm/change/create/ignore)
- [ ] P1: Cron route /api/public/cron/knowledge-harvest
- [ ] P1: Asana activity one-time import script
- [ ] P1: Activity timeline UI (dashboard single-portco + PortCo popup)
- [ ] P2: Workstream review queue UI (dashboard workstream view only)
- [ ] P2: Upload notes / drop-a-file (portco popup, dashboard, knowledge page)
- [ ] P2: Suggested contacts review (Network)
- [ ] P3: Ask panel + Investor/Founder briefs
- [ ] Env vars, typecheck, tests, verify
- [x] Granola notes → knowledge base (records, activities, Drive copy, review queue, contacts)
- [x] Granola Imports list with verified "Safe to delete in Granola" badge
- [x] Granola syncs only on "Import from Granola" click (no scheduled pull)
- [x] Delete test Granola imports and re-import cleaned-up notes
- [x] Notes Imports inbox (Granola/Upload/Drive/Email rows, workstream confirm/change/new, next-step follow-ups, add people, history)

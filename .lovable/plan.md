# Fresh homepage: five panels, V.I.C. as the only AI

## What goes away
- The Ask and Tell (voice capture) tiles, "Generate briefing", the daily briefing, prioritized signals, buying windows and recommended actions, plus the current momentum statistics, reminders and workstream lists on the homepage.
- This is a full removal, not just hiding: the homepage components, their server functions, the briefing store and the signals scan/reconcile/prune/feedback/topics code, and the scheduled jobs that run them.
- Saved Google Sheets tabs (old briefings, signals) are **left in place, untouched**. Only the code that reads and writes them is removed, so no history is lost.

## New homepage layout
Same-sized panels in a responsive grid. Clicking a panel, or the button in its bottom corner, opens the matching page.

1. **Network**: a small copy of the Network pyramid (Council, Hot, Warm, Cold, Prospects…) using the same counts as the Network page. Two figures: **New (last 30 days)** and **Total**. Button: "Open Network".
2. **My Actions**: a compact calendar showing how many actions are due each day, and a list of today's actions. Button: "Open My Actions".
3. **Events**: a small month calendar with dots on days that have events, colored by event category. Beside it, a short text list of the next 5 to 8 upcoming events (date and name). Clicking anywhere opens the Event Planner.
4. **Campaigns**: active campaigns in progress, each with a small badge showing who runs it. Button: "Open Campaigns".
5. **V.I.C. agents**: the V.I.C. mark plus quick buttons for your V.I.C. skills/agents. A button opens V.I.C. with that skill already selected. Clicking the panel opens V.I.C.

The Mine/Team and Week/Month selectors are removed with the old statistics. Network, actions and campaigns are shown for you; events are shown for the whole team.

## Technical details
- Rewrite `src/routes/index.tsx` with five panel components under `src/components/home/` (new files), loaded through route-loader `ensureQueryData` plus `useSuspenseQuery`. Each panel has its own query and Suspense boundary, so a slow panel doesn't hold up the rest.
- Reuse what already exists: the `network-pyramid` helpers and the existing pyramid server read; `action-calendar` with the My Actions owner query; event-planner tracker rows and category colors; the existing campaign list read; the `vic-skills` registry (skill selection passed to `/vic` through a URL search parameter).
- Delete: `DailyBriefing.tsx`, `VoiceCapture.tsx`, `briefing.functions.ts`, `lib/briefing.ts`, `home.functions.ts`, `lib/home-momentum.ts` (and its test), `voice.functions.ts`, `lib/voice-category.ts`, `signal-*.ts`, `signals-*.server.ts`, the cron routes `api/cron/scan-signals` and `signals-reconcile`, and their Inngest registrations. Remove the briefing/signal helpers from `sheets.server.ts`, `intel.server.ts` and `llm.server.ts`.
- First step: a search for every importer of each file. Shared code is cut back, not deleted, if another feature uses it (for example the Admin dictation button, the event pipeline, Gmail or activity sourcing). Anything outside the homepage that would break is reported before it is removed.
- Update `AGENTS.md`: replace the "Home momentum" rule with a rule for the new panels. Update the memory for "Homepage momentum", which this redesign makes obsolete.

## Risks
- Signals code may feed other features (event pipeline, intel). The first step finds these links, and those features keep working.
- Removing the scheduled jobs stops background signal scans for good. This matches the request.

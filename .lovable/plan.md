# Homepage momentum overview and manual relationship ratings

## Goal
Make Home a concise overview of momentum across the workspaces, rather than an automated relationship-health scorecard.

## Proposed layout
```text
Good morning, Chris                         Mine / Team
Thursday, October 15                       This week / This month

Network            Prospecting             Events
Total · Added      Total · Added            Upcoming · New

PortCo             Campaigns                Dashboard
Companies          Active · New             Notes · Emails to review

Workstreams                                          Open
Initiated in period | Active now | Completed in period | Completed total
                          BD / GTM / status breakdowns
                          PortCo logos and counts, right-aligned

Follow-ups due this week                              View
Due this week | Overdue | Without a date
Expandable list with person, company, owner, due date and source

Daily briefing
```

- Move workspace links immediately below the greeting and put their statistics inside each workspace tile. Include Campaigns alongside the existing workspaces.
- Use the established large-number summary style: major figures on the left, smaller breakdowns on the right, PortCo logos below and right-aligned.
- Remove the network-health ring, Needs you / Waking / Steady figures, temperature-focused homepage metrics, and the Needs your attention list.
- Retain the daily briefing below the new summaries; do not change its generation process.
- Keep the full Dashboard available through its workspace link and the Workstreams Open action.

## Scope and time controls
- **Mine / Team** changes every applicable summary, including follow-ups. Start in Mine, consistent with the current personalized homepage.
- **This week / This month** changes additions, initiations and completions. Use calendar periods to date: Monday through today for the week, and the first of the month through today for the month, using one consistent app reporting timezone.
- Current inventory figures—total contacts, active workstreams, upcoming events and pending reviews—remain current totals, not period counts.
- The follow-ups bar remains **due this week**, including the rest of the calendar week, regardless of the momentum period selector.
- Mine uses recorded relationship/contact primes, workstream owners, campaign owners and existing notes/activity ownership matching. Do not treat mentions alone as ownership of contacts or events. Items without an attributable owner count in Team but not Mine.

## Manual Hot / Warm / Cold
- Newly promoted prospects enter the CRM as **Cold**. Other creation/import flows default to Cold unless a person explicitly chooses a different rating.
- Preserve existing contacts' saved ratings; do not reset the CRM or overwrite an existing contact during duplicate/promotion checks.
- Disable automated temperature changes entirely, including changes after Gmail/Asana sync and the algorithmic Recalc action. Remove automatic-mode controls, lock/unlock language and score-threshold definitions from the rating interface.
- Keep individual and bulk manual rating selection, persistence and rating history. Activity, imports, AI suggestions and elapsed time cannot independently alter a saved rating.
- Keep Council records and manual Council selection intact; this request does not remove that existing category.
- Numeric activity/engagement scoring may remain for unrelated uses, but it must no longer determine the saved relationship rating.

## Accurate KPI sources
- **Network / Prospecting:** totals and additions from their saved Date Added fields.
- **Workstreams:** read Asana creation and completion timestamps and carry them through to the homepage. The current workstream model exposes last modification, not creation, and drops the fetched completion timestamp; neither modification dates nor first-seen dates will be used as invented initiation dates. Show newly created streams as Initiated, with current Active and Completed totals using the shared workstream bar status mapping. Keep not-started, on-hold and blocked categories distinct from genuinely active work.
- **Events:** add creation date and assignee/owner to the existing event read for New and Mine statistics. Label future-dated events **Upcoming**, because the current Planned label is derived from the event date rather than a separate planning stage. Show period event dates separately if useful; do not confuse events occurring in the period with events created in it.
- **Campaigns:** active totals and additions from saved campaign status, creation date and owner.
- **Notes / Activity:** pending notes and pending email review counts, plus imported/reviewed-in-period figures where saved timestamps support them. Pending email imports remain excluded from registered activity until confirmed. Skipped items do not count as confirmed reviews or registered activity.
- Missing dates or failed reads display an unavailable/undated state, not a misleading zero or fabricated change figure.

## Follow-ups
- Combine dated Prospecting follow-ups and campaign reminders, matching them back to their people and outstanding state so the same reminder is not counted twice.
- Network interactions currently have a follow-up flag but no dedicated due-date field. Add an optional saved due date to the existing follow-up controls and reads so Network follow-ups can participate accurately. Preserve existing undated follow-ups and show them under **Without a date**, not Due or Overdue.
- Notes-created follow-ups have saved dates but no explicit completion state today. Include them only after providing a saved completion state and a clear way to mark them complete; unreviewed suggested next steps are not due tasks.
- Expand/View exposes the actual outstanding items and links to their existing person, campaign or source view. Completed items are excluded. Do not reuse the old temperature/staleness algorithm as a due-date calculator.

## Technical implementation
- Reuse the existing Sheets and Asana connections and caches; no new service or credential changes.
- Keep read-only KPI aggregation in focused helpers with TanStack Query-backed loading. Add timestamp/owner projections to existing Asana reads without writing to Asana or changing workstream custom-field behavior.
- Apply the manual-rating rule at the write boundary as well as removing automatic callers, so an old recalculation endpoint cannot continue changing ratings.
- Keep owner scoping consistent across all totals and drill-down lists, with cache keys separated by user/scope. Reuse existing owner matching rather than introduce a second identity system.
- Preserve the existing Dashboard owner-specific visibility rules; the new Home Team summaries do not change the Dashboard panels.
- Record the new rating rule and chosen homepage preferences in project memory during implementation; document structural decisions in AGENTS.md.

## Verification
- Add and run focused tests for Cold-on-promotion/default creation, unchanged ratings after sync/recalculation, explicit manual rating changes, duplicate-contact preservation, calendar boundaries, owner scopes, created-versus-modified dates, completion counts, confirmed-only activity and follow-up deduplication/completion.
- Verify signed-in with Chris: switch Mine/Team and Week/Month, open workspace links, inspect workstream totals, and follow a due item to its record.
- Verify a prospect promotion reads back as Cold; manually change it to Warm and confirm sync leaves it Warm.
- Check desktop and narrow-screen layouts, loading/failure states, and homepage-specific metadata.

## Not included
- Resetting existing ratings, changing campaign memberships, replacing Asana event planning workflows, changing harvest schedules, or publishing the app automatically.
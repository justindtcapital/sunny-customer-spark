# Actions components

- WorkstreamTrail ("Recent activity" in My Actions) is a read-only view over harvested activities and workstream links via src/lib/workstream-trail.ts; it never writes, so it cannot diverge from the activity store.
- My Actions PortCo/Network filing is the pure fileFollowUp helper (src/lib/action-grouping.ts) plus an optional saved "filing" in the follow-up edit overlay, so PortCo tags are never conflated with the person's company.
- Follow-up completion in My Actions is optimistic: the item hides and the form closes at once, the save runs in the background and failed items come back with an error. completeActionFn closes the follow-up row itself (no second close; see src/lib/follow-up-completion.ts) and writes the Ops Log after responding; caches are patched in place, not refetched — avoids Sheets quota bursts that left Save stuck.

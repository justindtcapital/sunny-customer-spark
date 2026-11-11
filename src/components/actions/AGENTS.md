# Actions components

- WorkstreamTrail ("Recent activity" in My Actions) is a read-only view over harvested activities and workstream links via src/lib/workstream-trail.ts; it never writes, so it cannot diverge from the activity store.
- My Actions PortCo/Network filing is the pure fileFollowUp helper (src/lib/action-grouping.ts) plus an optional saved "filing" in the follow-up edit overlay, so PortCo tags are never conflated with the person's company.

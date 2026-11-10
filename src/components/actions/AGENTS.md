# Actions components

- WorkstreamTrail ("Recent activity" in My Actions) is a read-only view over harvested activities and workstream links via src/lib/workstream-trail.ts; it never writes, so it cannot diverge from the activity store.

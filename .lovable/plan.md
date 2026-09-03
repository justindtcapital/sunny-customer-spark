# Workstream reporting from Asana subtasks

## What the current access already allows

Verified live against the Asana portfolio project with the token this app already uses:

- Subtasks are fully readable. 83 parent tasks (one per portfolio company), 46 of them have subtasks, 92 subtasks total.
- Each subtask is a workstream and follows a naming convention, e.g.
  `MavenAGI -> GTM -> Pitch Evolution`, `MavenAGI -> BD -> Dell Services`, `Savant -> BD -> Dell A/P`.
- Subtasks carry the reporting fields already: `Strategy Workstream Status`
  (Complete / Working to Complete), `GTM Strategy Category`, `Sell-In Status`,
  `Sell With Dell - Maturity`, `Dell Targets`, `Dell Stakeholders`, `Next Steps`,
  `Sell In - Traction`, plus assignee, completed flag and last-modified date.
- Field coverage is uneven: many subtasks have no status or category set yet, so
  reporting must show an explicit "Not set" bucket rather than guessing.

The app does not read subtasks today — it only reads the company-level parent task
fields. So this is new data plumbing, not a data-access problem.

## What to build

**1. Read workstreams from Asana**
Fetch subtasks for every portfolio parent task and normalize each into a workstream
record: company, segment (BD / GTM / Other, parsed from the `->` naming convention),
workstream name (the last segment of the name), status, category, owner, Dell target,
next steps, complete flag, last activity date.

**2. Workstreams panel on each portfolio company**
On the PortCo detail page, a Workstreams section listing that company's workstreams
grouped by BD / GTM, each row showing name, status pill, owner, next steps and last
activity. Completed ones collapse under a "Completed" group.

**3. Portfolio-wide workstream report**
A new report view (Portfolio tab) with:
- Counts by status (Complete / Working to Complete / Not set) and by segment.
- Counts by GTM Strategy Category and by Dell Target.
- Companies with zero workstreams (coverage gap) and stale workstreams (no change in 90+ days).
- Click-through from any bar to the underlying workstream list, then to the company.

**4. Freshness**
Same pattern as the existing Asana reads: cached server fetch, refreshed on load, with
a manual refresh action. No writes back to Asana.

## Technical notes

- New `fetchPortcoWorkstreams()` in `src/utils/asana.server.ts` using
  `GET /tasks/{gid}/subtasks?opt_fields=name,completed,completed_at,due_on,assignee.name,modified_at,notes,custom_fields.name,custom_fields.display_value`,
  driven off the parent list already fetched by `fetchPortcoFields()`; requests batched
  with the existing concurrency helper so 46+ calls stay within Asana rate limits.
- Exposed through a new server function in `src/utils/asana.functions.ts` returning a
  flat `Workstream[]`, keyed by the same lowercased company name used by
  `fieldsByCompanyName`, so it lines up with `portco-canonical` matching.
- Name parsing in a new pure `src/lib/workstream-parse.ts` (split on `->`, trim, drop a
  leading company token, classify BD / GTM / Other) so it is unit-testable.
- Charts reuse `ConfiguredChart` / `DrillSheet` so drill-down behaves like the existing
  portfolio charts.
- No schema or Sheets changes; Asana stays the source of truth for workstreams.

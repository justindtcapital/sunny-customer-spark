# Dell Leverage Dashboard

A new dashboard at Dashboards → **Dell Leverage**, built for running a QBR with Dell. It reads only the existing Sell-In and Sell-With workstreams (no new data), and is written from Dell's point of view.

## What it will never show
- DTC Priority, Workstream Priority, DTC Dell Leverage Priority (ROI), DTC Leverage Opportunity, ownership/investment, owner names, internal notes.
- Anything framed as "important to us". Ordering is by Dell business unit and progress stage only.
- A "Presenting to Dell" switch is not needed — the page is always safe to share on screen.

## Layout (top to bottom)

```text
[ Filters: Motion (Sell-In | Sell-With | Both)  Dell BU  Domain  Status ]
[ KPI strip: Active workstreams | Engaged & progressing | Stalled | Existing (live with Dell) | Companies | Stakeholder coverage % ]
[ Pipeline funnel: Trying to Engage -> Engaged/Stalled -> Engaged/Progressing -> Existing ]   [ Sell-In vs Sell-With split ]
[ BU heatmap: rows = Dell BU, columns = stage, cells = count (click to filter) ]
[ Existing outcomes: Embedded / On Dell Paper / Ref Arch / Services Enabled ]
[ Stakeholder map: per BU, Dell people engaged and the workstreams they sponsor; gaps flagged ]
[ Workstream table: Company, Motion, Dell BU, Status, Dell Stakeholders, Products aligned, Last updated ]
```

## KPIs
1. **Active Dell workstreams** — total, split Sell-In / Sell-With.
2. **Stage mix** — counts per status (1 Engaged/Progressing, 2 Stalled, 3 Trying to Engage, Interested/Not Engaged).
3. **Live with Dell** — Existing outcomes count (Embedded, On Dell Paper, Ref Arch/Joint Solution, Services Enabled).
4. **Stalled share** — stalled / engaged, to drive "where do we need your help" asks.
5. **BU coverage** — workstreams and companies per Dell BU (Dell Targets / Channel Aligned).
6. **Stakeholder coverage** — % of workstreams with at least one linked Dell person; separately for Sell-In and Sell-With since stakeholders differ. This also becomes your cleanup checklist.
7. **Stakeholder reach** — unique Dell people engaged, per BU.
8. **Products aligned** — count by Dell product (PowerEdge, AI Factory, UDS, etc.).
9. **Movement since last QBR** — workstreams whose status changed in a chosen window (from the PortCo Change Log): advanced, slipped, new, closed.

## Interactions
- Clicking any chart segment filters the table and other charts.
- Table rows open the workstream in the existing editor.
- "Missing stakeholders" chip filters to workstreams with none, so you can finish cleanup from here.
- Hub tile on Dashboards showing the funnel in miniature.

## Technical details
- Route `src/routes/dashboards.dell.tsx`; tile added to `dashboards.index.tsx`.
- Pure helper `src/lib/dell-leverage.ts` (filter Dell workstreams by Sell-In Status / Sell With Dell Status presence and GTM Strategy "Dell Leverage"; stage buckets; BU rollup; stakeholder coverage via `workstream-stakeholders.ts`; movement from Change Log) with unit tests for counts and the excluded-field rule.
- Data from existing workstream/profile reads and Change Log; "unavailable" state rather than demo data.
- Component `src/components/dashboards/DellLeverageDashboard.tsx`; update dashboards AGENTS.md.

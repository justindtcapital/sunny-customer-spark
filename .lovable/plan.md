# Dashboards: one hub, three dashboards

Built in steps. Steps 1 and 2 are ready to build; step 3 still needs a few answers.

## Step 1 — Dashboards hub + PortCo dashboard

**Menu and hub page**
- Left menu "Dashboard" becomes **Dashboards**.
- Opening it shows three large tiles, each with a small live preview:
  - **PortCo Dashboard** — a mini version of today's logo-circle maturity chart.
  - **Events Dashboard** — a mini version of the monthly stacked event bars.
  - **Network Dashboard** — a mini version of the Network pyramid.
- The Network tile opens a simple "coming next" page until step 3 is built.

**PortCo Dashboard** (today's dashboard, otherwise unchanged)
- "PortCo Prioritization" becomes **PortCo Maturity**, with a view dropdown:
  - **Maturity** — today's sales vs go-to-market maturity chart.
  - **Ownership & Investment** — DTC invested dollars across the bottom, DTC ownership % up the side.
- Both views use the same logo circles, filters (action owner, investor, domain, priority) and click-to-open company panel.
- Companies missing investment or ownership are listed under the chart as "Not plotted".
- Existing links from the homepage and My Actions keep working.

## Step 2 — Events Dashboard

**Top: 12-month stacked bar chart**
- One bar per month, stacked by event category (Dell-led, pay-to-play, briefings, etc.), with the same categories and colors as the Events page.
- No month selected = the charts below show the whole year. Click a month to filter them to that month; click again (or "Whole year") to go back.
- Year selector.

**Below: grid of small bar charts**, each expandable to full size with all rows:
- Attendees per event
- Events per PortCo
- Events per domain
- Events per city
- Events per type (same categories and colors as the top chart)

Defaults unless you say otherwise: counts every event on the tracker for that month (any status); attendees = people recorded as attending that event.

## Step 3 — Network Dashboard (to discuss)

- Same pyramid and adds/removes numbers as the Network page.
- Outreach volume, outreach-to-Network conversion (Prospect to Cold), promotion rates Cold to Warm and Warm to Hot.
- Overall and by teammate: Chris Falloon, Julia Beech, Chris Hillock, Shane Earley.
- Campaigns: counts of open, active and closed campaigns, and campaigns by owner.

Questions: what counts as one outreach; how a move is credited to a teammate (contact owner, or whoever made the change); default time window.

## "Build a chart with V.I.C." (Events and Network, later)

- You ask in plain words ("events per city in 2026, AI companies only").
- V.I.C. picks from a fixed set of data and returns a chart description (what to count, grouping, filters, chart type) — it never writes code or changes data.
- The app draws it for review; you choose **Save to dashboard** or discard. Saved charts recalculate from live data.

Question: saved charts private to you, or shared with the team?

## Technical details

- Routes: `/dashboards`, `/dashboards/portco` (current dashboard moved, same owner/section search validation), `/dashboards/events`, `/dashboards/network`. `/dashboard` permanently redirects to `/dashboards/portco` with its search params; update sidebar and homepage/My Actions deep links.
- Ownership view reuses `investment` ($M) and `ownership` (fraction) from `src/lib/portco-matrix.ts`; a pure helper computes positions and the not-plotted list, with tests.
- Events dashboard reuses the Event Planner rows and category colors (`event-planner`, `event-colors`); pure helpers in a new `src/lib/events-dashboard.ts` for month buckets by category and the five breakdowns filtered by selected month, with tests (e.g. an event in March counts only under March and its category).
- Previews show "unavailable" rather than demo data. Each route gets its own head().
- V.I.C. charts: validated chart-spec schema over whitelisted datasets; saved specs in a per-teammate Cloud table under RLS; decision recorded in AGENTS.md. Add these tasks to roadmap.md when building.

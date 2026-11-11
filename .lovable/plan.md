# Dashboards: one hub, three dashboards

Built in three steps so we can talk through each before building the next. Step 1 is ready to build now; steps 2 and 3 are outlined with the questions we still need to settle.

## Step 1 — Dashboards hub + PortCo dashboard (build now)

**Menu and hub page**
- Left menu "Dashboard" becomes **Dashboards**.
- Opening it shows three large tiles, each with a small live preview so people know what's inside:
  - **PortCo Dashboard** — a mini version of today's logo-circle maturity chart.
  - **Events Dashboard** — a mini month-by-month event intensity strip.
  - **Network Dashboard** — a mini version of the Network pyramid.
- Events and Network tiles open simple "coming next" pages until steps 2 and 3 are built.

**PortCo Dashboard** (today's dashboard, unchanged otherwise)
- Title "PortCo Prioritization" becomes **PortCo Maturity**, with a view dropdown:
  - **Maturity** — today's sales vs go-to-market maturity chart.
  - **Ownership & Investment** — DTC invested dollars on the bottom axis, DTC ownership % on the side axis.
- Both views use the same company logo circles, the same filters (action owner, investor, domain, priority) and the same click-to-open company panel.
- Companies missing investment or ownership in Asana are listed below the chart as "Not plotted" rather than silently dropped.
- Existing links from the homepage and My Actions (owner + section) keep working.

## Step 2 — Events Dashboard (to discuss)

Proposed top section: a 12-month calendar heat strip showing event intensity by month, with a year selector.

Below it, a grid of small bar charts, each expandable to full size with all rows:
- Attendees per event
- Events per PortCo
- Events per domain
- Events per city
- Events per investor (through the PortCos at each event)

Questions for when we get there: which events count (attended only, or also planned/declined); whether "attendees" means DTC guests, total registrants, or both; whether investor means lead investor only.

## Step 3 — Network Dashboard (to discuss)

- The same pyramid as the Network page, including the same adds/removes (movement) numbers.
- Outreach volume, conversion from outreach to Network (Prospect to Cold), and promotion rates Cold to Warm and Warm to Hot.
- Each shown overall and by teammate: Chris Falloon, Julia Beech, Chris Hillock, Shane Earley.

Questions: what counts as one "outreach" (an email, a campaign send, any logged activity); how a move is credited to a teammate (the contact's owner, or whoever made the change); default time window.

## "Build a chart with V.I.C." (Events and Network)

Feasible and safe if V.I.C. only describes a chart and never writes code:
- You ask: "events per city for 2026, only AI companies".
- V.I.C. picks from a fixed set of data (events, attendees, contacts, rating moves, outreach) and returns a chart description: what to count, how to group, filters, bar/line/pie.
- The app draws it with the same chart style, shows it for review, and you choose **Save to dashboard** or discard.
- Saved charts are per teammate, can be removed anytime, and always recalculate from live data.

Question: should saved charts be private to you, or shared with the whole team?

## Technical details

- Routes: `/dashboards` (hub), `/dashboards/portco` (current dashboard moved, same owner/section search validation), `/dashboards/events`, `/dashboards/network`. `/dashboard` keeps working with a permanent redirect to `/dashboards/portco` carrying its search params; update homepage/My Actions deep links and sidebar.
- Ownership & Investment view reuses `investment` ($M) and `ownership` (fraction) already parsed in `src/lib/portco-matrix.ts`; add a pure helper to compute axis scales/positions and the not-plotted list, with tests (e.g. 11.6% ownership plots at 0.116, missing values excluded).
- Hub tile previews reuse existing reads (Asana PortCo data, planner rows, network pyramid) at small size; previews show "unavailable" rather than demo data.
- Each route gets its own head() title/description.
- V.I.C. charts (later): a validated chart-spec schema over whitelisted datasets, rendered client-side; saved specs in a new per-teammate Cloud table under RLS. Records the decision in AGENTS.md.

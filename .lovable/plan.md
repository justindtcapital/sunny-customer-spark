# New Dashboard: PortCo Prioritization Matrix

Replace the entire dashboard page with a fresh environment. Step one is the top pane: a bubble matrix of every portfolio company plus a live statistics panel beside it.

## What gets removed

Everything currently on the Dashboard page goes away:

- Investor dashboard pages and the sidebar "Investor Dashboards" list
- Network constellation, pulse island, instrument strip, recommendations band, thesis map
- All existing charts (Direct Introductions, PortCos Introduced, sector/prime breakdowns, chart builder, drill sheets)

The Network, Targeting, Events and PortCo pages are untouched.

## The new top pane

A wide chart, styled like the pasted reference:

- Horizontal axis: GTM maturity, 1 Premature → 5 Mature
- Vertical axis: Sales maturity, 1 Founder Led → 5 Mature & Scaling
- One bubble per portfolio company, positioned by its two Asana maturity scores
- Bubble size scales with dollars invested, with a small legend (under $5M, $5–15M, $15M+)
- Each bubble shows the company's logo inside the circle, falling back to its initials when no logo is found
- Soft dashed zones behind the bubbles labelled "GTM Assist", "BD & Exposure Assist" and "Power of Association", matching the reference layout
- Companies missing a score sit in a clearly labelled "Not scored yet" strip below the chart rather than being silently dropped
- Hovering a bubble names the company and its scores; clicking selects it

All values read live from the Asana portfolio project (maturity scores, investment, ownership, stage, priority, lead investor).

## Investor filter

A control above the chart to filter to a single lead investor (or all). Filtering dims the chart to that investor's companies and switches the statistics panel to investor level.

## Statistics panel (right side)

Follows the selection:

- Nothing selected → firm-wide aggregate
- Investor selected → that investor's portfolio
- Company bubble selected → that single company

Top block is money: total invested, average ownership, company count. Below it the relationship metrics already tracked today — introductions made, events touched, contacts connected, activity count — plus average maturity scores. Selecting a company also shows its stage, priority, lead investor and ownership.

## Technical notes

- New `src/lib/portco-matrix.ts`: parses the Asana values `GTM Marketing/PMF`, `Sales Maturity`, `DTC Investment ($M)`, `DTC Ownership`, `Lead Investor`, `Company Stage`, `DTC Priority` into a typed `MatrixPoint[]`. Scores arrive as strings like `"4 - Proven & Refining"`, so the leading integer is parsed and unparseable values become `null`.
- New `src/components/dashboard/PortcoMatrix.tsx`: SVG chart (axes, zone rects, bubbles with `clipPath`-masked logo images via the existing `logoUrls()` from `src/lib/domain-utils.ts`), selection state lifted to the route.
- New `src/components/dashboard/MatrixStatsPanel.tsx`: derives stats for the current scope from loader data (contacts, activities, portfolio events) already fetched by the dashboard loader.
- `src/routes/dashboard.tsx` rewritten: loader keeps `fetchAsanaPortcoData`, `fetchContacts`, `fetchPortfolioCompanies` and activities; drops the rest. Delete `InvestorDashboard.tsx`, `NetworkConstellation.tsx`, `PulseIsland.tsx`, `InstrumentStrip.tsx`, `RecommendationsBand.tsx`, `ThesisIntelligenceMap.tsx` and their now-unused helper modules; remove the dashboard filter pane's investor accordion from `app-sidebar.tsx` and the `investor` field from the dashboard filter context.
- Logos resolve from each company's website domain through the existing logo service; no new dependency.

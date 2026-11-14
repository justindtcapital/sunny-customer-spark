# Retiring Asana: PortCos/Workstreams and Events

Two separate projects, each in four phases: **inventory, copy, switch, cut off**. Asana stays untouched and readable until each cut-off, so we can roll back at any point. These counts come from a read-only scan of your Asana projects today.

## Part A: PortCos and workstreams

### A1. What comes from Asana today

**PortCo project: 98 companies, one Asana task each.** Numbers show how many companies have a value.

| Field | Kind | Filled | Used in app |
|---|---|---|---|
| DTC Priority | pick: Needle Mover / Nurture / Back-Burner / Exited | 97 | PortCo page, dashboard |
| DTC Investment ($M) | number | 97 | Ownership & investment chart |
| DTC Ownership | number (%) | 88 | Ownership & investment chart |
| Lead Investor | pick (Scott, Deepak, Gregg, Raman, ...) | 97 | PortCo page, signal feed |
| Company Stage | pick: Seed to Late Stage / SAFE / Exited | 89 | PortCo page |
| GTM Marketing/PMF | pick 1 to 5 | 75 | Maturity chart |
| Sales Maturity | multi-pick 1 to 5 | 75 | Maturity chart |
| Help / Influence | pick: Needs / Wants / Accepts / Resists / n/a | 48 | PortCo page |
| Portfolio Company(ies) | multi-pick (name tag) | 96 | Name matching only |
| SageTap Status / Type, Completed ST Campaigns, Available Credits | mixed | 3 to 16 | PortCo page |
| Sell With Dell - Maturity, Dell Channel Aligned, Last Pitch Reviewed, Sales Momentum, DTC - Sales Assist Activity | mixed | 1 to 11 | PortCo page |
| Assignee (owner) | person | 52 | Owner |
| Company name | text | 98 | Matching to the CRM company |

Your existing PortCo edits already save as overrides on top of Asana, so some values already live in Venture Pulse.

**Workstreams: 129 subtasks under the PortCo tasks.** They're named "Company -> GTM/BD -> Name".

| Field | Filled |
|---|---|
| Workstream Status (multi-pick: Complete, Stalled, Working to Complete, Early Conversations, No Success, Dell Leverage - Sell Through) | 93 |
| Workstream Priority (High / Med / Low) | 67 |
| Dell Targets | 41 |
| Sell-In Status | 35 |
| Next Steps | 24 |
| GTM Strategy Category | 22 |
| Dell Stakeholders | 21 |
| Sell With Dell - Maturity | 16 |
| DTC - Dell Leverage Opportunity, DTC Dell Leverage Priority | 13 each |
| Available Credits, Dell Champion | 13, 12 |
| SageTap Status, Completed ST Campaigns, Channel / Integrator Partner, Lead Investor, Portfolio Company(ies) | 10 to 11 |
| Dell Services Aligned, Dell Products Aligned | 10 each |
| Last Pitch Reviewed, DTC - GTM Assist Activity, Sales Maturity, SageTap Type, Enterprise Targets, Dell Channel Aligned, Sell In - Traction, Sales Momentum, GTM Notes | 1 to 7 |
| Assignee (owner) | 96 |
| Completed (yes/no) | 37 done |
| Due date | 3 |
| Notes | 0 |

**Other Asana links to decide on:**
- **BD and GTM activity projects:** the activity sync still pulls them. Retire them, or keep them as a read-only archive.
- **V.I.C.'s read-only Asana access:** remove it at cut-off.
- **Activity and follow-up records** that point back to an Asana task keep that link as history only.

### A2. Copy into Venture Pulse
- New **PortCo Profile** store: one row per company, keyed by the company's existing Venture Pulse ID. It holds every field above, and the Asana ID is kept for traceability.
- New **Workstreams** store: one row per workstream, linked to its company. It holds every field above, plus owner, completed and due date.
- **Pick-lists** (Priority, Stage, Lead Investor, statuses, and so on) are kept as editable option lists. Choices stay consistent and you can add new ones.
- A one-time **"Import from Asana"** step:
  - Shows a preview: matched, unmatched, and conflicts with your existing overrides. Your overrides win.
  - Writes only after you confirm.
  - Backs up first.
  - Can be run again safely without creating duplicates.
- Fields that are almost always empty (1 to 3 values) are still copied. They're hidden in the default view, so nothing is lost.

### A3. Editing on the PortCo page
- **Spreadsheet view** (new "Table" toggle on Portfolio):
  - One row per company, with columns for every profile field.
  - Click a cell to edit. Pick-list cells show a dropdown.
  - Changes save on blur, with an undo toast.
  - Columns can be shown or hidden, sorted and filtered.
- **Workstreams table:** the same grid, one row per workstream. Filter by company, GTM/BD, owner and status, and add new rows inline.
- **Company page:** the current edit dialog and the workstream editors stay. They save to Venture Pulse instead of Asana.
- Owners show as full teammate names. Every edit is recorded in a change log (who, when, before and after).

### A4. Switch and cut off
1. **Parallel run (about 1 to 2 weeks).** The app reads from Venture Pulse. A "Compare with Asana" report flags any company or workstream where the two differ.
2. **Freeze.** Asana writes are turned off in the app, and its editors save to Venture Pulse only.
3. **Cut off.** Remove the PortCo and workstream Asana reads, the cache and refresh buttons, and V.I.C.'s Asana tools. The Asana token can then be removed. A final read-only snapshot of Asana is kept as a backup.

## Part B: Events

### B1. What comes from Asana today

**Events project: 85 events.** Numbers show how many events have a value.

| Asana field | Filled | Venture Pulse tracker equivalent |
|---|---|---|
| Name, due date | 85 | Name, Start/End |
| Event Lead (DTC Sponsored / DTC Led / Briefing / Vation) | 83 | Category / primary partner |
| Event Type (In Person / Virtual) | 84 | Format |
| Portfolio Company(ies) | 79 | PortCos |
| # Event Attendees | 76 | Attendee count (no tracker column yet) |
| Invited / Accepted / Declined | 74 | DTC Status |
| Industry (AI / Data / Security / Supply Chain) | 57 | Sectors (no tracker column yet) |
| Channel / Integrator Partner | 14 | Partners |
| Enterprise Targets | about 4 | Target accounts (no tracker column yet) |
| Notes | 6 | Notes |
| Assignee | 59 | Owner |

**Current state:**
- The Event Tracker is already the main record.
- Asana is a read-only overlay ("Show Asana data", off by default).
- A one-time "Merge Asana data" action already exists.
- Some older screens still read Asana directly: the Events list page, PortCo event history, and the event picker fallback.

### B2. Reconcile
- Run a **reconciliation report** that sorts every Asana event into one of four groups:
  - **Matched:** same Asana ID or same name and date.
  - **Matched with gaps:** fields Asana has that the tracker lacks.
  - **Asana-only:** proposed as new tracker rows, for you to approve.
  - **Tracker-only:** for information.
- Add the missing tracker columns: Attendee count, Industry/Sectors and Enterprise Targets.
- Then rerun the existing merge. It fills empty fields only and never overwrites DTC Status.

### B3. Editing
- The planner's side panel already edits in place. It gains the new fields.
- Add a **spreadsheet view** of the tracker, with the same inline editing as the PortCo table, for bulk fixes.

### B4. Switch and cut off
1. Point the remaining direct-Asana screens at the tracker: Events list, PortCo event history, picker and V.I.C. event tools.
2. Remove the "Show Asana data" toggle, the merge button and the Asana event reads. The stored Asana IDs and links stay as history.

## Suggested order
1. Events (B1 to B4). It's mostly done already and lower risk.
2. Then PortCos and workstreams (A1 to A4).
3. Activity projects last, decided separately.

## Technical details
- **Storage.** A new "PortCo Profiles" sheet tab and a "Workstreams" sheet tab, with option lists in a "PortCo Field Options" tab. This matches the existing rule that CRM data lives in Sheets. The tabs are keyed by PortCo URID and a new workstream URID, and keep the Asana GID column.
  - An alternative is Cloud tables, which have no Sheets quota and get row-level permissions.
- **Read path.** A new `portco-profile.server.ts` returns the same `asanaFields`-shaped record, renamed to `profileFields`. Charts, `signal-feed`, `buildMatrixPoints` and the dashboards switch with minimal change. `Profile Overrides` are folded into the imported rows, then retired.
- **Workstreams.** `Workstream` keeps its type. `updateWorkstream`/`createWorkstream` write to the sheet with the same conflict check: re-read, compare, write the changed fields. Name prefixes are preserved per the existing rule.
- **Import.** A pure `planAsanaImport` (tested), plus a backed-up batch write, idempotent by Asana GID.
- **Cut-off.** Delete `fetchPortcoFields`, `fetchPortcoWorkstreams`, `fetchWorkstreamFieldCatalog`, `fetchAllAsanaEvents`, `fetchPortfolioEvents`, `vic-asana.*`, the Asana health check, and the `ASANA_*` env usage. Update the AGENTS.md rules that mention Asana.

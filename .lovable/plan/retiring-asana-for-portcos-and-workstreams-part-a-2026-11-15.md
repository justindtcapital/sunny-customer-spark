# Retiring Asana for PortCos and workstreams (Part A)

Events are parked for later. This covers PortCo profiles, workstreams, and the BD/GTM activity history. Asana stays untouched and readable until the final cut-off, so we can roll back at any point.

## 1. Fields we keep

**PortCo profile (98 companies):**
- **Kept as they are:** DTC Priority, DTC Investment ($M), DTC Ownership (%), Company Stage, GTM Marketing/PMF (1 to 5), Sales Maturity (1 to 5), Help / Influence.
- **Kept, rarely filled:** SageTap Status, Sell With Dell - Maturity, Dell Channel Aligned, Last Pitch Reviewed, Sales Momentum, DTC - Sales Assist Activity.
- **Lead Investor, made consistent:** one fixed investor list (Scott, Deepak, Gregg, Raman, Daniel, Omri, Yair, Radhika, Chris, Barrel, Elana). The PortCo filter, the dashboard investor breakdowns, the ownership chart and the morning brief all use this list. Stray spellings and trailing spaces are cleaned up during import. New investors are added by me, as administrator, not typed in freely.
- **Owner:** must be one of the Venture Pulse team, shown by full name. Any Asana owner that isn't on the team is listed in the import preview for you to reassign.
- **Name:** the existing Venture Pulse PortCo name. Asana's task name is used only to match.

**Workstreams (129):**
- **Kept:** Workstream Status, Workstream Priority, Sell-In Status, GTM Strategy Category, Dell Stakeholders, Sell With Dell - Maturity, DTC - Dell Leverage Opportunity, DTC Dell Leverage Priority, SageTap Status, Available Credits, Dell Services Aligned, Dell Products Aligned.
- **Status choices:** Complete, Stalled, Working to Complete, Early Conversations, No Success. "Dell Leverage - Sell Through" is dropped as a mistake. The 0 to 1 workstreams that use it are shown in the preview so you can pick a replacement.
- **Dell Targets become linked Dell people.** Each name is matched to a Dell contact in Venture Pulse:
  - one clear match is linked
  - no match is offered as "add as new Dell contact"
  - an unclear match is left for you to choose
  The workstream stores the links, so a Dell person's page can show which workstreams they're on.
- **Next Steps are not migrated.** The dated Asana next steps are dropped, and next steps are managed in Venture Pulse from now on.
- **Owner, completed, due date and notes:** Venture Pulse wins wherever both have a value. Asana only fills gaps. Owners must be on the team.

**Dropped and not copied:** Portfolio Company(ies) (on both companies and workstreams), Completed ST Campaigns, Channel / Integrator Partner (Venture Pulse already has partners), Lead Investor on workstreams, and every field not named above:
- SageTap Type
- Enterprise Targets
- Dell Champion
- Sell In - Traction
- GTM Notes
- DTC - GTM Assist Activity
- Sales Maturity on workstreams

They're hidden, not lost. Their values are kept in a hidden archive, so you can bring any of them back as a column later with the column chooser. They're also saved in the backup snapshot.

## 2. Moving the data in (done by me, as administrator, not a button in the app)
1. **Backup.** Take a full snapshot of the Asana PortCo project, its workstreams and the BD/GTM projects, saved as backup tabs.
2. **Preview, shared with you in chat:**
   - companies and workstreams matched and unmatched
   - fields where your existing Venture Pulse edits differ from Asana (Venture Pulse wins)
   - owners not on the team
   - investor names that need cleaning
   - Dell Target matches
3. **You approve.** Then it writes. The import can be run again without creating duplicates, because each row keeps its Asana ID.

## 3. BD/GTM activity history (read-only archive)
- Copy every BD and GTM activity into a read-only **Asana Archive** in Venture Pulse. Each keeps its date, owner, company, person, status, type, notes, and the original Asana link as history.
- Archived activities show on company and contact timelines labelled "Archive". They're never counted as new activity and can't be edited.
- The activity sync stops pulling from Asana.

## 4. Editing in Venture Pulse
- **Portfolio "Table" view:**
  - one row per company, with every kept field as a column
  - pick-list cells show a dropdown (fixed lists, including Lead Investor and owner)
  - click a cell to edit, saved when you leave it, with undo
  - **Column chooser:** pick which columns to show, from the kept fields plus any archived dropped field. You can add a field back if it turns out to be needed, or hide fields to keep the table small. Your choice is remembered.
  - sort and filter
- **Workstreams table:** the same grid, one row per workstream. Filter by company, GTM/BD, owner and status, and add a workstream inline.
- **Company page:** the existing edit dialog and workstream editors stay. They now save to Venture Pulse.
- Every change is logged (who, when, before and after).

## 5. Writes go only to Venture Pulse
- Every process that writes to Asana now writes to Venture Pulse:
  - creating a workstream
  - editing workstream fields and names
  - marking complete
  - setting an owner
  - adding progress or next steps
- No new workstream, action or progress is ever created in Asana again.
- An audit before go-live checks every remaining Asana read and write path, and each is removed or redirected.

## 6. Switch-over
1. **Parallel check (about 1 to 2 weeks).** The app reads only from Venture Pulse. I run a comparison against Asana and report any differences to you.
2. **Cut-off.** Remove the Asana reads, the refresh buttons, the Asana health check and V.I.C.'s Asana access. The Asana token can then be removed. Events keep their own Asana link until Part B.

## Technical details
- **Storage.** New Sheets tabs, consistent with the rule that CRM data lives in Sheets:
  - "PortCo Profiles", keyed by PortCo URID, with an Asana GID column
  - "Workstreams", with a new workstream URID, the PortCo URID, a segment column and Dell Target contact URIDs
  - "PortCo Field Options", holding the fixed option lists including the investor list
  - "Asana Archive" for the BD/GTM activities
- **Read path.** A new `portco-profile.server.ts` returns the same `asanaFields`-shaped map, renamed `profileFields`, so `portfolio.tsx`, `ownership-valuation`, `signal-feed`, `morning-brief`, `MatrixStatsPanel` and `buildMatrixPoints` change minimally. `Profile Overrides` are folded in at import time, then retired.
- **Workstreams.** The `Workstream` type is kept. `createWorkstream`/`updateWorkstream` are re-implemented against the sheet, keeping the re-read, conflict-check and changed-fields-only behaviour. The `Company -> BD/GTM -> Name` parsing is used only for the import.
- **Pure, tested helpers.** `planPortcoImport` (Venture Pulse-wins merge, investor normalisation, owner roster check, dropped fields), `matchDellTargets` (unique Dell contact or review). Dropped fields are kept in a JSON "Archived Fields" column per row; the column chooser exposes them, stored per teammate.
- **Cut-off.** Delete `fetchPortcoFields`, `fetchPortcoWorkstreams`, `fetchWorkstreamFieldCatalog`, the workstream Asana writes, `fetchActivities` from the sync, `vic-asana.*`, the Asana health check and the related AGENTS.md rules. Keep the event-related Asana code for Part B.

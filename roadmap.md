# Roadmap

## Completion note controls
- [x] Add dictation and optional dated future follow-up to Mark complete; reuse existing action saving
- [x] Nine tests passed; signed-in desktop/mobile controls verified with no overflow or runtime errors; cancelled without completing a real action
- [ ] Verify actual microphone transcription and saved completion/reminder read-back; requires audio input and an action approved for completion

## Network contact-list bulk failures — November 5 request
- [x] Inspect Network bulk controls, selection paths and available logs; prepare approval plan without changing code or contacts
- [x] Reconciled Shane's 67-contact import: 65 saved contacts and two existing prospects verified by fresh unique email/URID matches; revoked uncertain attempt and released its lock without replaying writes
- [x] Fixed literal import persistence (+phones previously coerced) and duplicate Contacts/Targets-view identity checks; actionable bulk errors and refreshes added; 16 regression tests passed and build OK
- [x] Signed-in Network flow verified with two isolated contacts: import, Cold-to-Warm promotion, Warm-to-Cold demotion, location edit/read-back, deletion/read-back; test contacts removed and no shared lock remains
- [ ] Review Jide/Ukiwe incoming fields against their preserved Prospecting profiles; waits on human identity/field review (original request retained in Admin)

## Desktop Outlook handoff
- [x] Make Open Outlook attempt the installed desktop email app through mailto (Outlook must be the default), preserving iPhone/iPad behavior and explicit web fallback
- [x] Eleven tests passed; signed-in contact button requested mailto, explicit web fallback worked, and draft survived closing; test draft discarded without sending or logging. Build OK.
- [ ] Verify launch in installed desktop Outlook; blocked by no installed Outlook app in the sandbox

## PortCo dual-sheet synchronization
- [x] Sync app company additions and edits to CRM and approved PortCo List by exact name/stable ID, with visible partial failure and safe retry
- [x] Backed up both active tabs; consolidated Hyperbolic and Pecan (2 CRM duplicates, 1 approved-list duplicate); preserved both Pecan summaries and Hyperbolic HQ; no external URID references required changes
- [x] Added 14 missing companies to approved list; active tabs now have 107 CRM companies / 112 approved entries, zero exact-name duplicates (approved-only companies retained)
- [x] Complete dynamic follow-up company choices; 17 tests pass, signed-in Hyperbolic selection and unchanged company save/reload verified; approved description read back successfully. Both readers explicitly select active tabs, never backups.

## V.I.C. draft recovery and mobile Outlook
- [x] Preserve unfinished conversations, drafts, tags, recipients and follow-up fields per account and action on this device
- [x] Try Outlook app first on iPhone/iPad, retain draft during handoff and require confirmation before completion; web fallback is explicit because iOS cannot reliably detect installation
- [x] 17 tests passed; signed-in iPad-sized preview verified close/reload restoration, discard and desktop handoff without sending/logging
- [ ] Verify Outlook app launch on an actual iPhone/iPad; blocked by no installed iOS Outlook device in the sandbox

## Action with V.I.C. refinement
- [x] Add session-only rolling conversation with visible replies, tags and clarification
- [x] Use confirmed names and automatically append approved selected PortCo descriptions; absent approved descriptions are explicitly flagged, never invented
- [x] Replace formatting nudge with tone/length choices; eleven tests passed and real signed-in draft/refinement/close-reset verified without sending or logging. Akka has no approved description in the current PortCo List. Full lint remains blocked by existing repository-wide formatting errors; focused semantic lint has no errors.

## Meeting review automation
- [x] Complete PortCo options and normalized workstream lookup in both review views
- [x] Add Investor/NWK title defaults and safe full-name contact matching from unified Contacts
- [x] Test tagging rules and verify signed-in review defaults without registering notes

## Network bulk-action fixes
- [x] Align historical fixes, bounded execution, writer coordination and saved-state reconciliation
- [x] Inspect all 22 contacts in interrupted operation fb66f977-4422-49e1-a2a7-61506a6d6e09; no automatic replay (12 complete, 10 retained)
- [x] Resolve legacy interrupted lock only after independent proof its unfenced worker is stopped; no force unlock
- [x] Fix safe, idempotent Network-to-Prospecting transfers and reconcile the list
- [x] Reconcile interrupted operation 3155327a (36 people: 18 moved, 17 untouched, 1 half-moved with complete Prospecting copy); released stale lock, marked partial; Julia's Resume finishes the rest
- [ ] Fix promotion/demotion rejections, show per-contact outcomes, and verify mixed batches/retries
- [ ] Add durable bulk-operation logging and Admin troubleshoot/fix-request/safe-retry actions
- [ ] Prevent duplicate people/event imports and repeat writes without losing tags
- [ ] Test persistence, retries, access and the signed-in Admin flow

## Network dashboard visual refresh
- [x] Refine the pyramid, statistics and controls without changing counts or data
- [x] Verify signed-in desktop and mobile layouts, views and contact filtering

## Unified My Actions feed
- [x] Merge Workstreams and Follow-ups into one My Actions tab grouped by PortCo/company
- [x] Workstream/follow-up icons, attached follow-ups under the workstream detail pane
- [x] PortCos / Network / Workstreams / Follow-ups on-off toggles; legacy tab links redirect
- [x] Verify the merged feed signed-in (grouping, toggles, deep links, merge/complete flows)

## Login and My Actions clarity
- [x] Keep only Google and email/password login
- [x] Distinguish My Actions tabs and selected state
- [x] Add workstream title editing with safe save
- [x] Include completed workstreams, follow-ups, notes and activity across all dates
- [x] Test and verify the changed flows

## Individual Granola connections
- [x] Add verified teammate identity before storing or using personal Granola credentials
- [x] Add self-service connection, replacement and disconnect controls with encrypted server-side storage
- [x] Scope manual imports and cursors to the connection; preserve original note authors and deduplicate shared notes
- [ ] Verify live connection/import/replacement/disconnect: blocked until a teammate signs in and supplies a real personal Granola key

## Action date calendar
- [x] Add compact current-month calendar with daily counts and drag selection in Date view
- [x] Test date filters and verify day/week selection and empty states

## Follow-up editing
- [x] Add an Edit panel below task controls with saved title, details, tags, owner and due date
- [x] Preserve source history and verify editing survives reload

## Follow-up readability and duplicates
- [x] Protect list width and wrap long action/merge details
- [x] Remove repeated saved reminders and legacy note summaries from follow-ups without deleting history
- [x] Test reminder rules and verify Maven actions in both sort views

## Team next-step ownership
- [x] Make four core teammates searchable with canonical identity matching
- [x] Support teammate due dates and persist next steps to each assignee's My Actions
- [x] Test identity/date rules and verify the review and assignee flows

## Bulk relationship changes
- [x] Add confirmed bulk promotion/demotion controls in Network list view and sidebar
- [x] Preserve contact data when moving Network contacts to Prospecting
- [x] Test transition rules and verify the selected-contact flow

## Homepage momentum and manual ratings
- [x] Enforce Cold promotions and manual-only saved ratings; remove auto-rating controls
- [x] Project Asana creation/completion dates and event owners
- [x] Build scoped workspace momentum and Workstreams summary on Home
- [x] Persist follow-up due dates/completion and show due/overdue/undated reminders
- [x] Add rule tests and verify signed-in homepage flows

## Homepage dashboard navigation
- [x] Pass signed-in owner and requested section from both homepage buttons
- [x] Select owner, expand and scroll to requested dashboard section
- [x] Verify both signed-in navigation flows

## Search pane cleanup
- [x] Move deep search (technology/industry/company/product/keywords) into Detailed search on Network and Prospecting
- [x] Remove the standalone Network Search box
- [x] Verify both panes signed-in

## Partners
- [x] Partners page + menu item below PortCo, four categories, seeded list, Add partner
- [x] Contacts at partner companies show in Network/Prospecting and on the partner page (Partner chip)
- [x] Partner tagging (and per-next-step partner) in Notes review and Activity review
- [ ] Partner filter in Network/Prospecting Detailed search
- [ ] Partner campaigns panel

## Event planner
- [x] Share category/status/sector/dropdown filters across all four event views; remove unused advisory council and Show declined
- [x] Attribute current events to Julia's canonical profile and add editable URL autofill to Add event
- [x] Test shared filters, verify saved attribution, and exercise live autofill
- [x] Merge cross-source event name variants, resolve sectors from portfolio data, and preserve attendee/reference links
- [x] Categorize unassigned conferences and verify saved planner results
- [x] Event database in the tracker sheet (seeded from FY2027 + Asana; CRM attendance copied)
- [x] Planner timeline: category rows, subcategory tile colors, sector dots, week/month/year with prev/next, per-view totals
- [x] Confirmed / Potential views, detail pane, add/edit, CSV import with field matching, add from link
- [x] My Actions feed polish: split company/item toggles (PortCos, Network, Port DevOps | Workstreams, Follow-ups), logo-colored icon bullets, follow-ups nest under their workstream (editor link or Action Now origin)

## Vic assistant
- [x] Place Skills and Knowledge below recent chats as direct selectable boxes and verify selections
- [x] Move Skills and Knowledge selectors to the assistant's left menu, rename visible assistant to V.I.C., and verify selection still applies to chats and the floating panel
- [x] Phase 1: Vic button on every page, Vic page with saved chats, read tools (Network, Prospecting, PortCos, Partners, Events), reviewed relationship changes and email drafts
- [x] Phase 1b: reviewed follow-up create/complete, event attendees, log action
- [x] Phase 2: Venture Pulse KB search (Drive full-text) + folder picker + cited answers
- [x] Phase 3: shared skill picker and evidence-grounded PortCo questions, company overlap, introduction matching; verified signed-in runs and saved messages after reload
- [x] Phase 3: company TXT/Markdown/CSV upload into an editable overlap draft; verified draft-before-send and completed comparison without CRM writes
- [ ] Phase 4: scheduled skills — daily digest, Monday actions, weekly report
- [x] Link past PortCo event history to 2027 potential events (Event Planner → Link past history)

## Homepage
- [x] Fresh five-panel homepage; Ask/Tell, briefing and signal scan/reconcile jobs removed; Daily Briefing + Signals tabs backed up and deleted
- [ ] Rebuild signals from scratch (PortCo signals panel, email digest archiving and intel still use old signal code)

- [x] Unified Contacts: Prospecting is a status flag; Targets archived; bulk moves are one write. Review 67 shared-email + 95 shifted-stage prospects in "Prospect Merge Review" tab.
- [x] Action with V.I.C. panel (My Actions, contacts, PortCos)

## Single-name contact repair (Shane's Nov 5 paste)
- [x] Backed up and repaired 65 contacts: full names restored, first/last split, real companies from Apollo (7 personal-email people left without a company); read-back verified
- [x] Paste contacts/targets now show an editable review table with first/last name detection
- [x] Single-name and surname-in-Company warning on paste and CSV uploads, with one-click fix

## Workstream activity trail and Asana next steps
- [x] Show a read-only Recent activity list (emails sent, logged actions, linked notes, completed follow-ups) under a workstream's follow-ups in My Actions; six tests pass, verified signed in
- [x] Remove the Asana "Next steps" field from workstream fields/editor and stop feeding it into Action with V.I.C.

## Network person types and ratings — November 11 request
- [x] Four types (PortCo/Dell/Partner/Network) with manual override; checkboxes change list and pyramid numbers; PortCo unrated; Dell/Partner badges show type + rating
- [x] Profile menu: Rating (Council–Cold + Prospect) and Type; Prospect profile gets "Move to Network · Cold"; bulk edit sets Type (incl. Automatic) and bulk promote/demote handles Prospects and skips PortCo
- [x] 34 tests passed; signed-in checkbox counts verified; type change saved, survived reload and was reverted
- [ ] Try a real Prospect ↔ Cold move; not run to avoid adding test moves to the KPI history
- [x] Coherence pass: prospects honor manual type; homepage pyramid counts every type like Network; V.I.C. introductions honor manual PortCo; bulk Status skips PortCo; 210 tests pass
- [x] Network layout: view switch alone top-right; one control bar under pyramid (types, My contacts/Everyone, Add Contact, layout); Import/Export in left menu; Merge duplicates button removed (Find duplicates kept in Import)

## V.I.C. Asana access — November 11 request
- [x] Read-only Asana lookups for V.I.C. (workstreams, task search, task details, projects, any read request)

## My Actions type checkboxes — November 11 request
- [x] Added independent Workstreams and Actions checkboxes; preserved priority sorting and verified workstreams-only and actions-only views signed in; 25 tests passed, build OK

## Dashboards — November 11 request
- [x] Shrink ownership threshold bands to 44px with smaller band logos; non-selected circles at 5% opacity; signed-in company/investor focus verified, 14 tests passed, build OK
- [x] Dashboards hub with three tiles; PortCo Dashboard with Maturity / Ownership & Investment views
- [x] Events Dashboard: monthly stacked bars by type (click a month) + five breakdown charts
- [x] Network Dashboard: pyramid + adds/removes, outreach, conversion, promotions by teammate, campaigns open/active/closed and by owner
- [x] Build a chart with V.I.C. on Events and Network (shared team charts)

# Roadmap

## Network bulk-action fixes
- [ ] Fix safe, idempotent Network-to-Prospecting transfers and reconcile the list
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

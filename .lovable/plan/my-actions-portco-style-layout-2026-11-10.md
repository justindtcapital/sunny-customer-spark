# My Actions: PortCo-style layout

Rebuild the My Actions page to look and work like the PortCo and Partners pages: chip filter rows on top, a compact list on the left, and the same detail pane on the right. Nothing about how actions are stored, owned, completed or merged changes.

## Top of the page

```text
[ small month calendar ]  My Inbox:   (Notes 25) (Activity 4)
                          My Actions: (All) (PortCo) (Network) (PortDev Ops)
                          Priority:   (All) (Must) (Should) (Could)   [x] Show workstreams   Sort by v   [Search actions]
                                                                       Completed   Merge   New workstream
```

- **Calendar:** stays, but in a compact size (smaller day cells). Click and drag-range date selection and per-day counts keep working.
- **My Inbox row:** Notes and Activity as multi-select chips with counts, like the PortCo domain chips. Both on shows notes and activity together.
- **My Actions row:** All / PortCo / Network / PortDev Ops chips with counts. These are the three kinds of action. None picked, or All, shows everything.
- **Priority row:** Must Do (green), Should Do (yellow) and Could Do (red) chips styled like the PortCo NM/NU/BB chips. They multi-select, and All clears them.
- **Show workstreams:** one on/off box, like "Show exits". On, workstreams appear with their follow-ups nested under them. Off, you see follow-ups only. The Follow-ups box goes away, since follow-ups are always the main list.
- **Completed, Merge, New workstream, Sort by:** stay in the same row, in small print.
- **Search box:** added on the right, the same as on PortCo.

## Left list

- Rows look like PortCo bars: a logo, a **shortened title** on one line, and small right-aligned chips (priority, due date, source).
- Grouping follows the chosen kind. PortCo actions group by company name. Network actions group by the contact's company, or by the contact's name if there's no company. PortDev Ops actions get their own group. With All picked, these groups appear as three headed sections, the way domains do on PortCo.
- Sort by PortCo / Date / Due date / Priority works as it does today. The non-PortCo sorts show one flat list.

## Right pane

- **Workstream selected:** the same workstream pane as today.
- **Follow-up selected:** the full title at the top, plus the current Action with V.I.C., Mark complete, Delete and similar-actions sections. The fields from today's Edit form become always-visible, editable fields: Title, Details / next steps, Due date, Action owner, PortCo / Partner / Company, Part of workstream, People connected. These are joined by read-only facts: source (Note / Activity / Granola), created date, original note link and origin/imported by. A single Save button saves your changes, and the separate Edit toggle goes away.
- Narrow screens open the detail inline below the selected row, the same as on PortCo.

## Technical details

- Build a new `ActionsFilterBar` (chips) to replace the grid `ActionsBanner`, and give `ActionCalendar` a `compact` size prop.
- Move toggle state to multi-select sets `kinds: Set<"portco"|"network"|"ops">`, `priorities: Set`, `showWorkstreams: boolean`, and `inbox`. Keep `companyKindVisible` semantics (empty set = all), and update the action-sort tests.
- Add a pure `abbreviateTitle()` in `src/lib/action-sort.ts` that strips company/track prefixes and truncates at a word boundary, with a test. The list uses it, and the pane shows the full title.
- Add a pure `networkGroupKey()` (contact company, otherwise contact name) with a test.
- The list layout reuses PortCo's `grid lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]` with the `isWide` inline fallback.
- The follow-up pane embeds `FollowUpEditor` in an always-open mode (new `inline` prop, with no close button). Saving goes through the existing journaled update function. Nothing changes on the server.
- Update `mem://features/actions-clarity` (chip layout replaces the checkbox-tile banner) and `mem://features/action-calendar` (compact).

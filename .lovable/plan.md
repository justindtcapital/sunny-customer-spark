# Build campaign from a targeting selection

Add a third bulk action next to Research (Apollo) / Promote All / Delete: **Add to campaign**. It turns any filtered + multi-selected set of targets into a campaign, in place, without leaving the targeting page.

## Behavior

1. Filter/search/select as usual. Once one or more targets are selected, a new "Add to campaign" button appears in the selection toolbar (before Delete).
2. Clicking it opens a small dialog:
   - **Campaign** — a write-in combobox listing every existing campaign already used on Targets, plus the option to type a brand-new name (same control style as the CSV upload dialog). Choosing an existing name adds to it; typing a new one creates it.
   - **Event (optional)** — leave blank or pick an event, prefilling the campaign name when the campaign box is empty, matching the upload flow.
   - **Portfolio companies** (optional) — multi-select of PortCo tags for the campaign.
   - **Flag these targets for follow-up** — toggle; when on, sets the follow-up flag on each selected target.
3. Save writes the campaign (and event / PortCo tags / follow-up flag when set) onto each selected target's row, refreshes the list, clears the selection, and shows a toast such as "12 targets added to Q4 Security Push".
4. The Campaign column, sortable header, sidebar Campaign/Event filters and the target card's Provenance block already read these fields, so the new campaign shows up everywhere immediately. Promoting the set to the CRM afterwards carries the campaign through as it does today.

Existing campaign values stay the single source of truth — no separate Campaigns tab.

## Technical notes

- New `src/components/crm/AddToCampaignDialog.tsx` reusing the campaign combobox, event picker and PortCo multi-select already built for `TargetUploadDialog.tsx`.
- Campaign vocabulary comes from the distinct non-blank `campaign` values already derived in `src/routes/targeting.tsx` (around line 505).
- Writes go through the existing `updateTargetFields` server function; `TARGET_UPDATE_HEADERS` already maps `campaign`, `event`, `portcoTags`, `followUpFlag`, `followUpDue`, so no schema change is needed. Follow-up also calls `setTargetFollowUp` so the flag and any due date stay consistent with the Track activity flow.
- Updates run sequentially through the existing rate-spaced `sheetsFetch` helper; failures are counted and reported in the toast rather than aborting the batch.
- Ops Log gets one entry per campaign assignment batch, consistent with the other targeting import/export logging.

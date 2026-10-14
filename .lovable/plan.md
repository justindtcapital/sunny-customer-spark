# Campaign list order, campaign summary, and delete

## 1. Newest campaigns first
- Sort the campaign dropdown and the past-campaigns list by date created, newest at the top. Right now they sort by last edit, so an older campaign you just changed jumps to the top.

## 2. A summary of the campaign when you pick it in step 1
Above the **Add more people** and **Action it now** buttons, show a short summary panel:
- **Size:** total people, split by Network and Prospecting (for example "24 people: 16 Network, 8 Prospecting").
- **Progress:** how many were contacted (email or LinkedIn), how many have personalized messages, and how many follow-ups are open (with who owns them and the next due date).
- **Dates:** created, last updated, and who created it.
- **Who's in it:** a short scrollable table with name, title, company, Network/Prospecting, and contacted status. Each name opens that person's card. Includes a search box.

## 3. Delete a campaign
- A **Delete campaign** button in the step 1 panel (and on each row of the past-campaigns list). It asks you to type the campaign name to confirm.
- Deleting removes:
  - the campaign itself
  - every person's membership in that campaign, so it no longer shows up on their card or in campaign filters
  - the old single campaign label on prospects, but only where it matches this campaign
- Deleting keeps:
  - the people themselves. Network contacts and prospects stay, along with their stage, location, and their other campaigns.
  - outreach and activity history already logged. That's a record of what actually happened, so it stays.
  - follow-ups already set. The confirmation message tells you how many there are, so you can clear them yourself if you want.
- Optional checkbox: **Also remove prospects that were added new by this campaign and have no other activity.** This lets you fully start over after a bad import. It's off by default.
- Every delete is recorded in the Ops Log with counts.

## Technical details
- `listCampaigns`: sort by `created` desc.
- New `getCampaignSummary(campaignId)` server fn: members plus derived counts (kind, sentChannel/sentDate, subject/body, followUpOwner/followUpDue).
- New `deleteCampaign({ id, removeNewProspects })` in `campaigns.server.ts`: delete the Campaigns row and all matching Campaign Members rows with `deleteSheetRows` (rows sorted desc). Clear the Targets `campaign` cell only where it equals the campaign name. Optional prospect removal is limited to members whose kind is prospect, whose origin was added by this campaign (`Added` matches and source is Sumble/Apollo/CSV), and who have no other memberships or outreach. Re-read before deleting to avoid a stale row index.
- Audit entry via the existing Ops Log helper. Invalidate the campaign queries and the person-campaign queries.
- Test in `scripts/campaigns.test.ts` for summary counts and for choosing which rows to delete (only rows for the target campaign id).

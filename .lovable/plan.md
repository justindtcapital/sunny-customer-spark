# Campaign Manager: list on the left, results, and closing

## What changes for you

**1. Campaign list moves to the left**
- The campaign list becomes a left column on the Campaigns page; the work area (build, message, send, results) sits to the right.
- Keep the **My campaigns / Others' / All** switch.
- New **Add new** button at the top of the list: type a name and pick a type inline, press Enter, and the campaign is created and opened — no extra screen.
- The list shows only open campaigns (draft, saved, actioning). A **Closed** toggle at the bottom shows closed ones (read-only, can be reopened by the owner).

**2. Campaign types you can spot at a glance**
- Each campaign gets a coloured type badge and a small coloured stripe in the list:
  - **Event** (Event outreach, Event follow-up)
  - **Demand** (PortCo demand gen)
  - **Network** (Network development)
  - **BD** (Business development)
  - **General** (General outreach)
- A small type filter (chips) above the list lets you show just one type.
- Existing campaigns keep their current purpose; the type is worked out from it, so nothing needs re-entering.

**3. New step 6: Results**
Steps become: Campaign → Build list → Confirm list → Message → Send & follow up → **Results**.
- Clicking an actioning campaign you own opens straight into Results.
- Each person gets a row with quick one-click choices on the right:
  - **Attending** (shown only for event campaigns) / **Interested** (other types)
  - **Follow up** — opens a small date + teammate picker and creates a dated follow-up in that person's My Actions (same as today's follow-ups)
  - **Declined / unavailable**
  - **No reply**
  - (blank = not yet marked)
- Counts at the top (e.g. 12 attending · 5 follow up · 3 declined · 20 no reply · 8 unmarked) and a filter to show only unmarked people.
- **Save and come back later** keeps your marks; the campaign stays actioning.
- Non-owners can view results but not change them.

**4. Closing a campaign**
- **Close campaign** button in Results. A confirm box summarises what will happen:
  - Everyone marked **Attending** is registered to the linked event on the Events page.
  - Follow-ups already created stay in My Actions.
  - People left unmarked are recorded as **No reply**.
- The campaign then moves to the Closed list and leaves the main view.
- If the campaign is linked to more than one event, you pick which event the attendees go to.

**5. No duplicate attendees**
- Registering checks the event's existing attendee list by email, then by full name, so someone already there (or uploaded later after the event) is never added twice.
- When an attendee list is uploaded after the event, people who were registered from a campaign are matched and confirmed instead of being added again; ambiguous name-only matches go to review rather than merging silently.
- Attendees registered from a campaign are marked as coming from that campaign, so you can tell "said yes" apart from "actually attended".

## What stays the same
- Membership remains one row per person per campaign; no contact records are edited or moved.
- Existing campaigns, members and sends are untouched.

## Technical details
- Layout: refactor `src/routes/campaigns.tsx` into a two-column shell — `CampaignList` (left, ~300px, sticky) + step workspace. Inline create calls `saveCampaignFn`.
- Types: `CAMPAIGN_TYPES` + `campaignTypeOf(purpose)` in `src/lib/campaigns.ts`; badge colours as semantic tokens in `src/styles.css`.
- Results storage: new append-only **"Campaign Results"** tab (Campaign ID, Person Key, Result, Follow-up Owner, Follow-up Due, By, At); latest row per (campaign, person) wins on read. Avoids rewriting member rows.
- Status: add `"closed"` to `CampaignStatus` (zod enum too); `done` is read as closed for legacy rows. `campaignBucket` in `network-dashboard.ts` maps closed to Closed.
- New server functions in `campaigns.functions.ts`: `fetchCampaignResults`, `saveCampaignResults` (batch, owner-checked), `closeCampaign` (owner-checked, withDeadline steps: write No-reply rows, register attendees via `addAttendees`, set status).
- Attendee rows get Kind/Status like `campaign:<id>` / `Registered`; `addAttendees` dedupe key extended to email then normalised full name. Post-event upload/reconcile treats a `Registered` match as confirm-in-place.
- Follow-ups reuse `setCampaignFollowUps`.
- Pure helpers + tests: `campaignTypeOf`, `latestResults`, `resultCounts`, `attendeesToRegister` (dedupe by email then name, skips existing).
- Update `AGENTS.md` with the results-tab and close rules.

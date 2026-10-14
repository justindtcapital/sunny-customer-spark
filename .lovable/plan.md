# Campaign Builder

A new **Campaign Builder** page, opened from a button at the bottom of the left menu under Activity. It walks through five steps, and every campaign is saved in Venture Pulse so you can reopen it, add people later, and see on each contact or prospect every campaign they've been part of.

## The wizard

```text
1 Why  ->  2 Build list  ->  3 Confirm list  ->  4 Message  ->  5 Send & follow up
```

**Step 1 - Why are you building this campaign?**
- Name the campaign (required, must be unique).
- Pick a purpose: Outreach, Business development, Network building, Event, Event follow-up, Demand gen, PortCo demand gen, General follow-up.
- Based on the purpose, tag it to existing items: events (event picker), portfolio companies (multi-select), and an optional owner.

**Step 2 - Where do I build my list from?** (can be repeated in rounds)
- **Our own people:** Network, Prospecting, or both, using the same filters those pages already have (sector, location, seniority, title, temperature, campaign, event, etc.). Pre-filled from the campaign's tags where it makes sense (e.g. people tied to the chosen event or PortCo).
- **Get more (external search):** Sumble, Apollo, or both, reusing the search we already built in Find / Network Search.
- **Upload:** CSV or paste, using the existing prospect upload mapping.
- Each round adds to a running list with a counter ("42 people - 30 Network, 8 Prospecting, 4 new from Apollo"). Duplicates are merged by email, then name + company.

**Step 3 - Confirm the list**
- Table of everyone with source, title, company, email, LinkedIn. Remove people, or go back for more.
- On confirm: the campaign is tagged onto every person; anyone new from search/upload is added to Prospecting (stage "Prospecting", source Sumble/Apollo/CSV, tagged with the campaign, event, PortCos and Contact Prime).

**Step 4 - Message (AI script builder)**
- Choose channel: Email, LinkedIn message, or both.
- Script builder asks: objective, key message, tone, length, and call to action (dinner/event signup link, PortCo link, any other link). For event or follow-up campaigns it adds the event details and PortCo blurbs automatically.
- Attach materials: upload a file; it's stored in the team's Google Drive and inserted as a share link (emails opened from links can't carry real attachments).
- AI drafts a template with placeholders (name, role, company). You can edit and redraft.
- **Personalize** button: writes a light, per-person version using their title, company, role, and work history from Apollo enrichment plus public web info. Each draft is editable on its own row.

**Step 5 - Send & follow up**
- One row per person with an **Open email** button (opens a new Outlook message with To, subject and body filled in so you edit and hit send) and, for LinkedIn, **Copy & open LinkedIn** (copies the message and opens their profile; LinkedIn doesn't allow pre-filled messages).
- Clicking either logs an outreach entry on that person ("Campaign: Q4 Security Dinner - email opened") and marks them as contacted.
- Follow-ups: set a follow-up flag for yourself or any teammate (Chris Falloon, Chris Hillock, Shane Earley, Julia Beech) in N days / weeks / months, for everyone or chosen rows.
- Finish saves the campaign summary (people, messages, links clicked, follow-ups) and logs it in the Activity log.

## Seeing campaigns elsewhere
- Contact cards and prospect cards gain a **Campaigns** list (name, purpose, date, status).
- Network and Prospecting campaign filters include builder campaigns.
- Campaign Builder page has a list of past campaigns to reopen and continue (add people, re-send, set more follow-ups).
- Promoting a prospect to the CRM keeps its campaign history.

## Limits to know
- Outlook links open Outlook on your computer (or whatever handles email links); very long personalized bodies can be cut off by some mail apps, so a "Copy body" button is included as backup.
- LinkedIn messages can't be auto-filled; the copy-then-open flow is the closest option.
- Personalization uses Apollo data and public info, not direct LinkedIn profile reading (LinkedIn doesn't allow that). Apollo enrichment uses Apollo credits.

## Technical details
- New route `src/routes/campaigns.tsx` (own head metadata), sidebar link under Activity in `app-sidebar.tsx`.
- Storage stays in Google Sheets like the rest of the app: new tabs **Campaigns** (id, name, purpose, events, portcos, owner, channel, template, status, created) and **Campaign Members** (campaign id, person urid, kind network|prospect, personalized subject/body, sent channel/date, follow-up owner/due). Created with `ensureColumn`/tab provisioning in `sheets.server.ts`. Existing single `campaign` column on Targets/Contacts stays and is set to the latest campaign for backward-compatible filters.
- New `src/utils/campaigns.functions.ts`: createCampaign, listCampaigns, getCampaign, addMembers (dedupe + new prospects via existing addTargets path), saveDrafts, logCampaignSend (appendInteractionRows / outreach rows), setCampaignFollowUps (setTargetFollowUp + contact follow-up flag with owner).
- AI: draftCampaignTemplate and personalizeCampaignMessages via the existing Gemini helper (`callGeminiJSON` / gems), batched to stay within limits; personalization pulls Apollo `people/bulk_match` employment history for members lacking it.
- External search reuses `sumble.server.ts` and `apollo.server.ts`; upload reuses TargetUploadDialog parsing.
- Attachments via existing `drive.server.ts` upload, returning a share link.
- Outlook links: `mailto:` with encoded subject/body; LinkedIn via clipboard + profile URL.
- Wizard state kept in the page and saved to the Campaigns tab at each step so a draft can be resumed.
- Rules added to AGENTS.md; tests for dedupe/merge and follow-up date math in `scripts/`.

## Build order
1. Storage + campaign list + steps 1-3 (internal list, upload, confirm, tagging, new prospects).
2. External Sumble/Apollo rounds.
3. Step 4 AI drafting + personalization + attachments.
4. Step 5 links, logging, follow-ups, and Campaigns on contact/prospect cards.

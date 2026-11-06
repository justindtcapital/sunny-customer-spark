# Morning Brief: Claude Cowork email → enriched V.I.C. brief

## What you'll get
Every morning shortly after Claude Cowork's 5:00 AM email lands in the Workspace inbox, Venture Pulse will:
1. Find the email with subject **"Daily meeting brief – PortCo & Critical"** (today's date, newest one wins).
2. Read each meeting Cowork listed (title, time, attendees, likely topic, things to consider).
3. Match attendees and companies to Venture Pulse records and add, per meeting:
   - **PortCo context** — status (NM/NU/BB), open workstreams and their latest updates, recent notes, upcoming events.
   - **People context** — relationship level, last touches from interaction trail, open follow-ups you owe them, campaigns they're in.
   - **Event context** — if the meeting relates to an Events DB event, attendees and prior-year history.
4. Have AI write a single combined brief: short "Today at a glance", then one section per meeting with Cowork's points plus the Venture Pulse additions, and a closing "Also on your radar" (overdue actions, today's events).
5. Save it and show it in a new **Morning Brief** panel on the homepage (just for you), with a link to open the full brief and past days.
6. Email the enriched brief to your dell.com address.

Nothing is written to contacts, PortCos or actions — the brief is read-only. Suggested follow-ups appear as links to My Actions / V.I.C., never auto-created.

## Reading Claude's email (based on your sample)
Claude's format is already consistent, so V.I.C. splits it into:
- **Meetings** — each block starting "8:30 AM PT: Title (Tag, Platform, Length)" becomes one meeting with time, title, tag (PortCo / Critical), platform, duration, and the narrative paragraph (people, roles, email timeline, suggested prep).
- **Gaps** — kept as a note at the end.
- **Top priorities** — kept, then re-ranked with Venture Pulse facts (e.g. an overdue follow-up to Matt Darcy moves up).
People and companies are pulled from the paragraph text (e.g. "Sam Nagar", "Terragrit", "MavenAGI", "Boomi"), since the sample lists names rather than emails. Names only match a Contacts record when unique; otherwise listed as "Check: possible match".

Example of what gets added for the Terragrit meeting: Terragrit's NM/NU/BB status and open workstreams, Julia's Terragrit vs MavenAGI notes, MavenAGI's current workstream status, any open actions with Sam Nagar, and Mubina Dunn's DTC Tech Week attendance from the Events DB.

## How Claude's brief and Venture Pulse context combine
Think of it as three layers per meeting, merged in this order:

```text
1. Claude Cowork (what's happening)   -> meeting, time, attendees, likely topic, Outlook email/meeting signals
2. Venture Pulse facts (what we know) -> matched people, PortCos, workstreams, actions, notes, events
3. V.I.C. synthesis (so what)         -> prep points, open loops, suggested asks
```

**Matching:** attendee emails/names from Claude are matched to Contacts (and teammates via the roster); company names are mapped to official PortCo/Partner names. Unmatched people are listed as "Not in Venture Pulse" — never guessed.

**What gets pulled per meeting (fixed, short windows so the brief stays readable):**
- **Actions:** your open follow-ups with these people/companies (overdue first, then due in 7 days), plus anything completed in the last 14 days.
- **Workstreams:** each active workstream for the PortCo — status, priority, owner, last update date and a one-line latest update.
- **Recent notes:** last 3 reviewed meeting notes / Granola notes for the company or people (last 60 days), each reduced to 1–2 sentences + any agreed next steps.
- **Relationship history:** relationship level, last touch date and channel, campaigns they're in, events attended in the last 12 months.
- **Upcoming:** Events DB events in the next 30 days involving the company or people.

**Merge rules:**
- Claude's points are kept and labelled "From your Outlook"; Venture Pulse additions are labelled "From Venture Pulse" so you always know the source.
- Where both say the same thing, it's shown once. Where they disagree (e.g. Claude says "new deal discussion" but the workstream is Back Burner), V.I.C. flags it as "Worth checking".
- Each meeting ends with 2–4 prep points written by V.I.C. using only the facts above (no invented facts), each linking to its source record.
- A "Today at a glance" top section: number of meetings, PortCos involved, overdue actions touching today's attendees.

## Standing sections after the meetings (from Venture Pulse only)
- **Due this week** — your open My Actions items due today through Sunday, overdue first, each with person/company and a link.
- **Anticipated follow-ups** — things that have gone quiet: active workstreams with no update in 21+ days, Warm/Hot contacts or PortCo contacts with no touch in 45+ days, and confirmed note next steps with no matching completed action after 14 days. Capped at the top 8 by importance (NM PortCos and Hot contacts first). V.I.C. suggests a one-line next step for each; nothing is created automatically.
- **Active campaigns** — each active campaign with member count, how many contacted vs not yet, and any members in today's meetings.
- **Next DTC events** — the next 5 Events DB events (next 30 days) with date, location, PortCos tagged, and any of today's attendees on the list.

The quiet-period thresholds (21 / 45 / 14 days) are starting values you can change later.

## Things to confirm while building
- **Sending email:** confirmed — the Workspace mailbox connection gets reconnected with "send" permission (one-time Google prompt on My Actions where the mailbox is connected), and the brief is sent from it to your dell.com address.
- **Corporate filtering risk:** Dell mail filters may quarantine an external auto-email; the homepage copy is always there as backup.
- **Timing:** runs at 5:30 AM Pacific, with retries at 6:00 and 6:30 if Cowork's email hasn't arrived. A "Rebuild brief" button on the panel lets you run it on demand.
- **Format from Cowork:** works best if Cowork keeps a consistent per-meeting structure (I'll suggest a short template you can paste into your Cowork instructions). Free-form text still works; AI extracts it.

## Technical details
- New scheduled route `/api/public/cron/morning-brief` (managed HTTP schedule, auth via existing cron auth helper), single-flight lock + "already built today" check so reruns never duplicate briefs or emails.
- Inbox search via existing `searchGmailRaw` with `subject:"Daily meeting brief – PortCo & Critical" newer_than:1d`, constrained to Cowork's sender address.
- Enrichment reuses existing read functions (contacts by email via teamMemberFor/unified Contacts, PortCo canonical names, workstreams, follow-ups, Events DB, interaction trail) in a pure `src/lib/morning-brief.ts` assembler with tests.
- AI: Lovable AI Gateway, default chat model on Responses API, streamed server-side, structured output (sections/meetings). Errors 402/403/429 pause and show on the panel.
- Storage: new Lovable Cloud table `morning_briefs` (owner, date, source message id unique, cowork text, enriched JSON/markdown, email status) with RLS owner-only.
- Homepage: new panel in `HomePanels.tsx` + `/brief` route for full view and history.
- Email: Gmail `messages/send` from the connected Workspace mailbox (needs `gmail.send` scope added to mailbox OAuth), HTML rendered from the same brief; idempotent by brief id.
- AGENTS.md rule: briefs are read-only syntheses keyed by source email id; one per day per owner.

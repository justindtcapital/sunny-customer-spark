# Auto-logging outreach and follow-ups for Targets

## Answer first: how it works today

- A target's **Outreach Trail** only fills from things you do inside the app: sending a draft email from the target card, saving a connection plan (logged as a "Strategy" entry), or manually logging an attempt. Each of these appends a row to the `Target Outreach` sheet tab.
- Just **opening** a target's card records nothing, and clicking a name never creates a follow-up.
- Gmail/Asana activity sync does run, but it only attributes email to **Contacts** in the Network: it writes read-only interaction rows on the `Notes` tab (plus PortCo exposure rows). Targets are not part of that matching, so email you send to someone who is still a target lands nowhere visible on their target card.
- Follow-ups today are a `Follow Up Flag` on the Contacts tab (set at import or manually) plus follow-up interaction notes. Targets have no follow-up concept at all.

So the gap is real: pre-promotion outreach to targets is invisible unless you send it from inside the app.

## What to build

### 1. Attribute alias email to Targets, not just Contacts

Extend the existing Gmail/Asana sync so that after it matches Contacts, it makes a second pass matching remaining activity to Targets by email (and name + company as a fallback). Each match appends an entry to that target's Outreach Trail with method `Email`, the message date, and the extracted email excerpt — the same excerpt logic already used for contact notes. Deduped on the activity GID so re-syncing never doubles entries.

Result: emailing a target from your BD/GTM alias shows up on their card automatically, with the campaign/event context already on the target.

### 2. Follow-up state for Targets

Add a follow-up flag and due date to the Targets tab, exposed as:

- **A "Flag this upload for follow-up" toggle on the target CSV upload dialog** — one switch that turns the follow-up flag on for every person ingested in that upload. Ideal for event rosters.
- A "Flag for follow-up" toggle on the target detail card, with an optional date.
- Resolving a follow-up from the card logs a "Follow-up resolved" entry to the Outreach Trail rather than deleting anything.

### 3. Track-activity popup on the target's email

Clicking a target's email address opens a small **Track activity** dialog instead of only launching a mail client:

- Activity type: **Cold outreach** or **Follow-up** (one or the other).
- Optional multi-select of **portfolio companies mentioned**.
- Optional short note and a date defaulting to today.
- **Set a future follow-up / reminder**: a checkbox plus a date (with quick "in 1 week / 2 weeks / 1 month" presets). Checking it flags the target for follow-up and sets the due date, so the target shows up under the "Needs follow-up" filter and gets an overdue badge once the date passes.

On save it appends one Outreach Trail entry with that type, note, and the PortCos mentioned; when PortCos are selected it also writes the matching PortCo exposure rows so the mention shows up on those company views. Logging a Follow-up activity without setting a new reminder resolves any pending follow-up on that target.

### 4. Make follow-ups visible

- A "Needs follow-up" filter in the targeting sidebar and a small badge on rows/cards that are flagged or overdue.
- Carry the flag through promotion to CRM so a pending follow-up survives the move into the Network.

### 5. Keep provenance in the trail

When a target arrives from a campaign or event, seed one Outreach Trail entry ("Added via campaign X / event Y") so the trail reads as a full history from first touch rather than starting at the first email.

## Technical notes

- `src/utils/activity-sync.functions.ts`: add a targets pass after the contacts loop, reusing `loadAllTrackActivities` output and the email excerpt helper in `src/lib/email-excerpt.ts`; write via `appendTargetOutreach` in `src/utils/sheets.server.ts`, keyed on the target URID with the activity GID stored for idempotency.
- `Target Outreach` headers gain `Source GID` and `PortCos Mentioned` columns (`ensureColumn`, non-destructive) so dedupe survives re-sync and mentions persist.
- Targets tab gains `Follow Up Flag` and `Follow Up Due` columns, added header-aware; `buildTargets` reads them into `TargetLead`, and a new server function toggles them.
- Upload dialog: one boolean passed through `importTargets` into `appendTargetRows`, stamping `Follow Up Flag` = TRUE for every row in that import. No other change to the upload flow.
- New `TrackActivityDialog` component opened from the email link on the target card; saves through `logTargetOutreach` plus the existing PortCo exposure upsert.
- `TargetingFilters` gains a `followUp` filter; sidebar control sits with the other target filters.
- `promoteTargetsToCrm` passes the flag into `addContactRow`'s existing `followUp` input.

## Out of scope

- Reading your personal mailbox — attribution stays on the configured BD/GTM aliases.
- Calendar meetings, LinkedIn, or automated reminder emails.

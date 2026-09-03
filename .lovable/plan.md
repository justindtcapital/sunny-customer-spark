# Campaign, PortCo tags, and Event source on target CSV upload

Add new tagging controls to the "Upload targets (CSV)" dialog under the existing Source dropdown, and persist everything to Google Sheets.

## What you'll see

On the CSV upload screen, below Source / auto-enrich:

1. **Source** gains an **Event** option. Choosing it reveals an **Event** picker right below, listing the events already in the app (sourced from Asana, same list the Events page uses). Picking one auto-fills the Campaign field with a sensible default like "Follow-up — Data Summit (Sep 2026)", which you can still edit.
2. **Campaign** — a single combobox: pick a campaign you've used before or type a brand-new one. Free text is always allowed.
3. **PortCo tags** — an optional multi-select of portfolio companies (same list the Portfolio page uses). Tag one or many when a list is built on behalf of specific portcos.

Campaign and PortCo tags are optional; leaving them blank imports exactly as it does today. Every row from that file gets the chosen source, event, campaign, and portco tags stamped on it.

```text
Source            [ Event           v ]   [x] Auto-enrich with Apollo
Event             [ Data Summit 2026 v ]   (only when Source = Event)
Campaign          [ type or pick...  v ]
PortCo tags       [ VAST Data, Acme  v ]   (multi-select, optional)
```

## Where the data lives (Google Sheets)

No new tab. The **Targets** tab gains columns, appended non-destructively via the existing `ensureColumn` path so no current column shifts:

- `Campaign` — free text, the reason the list exists.
- `PortCo Tags` — comma-separated list of portfolio company names.
- `Event` — the event name when Source = Event (keeps the link explicit and reportable).

The Campaign dropdown's options are simply the distinct non-blank values already in the `Campaign` column, so past campaigns appear automatically and there's nothing extra to keep in sync.

## Technical outline

`src/lib/types.ts`
- Add `"Event"` to `RECORD_SOURCES`; map event-ish legacy strings in `normalizeSource`.

`src/utils/sheets.server.ts`
- Add `Campaign`, `PortCo Tags`, `Event` to `TARGET_HEADERS` plus header aliases (`campaign`, `portco tags`, `portfolio tags`, `event`).
- In `appendTargetRows`: `ensureColumn` for the three new headers and include them in `valueByHeader` (writes stay header-aware, so alignment is safe).
- `buildTargets`: read `campaign`, `event`, and parse `portcoTags` into `string[]` on `TargetLead`.

`src/utils/sheets.functions.ts`
- New server fn `fetchTargetCampaigns` returning the distinct campaign values from the Targets tab.
- Extend `importTargets` input with `campaign?`, `event?`, `portcoTags?: string[]`; pass through to `appendTargetRowsServer`.
- Include campaign / event / tag counts in the existing Ops Log import entry.

`src/components/crm/TargetUploadDialog.tsx`
- New state `event`, `campaign`, `portcoTags`; cleared on reset.
- Event picker reuses the existing `src/components/events/EventPicker.tsx`, rendered only when `source === "Event"`; selecting an event pre-fills `campaign` if the field is untouched.
- Campaign control: write-in combobox (same shape as `LocationCombobox`) seeded from `fetchTargetCampaigns`.
- PortCo tags: multi-select popover with checkboxes, options passed in from the Targeting route loader's `companies`.
- Include all three in the `importTargets` payload.

`src/routes/targeting.tsx`
- Pass `companies` into `<TargetUploadDialog />`.

## Not in this pass

Showing/filtering targets by campaign, event, or portco tag in the list view, and adding the same fields to the paste dialog and "+ New Target" form. The sheet columns from this pass already support it, so that's a quick follow-up whenever you want it.

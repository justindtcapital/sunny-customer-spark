# Campaign + PortCo tags on target CSV upload

Add two new tagging controls to the "Upload targets (CSV)" dialog, directly under the existing Source dropdown and Apollo auto-enrich checkbox, and persist both to Google Sheets.

## What you'll see

On the CSV upload screen, below Source / auto-enrich:

1. **Campaign** — a single combobox that lets you either pick a previously used campaign or type a brand-new one. Typing a new name saves it so it appears in the list next time. Example: "Follow-up — Data Summit Sep 2026".
2. **PortCo tags** — an optional multi-select of portfolio companies (the same list the Portfolio page uses). Tag one or many when a list is built on behalf of specific portcos.

Both are optional; leaving them blank imports exactly as it does today. Every imported row from that file gets the chosen campaign and portco tags stamped on it.

```text
Source            [ CSV Import      v ]   [x] Auto-enrich with Apollo
Campaign          [ type or pick...  v ]
PortCo tags       [ VAST Data, Acme  v ]   (multi-select, optional)
```

## Where the data lives (Google Sheets)

- **New tab: `Campaigns`** — the campaign vocabulary. Columns: `URID`, `Campaign`, `Notes`, `Created`, `Last Used`. Created automatically on first use; new write-in campaigns are appended here (case-insensitive dedupe so "Data Summit" isn't stored twice).
- **Targets tab** gains two columns, appended non-destructively via the existing `ensureColumn` path so no current column shifts: `Campaign` and `PortCo Tags` (portco tags stored as a comma-separated list of company names).

## Technical outline

`src/utils/sheets.server.ts`
- Add `campaigns: "Campaigns"` to `TAB_NAMES`; add `CAMPAIGN_HEADERS`.
- Add `Campaign` and `PortCo Tags` to `TARGET_HEADERS`, plus header aliases in the targets alias map (`campaign`, `portco tags`, `portfolio tags`).
- In `appendTargetRows`: `ensureColumn` for both new headers and include them in `valueByHeader` (writes stay header-aware/positional-safe).
- `buildTargets`: read `campaign` and parse `portcoTags` into `string[]` on `TargetLead`.
- New helpers: `fetchCampaignRows()`, `upsertCampaign(name)` (append if unseen, else bump `Last Used`).

`src/utils/sheets.functions.ts`
- New server fns `fetchCampaigns` (GET) and `saveCampaign` (POST).
- Extend `importTargets` input with `campaign?: string` and `portcoTags?: string[]`, pass through to `appendTargetRowsServer`, and `upsertCampaign` once per import when a campaign is supplied.
- Log campaign + tag counts into the existing Ops Log import entry.

`src/components/crm/TargetUploadDialog.tsx`
- New state `campaign`, `portcoTags`; reset with the rest.
- Campaign control: a write-in combobox (same shape as `LocationCombobox`) seeded from `fetchCampaigns`.
- PortCo tags: multi-select popover with checkboxes, options from the Targeting route loader's `companies` (passed in as a prop so no extra fetch).
- Include both in the `importTargets` payload.

`src/routes/targeting.tsx`
- Pass `companies` into `<TargetUploadDialog />`.

## Not in this pass

Displaying/filtering targets by campaign or portco tag in the list view, and adding the same two fields to the paste dialog and the "+ New Target" form. Say the word and I'll add them next — the sheet columns from this pass already support it.

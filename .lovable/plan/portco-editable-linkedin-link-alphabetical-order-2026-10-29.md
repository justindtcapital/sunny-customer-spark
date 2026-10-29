# PortCo: editable LinkedIn link + alphabetical order

## 1. Editable LinkedIn URL

What changes for you
- The company Edit dialog gets an optional "LinkedIn page" field, prefilled when you reopen it. You can change it or clear it.
- If what you type isn't a LinkedIn company page link, an inline error appears and Save is disabled. Short forms like `linkedin.com/company/acme` are accepted and turned into a full `https://` link.
- The company details panel already shows a "LinkedIn Profile" link when one exists; it stays and opens in a new tab. It disappears once cleared.

Approach
- The Portfolio sheet already has a "LinkedIn URL" column, and new companies already save to it. Only editing is missing.
- Add a `linkedinUrl` option to the company update on the server. Leaving it out leaves the cell untouched; an empty value clears it. It is cleaned up with the same LinkedIn formatter contacts use. Asana-only companies get a new row, as other edits already do.
- Add a small checker for LinkedIn links (must be on linkedin.com, path `/company/…`, `/school/…` or `/showcase/…`) and use it in the dialog and on the server.
- Edit permissions and styling stay as they are. Companies with no link keep working.

Risks
- Automatic enrichment only fills blank cells, so it won't overwrite a link you enter. After you clear a link, a later enrichment could fill it again. That's acceptable, and I'll mention it rather than block it.

## 2. Alphabetical company order

What changes for you
- Companies inside each sector group sort A–Z, ignoring capital letters and extra spaces at the start or end. Sector groups stay A–Z as they are now.
- A new company appears in its correct place right after it's added, with no refresh. Renamed companies move to their new position as well.
- Filters and search behave the same as before.

Approach
- Sort inside the existing filtered list, so the first load, additions, renames and refreshes all share one rule.
- Use a shared `compareCompanyNames` helper (trim, case-insensitive, with ties broken in a fixed order).
- After an add, put the new company into the list straight away, then refresh from the sheet in the background.

Risks
- Minimal. Selection checkboxes and bulk actions use IDs, not positions, so they are unaffected.

## Tests
- LinkedIn checker: accepts company/school/showcase links, with or without `https://` or `www.`. Rejects personal `/in/` profiles, other sites and junk text. An empty value is allowed.
- Name sort: " beta", "Alpha" and "alpha2" sort in the correct order, case and spaces are ignored, and the order is stable.

## Technical details
- `src/utils/sheets.server.ts` `updatePortfolioCompany`: add `linkedinUrl?: string`, ensure the "LinkedIn URL" column exists and write the formatted value. Pass it through the existing update server function's input check.
- `EditPortfolioCompanyDialog.tsx`: add a field, its state, inline error and save payload. Update the company in place afterwards using `onUpdated`.
- New `src/lib/portco-fields.ts` holding `isLinkedInCompanyUrl` and `compareCompanyNames`, with tests in a matching `.test.ts` file.
- `src/routes/portfolio.tsx`: sort `filtered` with `compareCompanyNames`. Make sure the add-company callback adds the company to `companies` locally.

## 3. Automatic logo for newly added companies

What changes for you
- When you add a company, its logo appears on the card and in the details panel straight away.
- The logo is found from the company's website. If no website was entered, it uses one the add-company search found. If no logo is found, you see the company initial, as you do today.
- The Add Company dialog shows a small logo preview once a website is known, so you can see the result before saving.

Approach
- Reuse the logo finder already used elsewhere in the app (it tries Logo.dev first, then free favicon sources). Point the PortCo cards and details panel at it instead of the card's own older lookup, so all new and existing companies get the same results.
- Nothing extra is saved. The logo comes from the website each time, so changing the website updates the logo too.

Risks
- Companies without a website, or with a generic one, show the initial. Companies whose website is a shared site (LinkedIn, Crunchbase) are skipped, so no wrong logo appears.

Technical: `PortfolioCard.tsx` `getLogoUrl` → `resolveCompanyLogoDomain` + the logo ladder in `src/lib/domain-utils.ts`. Add a preview to `AddPortfolioCompanyDialog.tsx`, and use the enriched website as the fallback.

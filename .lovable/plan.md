# Missing PortCo logos and details (Arena, DensityAI, Intelligent Machines, Nox Security, Protocol Nine)

## What I know so far
- Logos come only from a company's website. With no website, the card shows initials.
- PortCo companies come from two places: the Portfolio Companies sheet, and Asana portcos that have no sheet row ("Asana-only"). Asana-only companies take their website, HQ and summary from Asana fields only, and are left blank when Asana has none.
- Web Sync and Asana Sync on the details panel fill only empty fields. They run only when you press them.
- My leading guess is that these five are Asana-only, or have sheet rows with an empty website and summary. This is **not confirmed yet**. I haven't read the live records, so confirming it is step 1.

## Plan
1. **Diagnose each company (read-only).** For each of the five, record:
   - whether it has a sheet row
   - whether an Asana task matched it, and which Asana fields it has
   - its website, HQ, summary and LinkedIn values
   - whether a logo source responds for its domain
   This sorts each company into one of four cases: no data anywhere, data in Asana that isn't mapped, a name mismatch between the sheet and Asana (for example "DensityAI" vs "Density AI"), or a lookup or logo error.
2. **Fix only the confirmed causes:**
   - **Name mismatch:** match names while ignoring spaces, punctuation and "Inc/AI" suffixes, so the sheet row and Asana task line up. Keep the existing duplicate guard.
   - **Asana fields not mapped:** widen the field-name matching, for example "Company URL" or "Web".
   - **Logo error with a valid website:** fix how the domain is read, or skip the bad logo source.
   - **No data anywhere:** nothing is invented.
3. **Make missing data visible.** On the card and details panel, a company with no website gets a quiet "No website yet" note and a button to Edit or Web Sync. A failed lookup shows a distinct "Lookup failed — retry" note, so "nothing exists" and "something broke" look different.
4. **Optional, with your OK:** run Web Sync once for the companies that end up with no data. It fills only blank fields from real sources, and I'll report exactly what it filled.

## Affected areas
- Company list building and Asana matching (PortCo page)
- Logo display, and the card and details panel empty states
- Read-only checks of the Portfolio sheet and Asana

## Risks
- Looser name matching could link the wrong company (for example, "Arena" is a common word). It will only match one-to-one with exact normalized names, and any ambiguous match is left alone and reported.
- Web Sync could find a namesake company. It runs only with your approval, and I'll show you the results.
- Sorting is unchanged.

## Tests
- Name normalization: "DensityAI" equals "Density AI", "Nox Security, Inc." equals "Nox Security", and "Arena" does not equal "Arena Club".
- Empty-state rule: no website shows "No website yet"; an error shows "Lookup failed".

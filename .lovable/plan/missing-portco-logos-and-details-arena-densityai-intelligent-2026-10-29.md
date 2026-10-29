# Missing PortCo logos and details (Arena, DensityAI, Intelligent Machines, Nox Security, Protocol Nine)

## What I know so far
- Logos come only from a company's website. With no website, the card shows initials.
- PortCo companies come from two places: the Portfolio Companies sheet, and Asana portcos with no sheet row ("Asana-only"). Asana-only companies take website, HQ and summary from Asana fields only, and are left blank when Asana has none.
- Web Sync and Asana Sync fill only empty fields, and only when you press them.
- Leading guess (**not confirmed**; I haven't read the live records yet): these five are Asana-only, or have sheet rows with no website. Step 1 confirms this.

## Plan
1. **Diagnose each company (read-only).** For each of the five, record:
   - whether it has a Venture Pulse sheet row
   - whether it has an Asana task
   - its website, LinkedIn, HQ and summary in each place
   - whether a logo source responds for its domain

   Each company then falls into one case: missing a record in Venture Pulse or Asana, no website or LinkedIn on file, the sheet and Asana disagree, or a lookup or logo error.

2. **Confirm each company's real identity.** For every company without a confirmed website or LinkedIn page, search the web for its official website and LinkedIn company page, using the name plus any Asana or sheet details (sector, HQ, summary) to rule out namesakes such as the many companies called "Arena".
   - I'll show you a short review list: company, proposed website, proposed LinkedIn page, and why I think it's the right one.
   - Nothing is saved until you approve each one. Anything uncertain stays blank and is marked "needs a website".

3. **Make sure both records exist.**
   - **Asana-only companies:** create the Venture Pulse sheet row (Edit already supports this). It stores the confirmed website and LinkedIn link, plus Asana's existing details.
   - **Companies in Venture Pulse but not in Asana:** I report them rather than creating Asana tasks, because Asana stays read-only in this app. You or a teammate can add them in Asana.

4. **Match the two records by identity, not loose names.** The sheet row and the Asana task are linked when their website domain or LinkedIn company page is the same. Exact names still work as before. Similar-but-different names (for example "DensityAI" vs "Density AI") are flagged for review, never linked automatically.

5. **Show what's missing clearly.** A company with no confirmed website shows "No website yet" and an Edit/Find button. A failed lookup shows "Lookup failed, retry". "No data exists" and "something broke" look different.

6. **Fill details only from real sources.** Once a website is confirmed, Web Sync fills blank HQ and summary fields, and I report exactly what was filled. Nothing is invented.

## Affected areas
- PortCo list building and how the sheet and Asana records match
- Logo display, plus the empty states on the card and details panel
- A one-time review list of confirmed websites and LinkedIn pages for the five companies, and any others in the same situation
- New sheet rows for Asana-only companies (no Asana changes)

## Risks
- **Namesakes:** web search can find the wrong "Arena". Every proposed site needs your approval and comes with supporting evidence.
- **Sheet writes:** new rows are added only for approved companies, and duplicate checks run first.
- **Asana gaps:** these stay a report-only to-do for the team.
- Sorting is unchanged.

## Tests
- Identity match: the same website domain or LinkedIn company page links the two records. "DensityAI" vs "Density AI" without a shared domain is flagged, not linked. Two different companies named "Arena" with different domains are never linked.
- Empty-state rule: no website shows "No website yet"; an error shows "Lookup failed".

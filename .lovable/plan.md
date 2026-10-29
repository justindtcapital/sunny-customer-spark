# Plan: Company and contact domain matching

## Fix request
Key people and company emails go missing when a company's website (e.g. `getmaven.io`) differs from its email domain (e.g. `mavenagi.com`). Add verified alternate domains and suggested matches, and stop duplicate companies or contacts from being created.

## What's wrong today
- A company's Key People list uses exact matching: a contact appears only when their email domain is exactly the domain of the company website. Any other domain (a rebrand, a regional domain, a subdomain like `eu.acme.com`) is missed.
- A company's emails are matched only by the PortCo name tag. Emails from a known company domain that nobody tagged never show up.
- Partners match by company name only, so they have the same gap.
- Adding a company checks for duplicates by name or website only. Adding a contact checks by email in some places but not all.

## What we'll build
1. **One shared domain cleanup rule.** Ignore capitals, `http(s)://`, `www.`, paths, ports and trailing dots, and treat subdomains as their main domain (`mail.acme.com` becomes `acme.com`, and `acme.co.uk` is handled correctly). Free email providers (Gmail, Outlook, etc.) are never used for matching.
2. **Verified alternate domains on each company.** Add an "Email domains" field to PortCo and Partner edit forms, stored in a new "Domain Aliases" column in the sheet. Only people on the team can add one, it is recorded in the activity log, and free email providers are rejected.
3. **Linking.** Key People and Partner contacts include anyone whose email matches the website domain or a verified alternate. Each person shows a small "via mavenagi.com" note when the match came from an alternate. Company emails also include messages from or to those domains, combined with the existing tags and without double counting.
4. **Suggested matches, review only.** A "Possible matches" strip on the company page lists contacts with similar domains (for example `maven-ai.com` or `mavenagi.co`), or contacts whose company name matches but whose domain is unknown. Each suggestion offers **Add domain as verified** or **Dismiss**. Nothing links or merges automatically, and dismissals are remembered.
5. **Duplicate checks before creating anything.**
   - *Add Company:* check the name, the website domain and all verified alternates of existing companies. If one matches, offer **Open existing** or **Add this domain to existing**, never a silent second record.
   - *Add contact* (PortCo "Add person", Apollo add, CSV/paste): check the email against both Network and Prospecting first and reuse the existing person. This builds on the duplicate rules we just added for imports.
   - A domain that already belongs to one company can't be added to another without a warning that shows both.
6. **No data loss.** Contact records and ratings are never changed by matching. "Add domain to existing" only adds to the alias list. Real merges between companies keep using the existing reviewed side-by-side approach and stay out of scope here.

## Areas affected
- Domain helpers and new tests.
- Portfolio page and company details (Key People, emails, suggestions, edit form).
- Partners matching and edit form.
- Add Company dialog and server duplicate check.
- Add person, Apollo add and import duplicate checks.
- Portfolio Companies and Partners sheet columns, added safely without rewriting existing rows.

## Risks
- **False links:** two-part country domains and shared parent domains (e.g. a holding company) could link the wrong people. Mitigation: alternates require human verification, free providers are blocked, and fuzzy matches are only suggestions.
- **Sheet columns:** a new column is added at the end and existing columns are found by header, so old rows keep working.
- **Speed:** matching runs once per page load against an index, not per company.
- **Email volume:** domain-matched emails could show internal or newsletter mail. Existing noise filters stay in place, and only external senders or recipients count.

## Tests
- Domain cleanup cases (protocol, www, path, subdomain, `co.uk`, free providers).
- Alias linking: exact, alias, blocked free provider, conflicting alias.
- Suggestions never auto-link.
- Duplicate checks for Add Company (by alias) and contact add (existing email in Prospecting).

Waiting for your approval before changing any code.

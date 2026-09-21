# Clean up workstream reporting

## What changes

1. **Remove the "last updated" date from the collapsed row.**
   In `WorkstreamsPanel.tsx` (`WorkstreamRow`), delete the date shown next to the status badge on the unexpanded row. The date stays in the expanded footer line so the info is still there one click in.

2. **Remove the owner name text that duplicates the owner badge.**
   The initials circle in the corner already shows the owner. Remove the owner name from:
   - The collapsed row's second line when there are no field chips (currently falls back to the owner name — show nothing instead).
   - The expanded footer line (currently "owner · updated …" — drop the owner name, keep the updated date there).

3. **Expanded rows show only the chosen fields per type.**
   Field lists stay as you confirmed:
   - **BD:** Status, Momentum, Channel, Targets, Stakeholders, Sell-in status, Traction, Next steps
   - **GTM:** Strategy work status, SageTap status, Last pitch reviewed, GTM maturity, Sales maturity, GTM category, Next steps
   - Blank values still show as "Not set" so the layout is stable while you fill fields in Asana.

4. **Remove the "Other fields" section entirely.**
   The expanded row no longer dumps every remaining Asana field. Expanded view is: field grid, Detail (notes/email body if present), updated date, Asana link. Nothing else.

## Technical notes

- `src/components/portfolio/WorkstreamsPanel.tsx`: remove the `lastActivity` span from the collapsed row header; drop the owner name from the collapsed fallback line and the expanded footer; remove the `extras` / "Other fields" block from the expanded view.
- `src/lib/workstream-parse.ts`: `otherFields()` and `KNOWN_FIELD_RE` become unused — remove them (the verbatim `fields` map stays on the data, so adding a field later is a one-line change to `PROGRAM_FIELDS`).
- No Asana API changes; typecheck with `bunx tsgo --noEmit`.

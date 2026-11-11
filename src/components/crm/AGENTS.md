# CRM component rules

- Bulk actions: no-write pre-flight, then undismissable BulkRunDialog progress and named receipt — prevents mid-save double submits.
- Network and Prospecting CSV uploads share BulkUploadDialog (destination prop); only the save call differs — one review flow over the unified Contacts list.
- Lock-blocked bulk runs recover inside BulkRunDialog: it polls the shared write slot, offers "Check what was saved & unlock" for any interrupted activity, and enables Retry (fresh operation id) only once the slot is free — blocked attempts wrote nothing, so retry can't duplicate.
- Paste imports (Network and Prospecting) parse via src/lib/paste-parse.ts into the shared editable PasteReview table before any save; header rows map columns, separate first/last columns are detected, and every import (paste or CSV) shows the single-name / surname-in-Company warning — prevents last names being saved as companies.
- Import identity: email, LinkedIn, or name + company is enough; phone verification compares digits only — Sheets strips "+".
- Network type toggles (PortCo, Dell, Partner) live on the Network page and filter the list and pyramid together via src/lib/contact-kind.ts; they never change ratings or records.
- Network page shows Prospecting rows as a fifth "Prospect" tier (read-only view via src/lib/network-tiers.ts); pyramid bands are independent on/off list toggles and prospect rows open their Prospecting profile — one page, no second people store. Prospect ↔ Cold moves (one-off or bulk) go through bulkChangeRelationshipLevels as in-place status flags.

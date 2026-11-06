# CRM component rules

- Bulk actions: no-write pre-flight, then undismissable BulkRunDialog progress and named receipt — prevents mid-save double submits.
- Network and Prospecting CSV uploads share BulkUploadDialog (destination prop); only the save call differs — one review flow over the unified Contacts list.
- Lock-blocked bulk runs recover inside BulkRunDialog: it polls the shared write slot, offers import "Check what was saved & unlock", and enables Retry (fresh operation id) only once the slot is free — blocked attempts wrote nothing, so retry can't duplicate.
- Paste imports (Network and Prospecting) parse via src/lib/paste-parse.ts into the shared editable PasteReview table before any save; header rows map columns, separate first/last columns are detected, and every import (paste or CSV) shows the single-name / surname-in-Company warning — prevents last names being saved as companies.
- Import identity: email, LinkedIn, or name + company is enough; phone verification compares digits only — Sheets strips "+".
- Network visibility toggles (PortCo, Dell) are read-time filters from pure helpers (src/lib/portco-contacts.ts, src/lib/dell-contacts.ts); they never change ratings or records.

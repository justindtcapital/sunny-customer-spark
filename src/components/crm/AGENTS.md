# CRM component rules

- Bulk actions: no-write pre-flight, then undismissable BulkRunDialog progress and named receipt — prevents mid-save double submits.
- Network and Prospecting CSV uploads share BulkUploadDialog (destination prop); only the save call differs — one review flow over the unified Contacts list.

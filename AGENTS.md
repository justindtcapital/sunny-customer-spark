# Project rules

- Keep workstream bar status and priority separate from segment-specific program fields so GTM and BD share the same Asana bar mapping without replacing their detail fields.- Workstream edits write only changed Asana custom fields, typed from Asana's own field metadata (enum by option gid), after a server re-read conflict check — avoids clobbering concurrent Asana edits.

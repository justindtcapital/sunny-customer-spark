# Edit workstreams and save changes to Asana

## What you'll see
- When you open a workstream, an **Edit** switch sits in its top-right corner.
- With Edit on, every field you see turns into the right kind of input, based on how Asana stores that field:
  - **Pick one** fields (Workstream Status, Workstream Priority, Momentum, Sell-in status, SageTap status, and so on) become dropdowns showing only the choices that exist in Asana.
  - **Pick several** fields become checkbox dropdowns with Asana's own choices.
  - **Free text** fields (Next steps, Stakeholders, Targets when Asana stores them as text) become text boxes. Comma-separated text is kept exactly as you type it, so nothing gets split or reordered.
  - **Number** and **date** fields get number and date inputs.
  - A **Completed** checkbox marks the Asana subtask complete or reopens it.
- **Save** sends only the fields you changed. **Cancel** throws your changes away.
- After you save, the bar updates right away. If Asana refuses a change, the old value comes back and a message says which field failed and why.
- Fields that aren't set up on that subtask in Asana stay read-only and say "Not in Asana", so the app never invents a field.

## How problems are avoided
- **Field types come from Asana.** Each field's type and allowed choices are read live from Asana, not guessed from its name. A dropdown can only send a choice that exists in Asana.
- **Choices are sent by ID, not name.** Renaming a choice in Asana won't break saving.
- **Only changed fields are sent.** Untouched fields are never overwritten.
- **Fresh check before saving.** The server re-reads the subtask first. If someone changed the same field in Asana since you opened it, the save stops and asks you to reload, so it doesn't overwrite their edit.
- **Choices you can't edit:** fields that Asana computes, or that are locked, show as read-only.
- **After saving,** the stored Asana copy is cleared so the dashboard and chart show the new values.

## Out of scope for now
- Adding new choices to an Asana dropdown from the app (you'd still do that in Asana).
- Changing the owner. We can add that later.
- Editing BD/GTM activity items. This change covers workstreams only.

## Technical details
- `src/utils/asana.server.ts`: extend `SUBTASK_FIELDS` with `custom_fields.gid,type,resource_subtype,enum_options.gid,enum_options.name,enum_options.enabled,is_formula_field,editable` (fallback `custom_field_settings` per project if `enum_options` missing). Return a new `editable: Record<fieldKey, { gid, type, options?, value, raw }>` on each `Workstream`, keyed by the same `pickField` mapping so display and edit use one source.
- `src/lib/workstream-parse.ts`: add `WorkstreamFieldMeta` type plus `editable` on `Workstream`. Keep `workstreamStatus`/`workstreamPriority` bar mapping separate from the segment-specific `PROGRAM_FIELDS` (project rule).
- New `updateWorkstreamFn` (POST, `createServerFn` in `asana.functions.ts`), Zod-validated input `{ gid, changes: { fieldGid: {type, value} }[], completed?, expectedModifiedAt }`. Server: GET task → compare `modified_at` / changed field values → build payload (`enum` → option gid or null, `multi_enum` → array of gids, `text` → string, `number` → number, `date` → `{date}`) → `PUT /tasks/{gid}` with `{ data: { custom_fields, completed } }` → `clearAsanaCache()` → return refreshed workstream. Relay Asana's status and error body to the caller.
- `WorkstreamsPanel.tsx`: Edit toggle on the expanded row; `FieldEditor` picks an input per meta type; local draft state; Save/Cancel; optimistic update through TanStack Query `setQueryData` on the Asana query, rolled back on error, with a sonner toast.
- Writes appear in Asana as changed by the owner of `ASANA_ACCESS_TOKEN`. Stay well under the 150-requests-per-minute limit: one GET plus one PUT per save.
- Add a vitest for the payload builder (enum/multi/text/number/date/null clearing).

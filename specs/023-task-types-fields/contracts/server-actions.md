# Contracts: Server Actions

Every action checks the session and its own permission. Errors return `{ success: false, error }` with a code the screens translate.

## Stage A

### `src/actions/task-types.ts`
- `saveTaskType(label, { label?, name_ar?, icon?, color?, default_priority?, default_tag_ids?, position? })` — admins. Renaming cascades. Errors: `not_authorized`, `exists`, `invalid`.

### `src/actions/task-fields.ts`
- `createField({ name_en, name_ar, kind, options, on_card, switchable })` — admins, superusers. Errors: `exists`, `invalid`.
- `updateField(id, patch)` — admins, superusers. A kind change converts values that fit and keeps the rest as text (reported as `{ kept: n }`).
- `retireField(id)` / `restoreField(id)` — admins, superusers.
- `attachField(typeLabel, fieldId, { required_from, default_value, position })` / `detachField(typeLabel, fieldId)` — admins, superusers.
- `setFieldValue(taskId, fieldId, value)` — anyone who may edit the task (canAct). Errors: `not_attached`, `invalid`, `not_authorized`.
- `setFieldValues(writes[])` — the sheets' batch path (paste, fill, undo), same checks per write.
- `makeTaskField(sheetKey, columnKey)` — admins, superusers; task sheets only. Returns `{ fieldId, moved }`.

### Move gate (`src/lib/media-server.ts`, used by `setTaskStage`, `moveTask`, `bulkUpdateTasks`, `moveThroughMedia`)
- New refusal `required_fields` with `{ fields: string[], stage: StageId }`. Checked before `allowedStages`' other refusals that need no data, after `not_authorized`.

### `src/actions/milestones.ts`
- `addMilestone({ brand_id, name, day })`, `updateMilestone(id, patch)`, `deleteMilestone(id)` — admins, superusers.

## Stage B
- `updateTask(id, { priority })` — values `Urgent | High | Normal | Low | None`; setting Urgent notifies assignees (`urgent`).
- `src/actions/tags.ts`: `setTaskTags(taskId, tagIds)` (canAct), `createTag(name, color?)` (anyone; returns the existing tag on a same-name match), `renameTag`, `recolorTag`, `mergeTags(fromId, intoId)`, `deleteTag(id)` (admins).
- `setAssignees(taskId, [{ memberId, hours? }])` — order = position; the first is the lead. Same rule as changing the assignee today (users can't assign others on tasks they don't own). Calls `changeAssigneeSpaces` when the lead changes.

## Stage C
- `updateTask(id, { start_date })` — Error `start_after_due`.

## Stage D
- `src/actions/templates.ts`: `saveTemplate(input)`, `deleteTemplate(id)` (admins, superusers), `templateFromTask(taskId, name)` (admins, superusers), `createFromTemplate(templateId, { brand_id, publish_date, space_id? })` (anyone who may create tasks).
- `src/actions/recurrence.ts`: `setRepeat(taskOrTemplate, rule)` (canAct on the task; admins/superusers on a template) — Error `lead_too_short` with `{ min }`; `skipNext(ruleId)`, `stopRepeat(ruleId)`.
- Scheduler job `runRecurring(now)` — creates due occurrences once each (`recurrence_key`).

# Server contract: `src/actions/sheet-columns.ts`

Every action:
- requires a session member;
- returns `{ success: true, … }` or `{ success: false, error }`;
- calls `revalidatePath('/board')`.

Layout actions:
- are open to every member (spec FR-003);
- take the sheet's advisory lock (research R2);
- stamp `updated_by` / `updated_at` (FR-004);
- on a sheet with no records yet, first write records for every built-in column at its default position.

| Action | Input | Effect | Errors |
|---|---|---|---|
| `addColumn(sheet, { name, kind, options?, before?, after?, set? })` | name per R12; kind; for Choice, ≥ 1 option | Creates `c:<id>` at the end, or before/after a key. On Video, `shown_in = ['full', set]` | `name_empty`, `name_long`, `name_taken`, `limit`, `bad_kind` |
| `renameColumn(sheet, key, name \| null)` | null resets a built-in to its default | Sets `name` | `name_*`, `not_found` |
| `moveColumn(sheet, key, beforeKey \| null)` | null = to the end; never before or as `title` | Renumbers positions | `not_found`, `title_fixed` |
| `setColumnShown(sheet, key, set, shown)` | `set` = `all` (Content) or `editing` · `copy` · `full` | Updates `shown_in` and clears `shown_default` | `title_fixed` |
| `resizeColumn(sheet, key, width)` | 60–600 | Sets `width` | `bad_width` |
| `updateColumn(id, { name?, kind?, options?, replace? })` | custom only; R11 | Renames, changes options, converts values in a transaction | `name_*`, `option_in_use`, `not_found`, `built_in` |
| `deleteColumn(id)` | custom only | Sets `deleted_at`; returns `{ values: n }`; purges columns deleted more than 1 day ago | `built_in`, `not_found` |
| `restoreColumn(id)` | | Clears `deleted_at`. If the name is now taken, appends " (2)" | `not_found` |
| `setValue(columnId, taskId, raw)` | raw text; empty clears | `parseValue` decides; row rule (owner, assignee, admin, superuser); refuses archived or dropped rows | `not_authorized`, `invalid:<code>`, `gone` (column deleted), `archived` |
| `setValues(columnId, entries: { taskId, raw }[])` | ≤ 500 | Same rules per entry; returns `{ saved, refused: [{ taskId, code }] }` | |

**Extended (spec 009 / 008 actions)**:
- `addPlan(...)` rows may carry `custom: Record<columnId, string>`;
- `addClips(...)` rows may carry the same.

Both re-parse the values and write `sheet_values` in their transaction. Invalid values are counted in `problems` and not stored.

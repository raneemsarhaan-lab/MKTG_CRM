# Data Model: Link a Blank Sheet's Columns to Board Tasks

Additive only. Applied with `bash scripts/migrate.sh` (`db push`). No backfill: every existing sheet starts unlinked.

## 1. Changed tables

### `sheet_rows` (Prisma `SheetRow`)

| Field | Type | Rules |
|---|---|---|
| `task_id` | uuid, null → `tasks.id`, `onDelete: SetNull` | The row's task (R1). Indexed. Null means not linked. |

### `sheets` (Prisma `Sheet`)

| Field | Type | Rules |
|---|---|---|
| `task_map` | jsonb, null | The column mapping (R2). Blank sheets only, and null on the Content and Video sheets. |

`task_map` shape:

```text
{
  taskCol: colId,                      // the Task column
  fields: { [colId]: TaskField }       // at most one column per field
}
TaskField = 'title' | 'stage' | 'due' | 'assignee' | 'owner' | 'priority' | 'platform' | 'type'
          | 'theme' | 'pillar' | 'link:doc' | 'link:design' | 'link:post' | 'link:published'
          | `col:${sheetColumnId}`
```

Validation on the server:
- every column id must be one of the sheet's columns;
- the Task column can't also be a field;
- a field appears once;
- a `col:` field must name an existing team column.

Bad entries are dropped.

### `sheet_cells`

No change. Under a mapped field, a cell holds the snapshot (R7): the last value the sheet showed for that task field.

## 2. Types (`src/types/index.ts`)

```text
TaskField                                   # as above
SheetTaskMap { taskCol: string; fields: Record<string, TaskField> }
TaskFieldValues { [field in TaskField]?: string }   # shown text per mapped field
LinkedTask { id; values: TaskFieldValues; dropped: boolean; editable: boolean; applies: TaskField[] }
SheetExtras += taskMap?: SheetTaskMap | null; rowTasks?: Record<rowId, taskId>; tasks?: Record<taskId, LinkedTask>
SheetChanges += taskMap?: SheetTaskMap | null; rowTasks?: { rowId: string; taskId: string | null }[]
TaskFieldWrite { rowId: string; field: TaskField; value: string }
TaskFieldResult { rowId: string; field: TaskField; ok: boolean; reason?: string; shown?: string; celebrate?: boolean }
```

## 3. Undo kinds (`src/lib/sheet-undo.ts`)

| Kind | Holds | Saved through |
|---|---|---|
| `taskMap` | the mapping before and after | `applySheetChanges.taskMap` |
| `rowTasks` | each row's task id before and after | `applySheetChanges.rowTasks` |
| `taskFields` | each write's row, field, value before and after | `writeTaskFields` (not the outbox: refusals need an answer) |

## 4. States of a row

```text
not linked ──(Task cell matches one task / picked / Add tasks / Create tasks)──▶ linked
linked ──(Task cell cleared or changed to no match)──▶ not linked        (snapshots stay)
linked ──(task dropped on the board)──▶ linked, shown as dropped        (edits refused like the Content sheet)
linked ──(task hard-deleted)──▶ not linked, "Task removed"               (task_id set null; snapshots stay)
```

## 5. Limits

- One Task column per sheet. Up to 20 mapped fields.
- `writeTaskFields`: up to 2,000 writes per call (a paste larger than that is sent in batches).
- `createTasksForRows`: up to 200 rows per call, like `createTasks`.

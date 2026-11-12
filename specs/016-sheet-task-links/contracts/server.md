# Server contracts: sheet task links

All of these are in `src/actions/sheet-links.ts` unless marked otherwise. Each starts with `getSessionMember()`, and an unknown sheet gives `gone`.

## Loading (`src/actions/sheets.ts`)

`loadSheet(sheetId)` adds three things to `extras`:
- `taskMap`;
- `rowTasks` (`rowId → taskId`, linked rows only);
- `tasks` (`taskId → LinkedTask`), with only the mapped fields.

`LinkedTask.editable` says whether this member may edit the task (`canAct`). `LinkedTask.applies` lists the fields the task has (R4).

## Mapping and links (`applySheetChanges`)

```text
changes.taskMap?: SheetTaskMap | null          # null removes the link (snapshots stay as plain cells)
changes.rowTasks?: { rowId, taskId | null }[]   # set or clear a row's task (undo, picks, Add tasks)
```

- Both are refused on a protected sheet unless the member is its protector or an admin (`protected`).
- `taskMap` is cleaned as data-model §1 says.
- `rowTasks` ignores rows that aren't on the sheet and tasks that don't exist (`gone`, counted in `skipped`).

## `linkColumn(sheetId, colId)`

This makes a column the Task column and resolves every row's value (R3). It is one step for undo: the client records the `taskMap` and `rowTasks` before and after.

```text
→ { success: true,
    linked: { rowId, taskId }[],
    ambiguous: { rowId, text, choices: { id, name, stage, project }[] }[],
    unmatched: { rowId, text }[],
    tasks: Record<taskId, LinkedTask> }
  | { success: false, error: 'protected' | 'gone' | 'not_blank' }
```

## `resolveTaskCells(sheetId, cells: { rowId, text }[])`

The same as `linkColumn`, but for the rows given (a typed or pasted Task cell). Up to 2,000 rows.

## `writeTaskFields(sheetId, writes: TaskFieldWrite[])` (R5)

```text
→ { success: true, results: TaskFieldResult[], tasks: Record<taskId, LinkedTask> }
  | { success: false, error: 'protected' | 'gone' | 'too_many' }
```

- Each write is checked on its own, so one refusal doesn't stop the rest.
- Reasons are `not_authorized`, `not_applicable`, `not_linked`, `bad_value`, `unknown_member`, `not_allowed_move` (with the move rules' reason), `dropped` and `not_link`.
- A saved write also stores its snapshot in `sheet_cells` (R7), with the shown text the result carries.
- `celebrate` is true when the board would celebrate the stage move (constitution §V).
- `revalidatePath('/board')` runs once per call.

## `refreshTaskFields(sheetId)` (R6)

```text
→ { success: true, tasks: Record<taskId, LinkedTask>, gone: rowId[] }
```

- It reads only linked tasks and only mapped fields.
- Changed snapshots are written in the same call.
- `gone` lists rows whose task was hard-deleted, now unlinked.

## `searchTasks(query, filters)` (Add tasks…, Choose a task)

```text
query: string; filters?: { stage?: StageId; personId?: string; projectId?: string }
→ { success: true, tasks: { id, name, stage, project, assignee, dropped }[] }   # up to 50, title match first
```

## `createTasksForRows(sheetId, rows: { rowId, values: TaskFieldValues }[], shared: { due?: string })` (R8)

```text
→ { success: true, created: { rowId, taskId }[], problems: { rowId, reason }[] }
  | { success: false, error: 'protected' | 'not_authorized' | 'too_many' }
```

- It needs `requireTaskCreator`. Members with access `user` get `not_authorized`, and the menu says why.
- Tasks are created in `todo`, with no project, owned by the creator unless an Owner value is given.
- Each task gets the same followers and notifications as `createTask`.
- Rows are linked, and their Task cell gets the task's link, in the same transaction.

## Guards (checked in the smoke test)

- **Protected sheets:** another member can't map, link, write fields or create tasks.
- **Task rules:** a member who isn't the owner, the assignee or an admin can't change a task's fields. A move the stage rules don't allow is refused.
- **No side effects:**
  - Deleting a linked row or column, or the sheet, never changes a task (FR-041).
  - A refused write changes nothing, not even the snapshot.
- **Content and Video sheets:** `taskMap` and `rowTasks` are refused there (`not_blank`).

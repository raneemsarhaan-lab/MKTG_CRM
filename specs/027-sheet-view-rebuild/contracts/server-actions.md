# Contract: server actions (Sheet view rebuild)

Every action returns `{ success: true, … } | { success: false, error }` and checks the session member first. Errors: `not_authenticated`, `not_authorized`, `not_found`, `invalid`, `board_tab` (the Board tab can't do that), `already_linked`, `conflict`.

## Views — `src/actions/views.ts` (Stage A)

| Action | Input | Who | Result |
|---|---|---|---|
| `renameView(id, name)` | name 1–60 chars | owner of a personal view; leads for shared | `{ view }` |
| `duplicateView(id)` | — | anyone who sees it | `{ view }` (personal copy named "<name> (copy)") |
| `deleteView(id)` | existing | as rename | `{}`; built-in tabs are not views and can't be deleted |

## Sheet tabs — `src/actions/sheet-tabs.ts` (Stage B)

| Action | Input | Who | Result |
|---|---|---|---|
| `addTab(node, name?)` | node of the workbook | may use the node | `{ sheet }` unlinked `rows` tab |
| `renameTab(sheetId, name)` | | creator, admin, superuser; not Board | `{ sheet }` |
| `duplicateTab(sheetId)` | | may use the node | `{ sheet }` copy of rows and groups, unlinked, no tasks created |
| `deleteTab(sheetId)` | | creator, admin, superuser; not Board | `{ removedRows }`; linked tasks untouched |
| `linkPreview(sheetId)` | | creator, admin, superuser | `{ columns: [{ column, field \| 'sheet' }], create, reconnect, untitled: string[], conflicts }` |
| `linkTab(sheetId, matches)` | confirmed column matches | as preview | `{ created, reconnected }`; idempotent: a second call creates nothing |
| `unlinkTab(sheetId)` | | creator, admin, superuser; not Board | `{ rows }` rows keep last values, remember tasks |

## Rows — `src/actions/content-rows.ts` (Stages B, C)

| Action | Input | Who | Result |
|---|---|---|---|
| `makeTask(rowId, spaceId?)` | spaceId only on a Brand page | may edit the row | `{ task }`; reconnects `last_task_id` if set |
| `unlinkRow(rowId)` | | may edit the row | `{ row }` |
| `addExistingTasks(sheetId, taskIds)` | | may use the node | `{ rows }` (skips tasks already in the tab) |
| `removeRow(rowId, mode)` | `'tab' \| 'archive'` (Board tab: `'archive'` only) | may edit the row | `{}` |
| `addRow(sheetId \| null, groupRef, after?)` | | may use the node | `{ row }`; in a linked tab a titled row creates a task |
| `setRowParent(rowId, parentId \| null)` | one level only | may edit both rows | `{ row }`; linked → subtask link |
| `moveRow(rowId, groupRef, before?)` | | may edit the row | `{ row }`; linked → task theme/pillar change |
| `pastePlan(sheetId \| null, groupRef, lines)` | ≤ 200 lines | may use the node | `{ rows, tasks }` |

## Groups — themes and pillars (Stage C)

| Action | Input | Who | Result |
|---|---|---|---|
| `addTheme(sheetId \| null, projectId \| newProject, at)` | new project: name, owner, frequency, audience | admin, superuser | `{ group }` |
| `addPillar(themeRef, name)` | | admin, superuser, theme owner | `{ pillar }` |
| `deleteGroup(groupRef, moveRowsTo)` | destination group | admin, superuser (pillar: + theme owner) | `{ movedRows }`; rows never deleted; project stays |
| `reorderGroups(sheetId \| null, order)` | | admin, superuser | `{}` this sheet only |

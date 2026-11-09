# Server Contract: Spreadsheet Editing and Sheet Tabs

Server actions in `src/actions/sheets.ts` (new) and changes to existing actions. Each action:
- acts only for the signed-in member (`getSessionMember`), and returns `{ success: false, error: 'not_authenticated' }` without one;
- returns `{ success: true, ... }` or `{ success: false, error: <code> }`;
- uses the error codes in [data-model.md](../data-model.md) §3.

## Folders

| Action | Input | Returns | Rules |
|---|---|---|---|
| `listFolders()` | — | `{ folders: { id, kind, name, sheetCount, updatedAt, updatedBy }[], pins: string[] }` | Linked folders first, then team folders by name. `pins` resolves null to `[content, video]` and drops deleted folders |
| `createFolder(name)` | 1–60 characters | `{ folder, sheet }` | Creates the folder with one blank sheet, "Sheet 1" (100 × 26) |
| `renameFolder(id, name)` | | `{}` | Team folders only (`linked`) |
| `deleteFolder(id)` | | `{}` | Team folders only. Called by the client after its 10-second Undo window (R12) |
| `setPins(folderIds)` | ordered list | `{ pins }` | Per member. Unknown ids are dropped |

## Sheets (tabs)

| Action | Input | Returns | Rules |
|---|---|---|---|
| `listSheets(folderId)` | — | `{ sheets: { id, kind, name, position, color, hidden, protectedBy }[] }` | All sheets, hidden ones included (for Unhide) |
| `createSheet(folderId, { before?, after? })` | | `{ sheet }` | Next free "Sheet N" in the folder. Placed after the open sheet ("+", Shift+F11) or before a tab (Insert). Starts at 100 × 26 |
| `renameSheet(id, name)` | | `{ name }` | FR-056. Blank sheets only (`linked`) |
| `deleteSheets(ids)` | one or more | `{ deleted }` | FR-057. Refuses linked sheets and leaving a folder with no visible sheet |
| `moveSheets(ids, folderId, beforeId \| null, copy)` | | `{ sheets }` (the moved or new ones) | FR-058, FR-059. A copy duplicates rows, columns and cells with new ids in one statement. Linked sheets only with `copy` (the client then pastes their text, R11) |
| `colorSheets(ids, color \| null)` | a palette key | `{}` | FR-059a |
| `protectSheet(id, on)` | | `{ protectedBy }` | FR-059b. Blank only. Unprotect only by the protector or an admin |
| `hideSheets(ids, hidden)` | | `{}` | FR-059c. Never all visible sheets; never linked |
| `loadSheet(id)` | — | `{ doc: SheetDoc }` | data-model §4. Blank only |

## Blank-sheet content

`applySheetChanges(sheetId, changes, baseUpdatedAt?)`. One transaction per call, at most 2,000 cells per call.

```text
changes: {
  cells?:      { rowId, colId, value }[]              // '' deletes
  insertRows?: { id, position, height? }[]
  deleteRows?: string[]                                // with their cells
  insertCols?: { id, position, width? }[]
  deleteCols?: string[]
  rowHeights?: { id, height|null }[]
  colWidths?:  { id, width|null }[]
}
→ { success: true, updatedAt, skipped: { rowId?, colId?, reason }[] }
```

- **Refusals:** `protected`, `too_many_rows`, `too_many_cols` and `too_long` refuse the whole call.
- **Skips:** a missing row or column is skipped as `gone`, and the rest is applied.
- **Positions:** renumbered in the same transaction when they run out of room (R3).
- **Folder:** `sheets.updated_at` and the folder's `updated_at` and `updated_by` are bumped.

## Linked-sheet cells

`writeTaskCells(entries)`, at most 500 entries per call.

```text
entries: { taskId, field, value }[]
  field: 'title' | 'status' | 'assignee' | 'owner' | 'due_date' | 'priority'
       | 'content_type' | 'clip.in' | 'clip.out' | 'clip.file' | 'clip.source'
       | `col:${columnId}`            // a team column (spec 010)
→ { success: true, saved: { taskId, field, value }[], refused: { taskId, field, reason }[] }
```

- **Grouping:** entries are grouped by task. Each task's fields are written with today's rules:
  - `title`, `due_date`, `priority`, `assignee`, `owner` and `content_type`, with the clip fields, through the same code paths as `updateTask` and `updateClip`. Permission: `canAct` (owner, assignee, admin, superuser).
  - `status`: matched to a stage by the sheet's stage names (spec 008 FR-010) or the pipeline's, then applied through `setTaskStage`'s rule. A celebration flag comes back in `saved` for the client.
  - `assignee` and `owner`: matched by member name, ignoring case and spaces; no match is refused as `no_match`.
  - `col:<id>`: through `setValues`, now allowed for any member on a live task (R8).
- **Reasons:** refusals use `not_authorized`, `archived`, `no_match`, `invalid_<kind>` or `stage_not_in_pipeline`, and never block the other entries.
- **Notifications:** each saved change notifies exactly as the single-cell edit does today (spec 012), through the same paths.

Row heights on linked sheets: `setLinkedRowHeights(kind, entries: { taskId, height|null }[])`.

## Changed existing actions

| Action | Change |
|---|---|
| `setValues` (spec 010) | The check becomes: signed-in member, task exists, not archived (R8). Spec 010's column actions are unchanged |
| `src/app/(app)/board/page.tsx` | Its data loading moves to `loadBoardData(member)` in `src/lib/board-data.ts`, called by `/board` and `/sheets/[folderId]` (R2) |

## Routes (pages)

| Route | What |
|---|---|
| `/sheets` | Sheets home (Server Component): `listFolders` |
| `/sheets/[folderId]` | An open folder. Tab list from `listSheets`; blank tabs load with `loadSheet`. Linked folders also get `loadBoardData` |

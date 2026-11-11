# Research: Link a Blank Sheet's Columns to Board Tasks

Each decision below resolves a question the spec left to planning. Nothing is left as NEEDS CLARIFICATION.

## R1. Where a row's task is kept

**Decision.** A nullable `task_id` on `sheet_rows`, which references `tasks`, with `onDelete: SetNull`. The Task column's cell keeps whatever was typed (a link or a title). The row's `task_id` is the resolved link.

**Rationale.**
- A row's identity in a blank sheet is already its id (spec 013). Formats, comments and merges key on it, so they keep working on linked rows untouched.
- Keeping the resolved id means a title that later changes on the board doesn't unlink the row, and two tasks with the same title never get confused after the member has chosen one.
- `SetNull` turns a hard-deleted task into "Not linked" without a cleanup job. A dropped task (`dropped_at`) stays linked and shows as dropped, as on the Content sheet.

**Alternatives considered.**
- *Resolve the Task cell's text on every load.* This breaks when titles change, and it makes "2 tasks have this title" come back on every visit.
- *A separate `sheet_row_tasks` table.* It adds a join and nothing else: there is one task per row (FR-002).

## R2. The column mapping

**Decision.** One JSON value on `sheets`: `task_map` = `{ taskCol: colId, fields: { [colId]: TaskField } }`, where `TaskField` is one of:
- `title`, `stage`, `due`, `assignee`, `owner`, `priority`, `platform`, `type`, `theme`, `pillar`;
- `link:doc`, `link:design`, `link:post`, `link:published`;
- `col:<sheet column id>`, for the team's own Content columns (spec 010).

Each field is used at most once per sheet (FR-010). A mapping change is a sheet change, with undo, like the view settings (spec 015 stage 2).

**Rationale.** The mapping is small and always read with the sheet, so a JSON column avoids a table. Column ids are stable, so moving, hiding or resizing a column keeps its mapping (FR-042). Deleting a column removes its entry in the same undoable step.

**Alternatives considered.** A `sheet_col_fields` table. It costs more queries and gives no benefit for at most about 20 entries.

## R3. Matching a Task cell to a task (FR-002, FR-003)

**Decision.**
1. A value containing a task id is a link. That is the board's `/board?task=<uuid>`, a full URL with it, or a bare uuid.
2. Otherwise, match the trimmed text to task titles, ignoring case, among tasks that aren't deleted. Dropped tasks are included and marked.
3. One match links the row. Several matches put the row on a "Choose a task" list. None leaves it "Not linked".

One server call resolves a whole column: one query by ids, plus one by lower-cased titles. Linking 2,000 rows is two queries (SC-004).

**Rationale.** These are the forms members already paste: Copy link on the board, and the Content sheet's Task Link column. Matching titles exactly (ignoring case) avoids surprising fuzzy matches.

## R4. Which tasks may be linked (clarified Q1)

**Decision.** Any task in the pipeline: Content pieces, Video tasks and clips, and project tasks. A field the task doesn't have is "Not applicable" on that row:
- Theme and Pillar exist only on Content pieces.
- Link columns exist only on Content pieces and videos.

An edit in a "Not applicable" cell is refused with that reason.

## R5. Saving a mapped cell (FR-012)

**Decision.** A server action, `writeTaskFields(sheetId, writes)`. Each write is `{ rowId, field, value }` and is checked and saved through the same code the board uses:

| Field | Saved through | Rule |
|---|---|---|
| title, due, priority, platform, type, owner | `updateTask`'s checks (`canAct`: owner, assignee, admin, superuser) | the task form's validation |
| assignee | the same | the name must match a member (as on the Content sheet) |
| stage | `setTaskStage` | the board's move rules (`allowedStages`); a refusal gives its reason; `shouldCelebrate` is returned |
| theme, pillar | `updatePiece` | Content pieces only |
| link:* | `setPieceLink` | web addresses only, as on the Content sheet |
| col:* | `writePastedValues` (spec 010) | the column's own type checks |

The same call also writes the shown value into `sheet_cells`, as a snapshot (R7). The result lists each write as `saved`, or `refused` with a reason. The client counts refusals for its "N not changed" message, as stage 2 does.

**Rationale.**
- Reusing the board's checks means one rule set (constitution §II, §III).
- A batch call lets a paste, a fill or a replace save in one round trip. Per-cell server calls would be slow on large pastes.

**Undo.** A new blank-sheet change kind, `taskFields`, holds each write's before and after. Undo writes the before values through the same action. A refused undo is counted and reported, as on the Content sheet (spec 013 FR-032).

**Celebrations.** A stage change that returns `shouldCelebrate` shows the same `CelebrationOverlay` as the board (constitution §V).

## R6. Board changes showing up (FR-013)

**Decision.**
- `loadSheet` returns the linked tasks' values for the mapped fields.
- While the sheet is open, `refreshTaskFields(sheetId)` runs when the tab is focused again, and every 60 seconds while it's visible.
- Values that changed replace what's shown. Cell formats and comments are untouched.

**Rationale.** Spec 013 has no live co-editing, and the Content sheet updates on reload. A 60-second refresh while visible gives SC-002's "within the refresh time" a concrete number, at the cost of one light query (only linked tasks, only mapped fields).

## R7. Snapshots (FR-014, edge cases)

**Decision.** The cell under a mapped field keeps the last value the sheet showed, saved in `sheet_cells` when:
- the sheet writes the field;
- a row is linked and filled;
- a refresh finds a change (written in the same call, server side).

Unmapping a column or unlinking a row shows the snapshot, which is now a plain cell. A hard-deleted task shows its snapshot with "Task removed".

**Rationale.** It satisfies "keep the current values as plain text" without the client writing large batches on unmap.

## R8. Creating tasks for rows (FR-030, FR-031; clarified Q2)

**Decision.** `createTasksForRows(sheetId, rows)` creates plain board tasks:
- in the pipeline's first stage (`todo`);
- with the workspace's 8/9-stage default;
- with no project, theme or pillar;
- with the mapped values that apply (title required; due, assignee, owner, priority, platform, type);
- owned by the creator unless an Owner column is mapped.

Each new task's id goes on its row, and its link goes into the Task cell. It follows `createTask`: the creator rule (`requireTaskCreator`), followers, and the "created in stage" and "assigned" notifications.

The preview, like Paste plan:
- lists rows to create;
- lists problems to fix in place or leave out: no title, an unknown member, a bad date, a missing due date;
- asks for one due date for rows without a mapped one (default: 7 days from today).

Undo unlinks the rows and keeps the tasks, and says so.

## R9. Add tasks… (FR-044; clarified Q3)

**Decision.** A picker dialog. It searches tasks by title, can be narrowed by stage, person or project, and lets the member tick several. Each ticked task becomes a new linked row at the end of the sheet, or below the selection. The sheet never adds rows on its own.

## R10. Permissions on a protected sheet (FR-043)

**Decision.** A mapped edit needs both permissions:
- **the sheet:** `mayEdit`, checked first;
- **the task:** `canAct`, or the move rules for stage.

A linked row's Task cell, the mapping and Create tasks follow the sheet's protection.

## R11. Sorting, filtering and finding on linked sheets

**Decision.**
- Mapped cells use the task's shown value: a stage's name, a member's name, the date as typed.
- Sort and filter (spec 015 stage 3) see the same text, so sorting by Stage sorts by the stage name, as on the Content sheet.
- Find & Replace treats mapped cells as task fields, through R5, with refusals counted.

## R12. Performance

- Loading a linked sheet adds one query: linked tasks by id, with only the mapped fields.
- Rows load their values with the sheet, so scrolling is unchanged (SC-004: arrow keys under 100 ms; the perf lab rechecks it).
- Linking 2,000 rows makes the two queries in R3, plus one `updateMany` of `sheet_rows.task_id` through `unnest`.

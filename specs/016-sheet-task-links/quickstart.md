# Quickstart: validating sheet task links

## Prerequisites

- Local PostgreSQL with the lab data.
- Run `bash scripts/migrate.sh` (adds `sheet_rows.task_id` and `sheets.task_map`).
- Build and start the app:

  ```bash
  npx next build && npx next start -p 3000
  ```

- Logins:
  - `raneem.sarhaan@forefront.consulting` (admin);
  - `content@forefront.consulting` (member);
  - `design@forefront.consulting` (member).

  The password is `lab-pass-1`.

## Checks

| # | Scenario | Expected |
|---|---|---|
| 1 | In a team folder, make a sheet listing 10 posts: 8 task links (Copy link on the board), 1 exact title, 1 unknown title. Choose **Link to board…** and pick that column as the Task column. | "9 linked · 1 not found". Linked rows show the task marker; clicking it opens the task. |
| 2 | Add a row whose title two tasks share. | It shows "2 tasks have this title". Choose a task links it, and the Task cell then holds the link. One undo goes back. |
| 3 | Map C → Title, D → Stage, E → Due date, F → Assignee, G → Design link. | Badges show on the headings. Mapped cells show each task's current values. |
| 4 | As the task's owner, rename a task in column C. | The board shows the new title. One undo puts the old title back on the task. |
| 5 | Change a Stage cell to a stage the move rules don't allow. | Refused with the board's reason; nothing changes. An allowed move to your own stage celebrates. |
| 6 | As a member who isn't owner or assignee, paste 5 stages where they own 3. | 3 change; the message reads "2 not changed (you can't edit them)". |
| 7 | Move a task's stage on the board, then go back to the sheet tab. | The Stage cell shows it within 60 seconds (on focus, at once). The cell's own fill and comment stay. |
| 8 | Type in an unmapped column. | It saves as a sheet cell; the task is untouched. |
| 9 | Unmap column D. | Its cells keep their values as plain text and stop following the task. |
| 10 | Select 4 unlinked rows (3 with titles, 1 without) and choose **Create tasks for rows…**. | The preview lists 3 to create and 1 problem. Confirm: 3 tasks appear on the board in To do, with no theme, and the rows are linked. Undo unlinks them and keeps the tasks. |
| 11 | Choose **Add tasks…** and tick 3 tasks from another project. | 3 linked rows are added. A video task shows "Not applicable" under Theme. |
| 12 | Delete a linked row, a mapped column, then the sheet. | No task changes (the DB check below). Undo restores the row with its link, and the column with its mapping. |
| 13 | Protect the sheet; as another member, try editing a mapped cell of a task they own. | Refused: the sheet is protected. |
| 14 | Hard-delete a linked task (admin), then refresh the sheet. | The row reads "Task removed"; the snapshots stay. |
| 15 | Link a 2,000-row sheet. | The result shows in under 5 seconds (SC-004); arrow keys stay under 100 ms (perf lab). |
| 16 | Arabic and a 390 px phone. | The dialogs, badges and markers mirror; 44 px targets; axe finds no serious or critical issues. |

## Labs

- `npm run lab:spreadsheet`: pure checks for matching links and titles (R3), mapping validation and the `taskMap`, `rowTasks` and `taskFields` undo kinds.
- `npx tsx --tsconfig scripts/spreadsheet-lab/smoke/tsconfig.json scripts/spreadsheet-lab/smoke/run.ts`: every action in [contracts/server.md](./contracts/server.md) and its guards.
- `node scripts/spreadsheet-lab/realapp/links.cjs`: checks 1–16 on the running app.
- Regressions:
  - `lab:sheet`, `lab:notify`;
  - realapp `run.cjs`, `perf-axe.cjs`, `format.cjs`, `editing.cjs`, `styles.cjs`.

DB check for "no task changes":

```sql
select md5(string_agg(id || name || status || updated_at::text, '|' order by id)) from tasks
```

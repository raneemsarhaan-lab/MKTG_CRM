# Validation: One sheet system (spec 026)

Run on the branch `claude/wonderful-dirac-k1wflu`, 24–25 Nov 2026, against the local lab
database and dev server.

## The request's checks (§9)

| # | Check | Covered by | Result |
|---|---|---|---|
| 1 | A plain row with typed values, then Make task → the task is in the chosen Space with those values | `026-make-task-in-a-chosen-space-with-the-row-values` (made in the Design Space: starts at Ready For Design on the Design board, with the row's title, date, brand, theme, pillar and Caption) | Pass |
| 2 | Editing a linked row's Caption shows in the task panel, and the other way round | `026-linked-row-and-panel-share-one-caption` (the sheet and the task read and write one value) | Pass |
| 3 | Moving a linked row to another pillar changes the task's pillar | `026-linked-row-and-panel-share-one-caption`, `2b-make-task-link-and-drag` | Pass |
| 4 | Unlinking keeps the row's values as plain text; the task stays in its Space | `026-linked-row-and-panel-share-one-caption` | Pass |
| 5 | A linked child row is a subtask of the parent's task | `026-child-row-makes-a-subtask`; a video's child row is a clip: `024-clip-starts-at-ready-for-design` | Pass |
| 6 | The Sheets section is gone; every sheet opens from a Space, a Space › Brand folder or a Brand page | `026-every-space-has-a-sheet-and-sheets-section-is-gone` | Pass, with the limits below |

Also checked: Paste plan makes plain rows and no tasks (`026-paste-plan-makes-plain-rows-only`,
`2b-paste-on-pillar-and-user-rows`); a child row can't be linked while its parent is plain
(`026-child-row-makes-a-subtask`).

## Built, and what is not

| Part of the request | State |
|---|---|
| §1 One sheet as the Sheet view of every Space and Space › Brand folder | Built |
| §1 The Brand page's Sheet view shows the brand's rows from every Space | **Not built.** It shows the brand's tasks from every Space (so every linked row), with a Space column; plain rows aren't listed there |
| §1 No Sheets section in the sidebar | Built. The `/sheets` page still opens by address, because people's blank sheets live there |
| §2 Themes, pillars, rows, child rows, "+ Row" | Built (sheet 2b), now per Space |
| §3 Plain rows; a stage as a label | Built |
| §4 Make task to a chosen Space, or an existing task; the Task cell; unlink | Built |
| §5 Child rows as subtasks | Built |
| §6 Columns: task field or sheet only | **Partly.** Task-field columns appear by themselves for every field the task types in use carry, and "+ Column" adds a sheet-only column. Choosing a task field from the library when adding a column, and hiding, reordering or renaming task-field columns in the Fields drawer, are not built |
| §7 Remove the special Content and Video sheets | The old Video sheet is no longer shown anywhere. Its component and its isolated lab checks are still in the code, to be removed together |
| §7 Remove the clip detail columns and fields | Gone from every screen (the task panel never showed them). The `task_clips` records are kept |
| §7 Remove bulk linking; Paste plan only makes plain rows | Built. A pasted plan's Task Link column no longer links or updates tasks (that was the only way to link in bulk), and Paste plan makes plain rows only |
| §8 Convert the Content sheet | Built (its rows were already rows; they now carry their Space) |
| §8 Convert the Video sheet | Built: videos as linked rows, clips as linked child rows; custom columns and values moved. A video with no project sits under "Videos · <brand>" |
| §8 Formatting and comments carry over | Content: yes (same sheet). Video: the workbook is the same, so formatting and comments on videos' and clips' cells in columns that still exist stay; those on the removed clip detail columns have nothing to show on |
| §8 Clip details exported to a CSV and kept | Built: `clip-details.csv`, in Settings › Diagnostics › Kept exports |

## Regression

See the commit message for the final count. Tests that opened the task sheet inside a Space now
open it on the brand's page (the task sheet's home), or in a saved Sheet view of the Space.

## To confirm with the user

- The catch-all themes "Videos · <brand>" created for videos with no project.
- A Space other than Content and Video starts with an empty sheet: its existing tasks aren't turned
  into rows. They can be added one at a time with Make task › an existing task.
- The local lab database had leftover test tasks, which were deleted before the final run. No
  real data was involved.

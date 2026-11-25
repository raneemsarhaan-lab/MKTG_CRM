# Release rehearsal: comparison report

Rehearsed on 24 Nov 2026 with the production backup taken the same day at 18:13 UTC
(sha256 `cbf4e82c…40df65`). Counts only: task names and other production details are in the local
detail file, not in the repository.

**Second rehearsal, 24 Nov 2026 evening:** run again from a fresh restore after your decisions on the
two old sheet folders and the due dates. The numbers below are from that second run.

## 1. What was run

1. The backup was restored into a fresh database (`rehearsal`). Its counts equal the backup's.
2. The merged code (feature branch + `main`, with your decisions of 24 Nov built in) ran exactly
   what a deploy runs: `scripts/migrate.sh` (schema guard, schema push, seed with the one-time steps,
   admin-reset check), then `scripts/backfill.sh` (files, followers, Sheets folders, ClickUp import,
   plan import). No bucket and no mail key were set, so nothing outside the copy could be touched.
3. Counts were taken again and compared, and every table that existed before was compared row by
   row, column by column, against the untouched copy of the backup.
4. The start-up path was run a second time: **0 differences**. A redeploy changes nothing.
5. The app was started on a second copy and spot-checked (section 4).

The schema guard passed: the schema change only adds (no drop, rename, type change).

## 2. Counts before and after

| | Before | After | |
|---|---|---|---|
| Tasks | 449 | 449 | none added, none removed |
| Published / archived / subtasks / clips | 348 / 3 / 40 / 39 | same | |
| Members, brands, pillars, task types | 9 / 5 / 2 / 11 | same | |
| Task comments | 93 | 93 | identical |
| Attachments | 1142 | 1142 | identical |
| Followers | 671 | 671 | identical |
| Notifications | 6491 | 6491 | identical |
| Logged working days | 38 | 38 | identical |
| Old sheets: sheets, rows, columns, cells, formats, merges | 18 / 1610 / 416 / 1338 / 1473 / 3 | 13 / 1110 / 286 / 974 / 1418 / 3 | "Marketing Projects" deleted, as you decided (5.2). Every other sheet is identical |
| Sheet folders | 4 | 3 | one deleted, one moved to a Space (5.2) |
| Custom sheet columns and their values | 33 / 10 | 33 / 10 | 1 column moved (5.6) |
| Projects | 35 | 36 | +1 (5.7) |
| Themes | 10 | 11 | +1 (5.7) |
| One-time step records | 103 | 121 | +18, the 18 steps of this release |

Fingerprints (a hash of the content, not just a count) are **unchanged** for: task ids and names,
task briefs, owners and assignees, task comments, attachments, custom column names and values,
logged hours, users. Sheet cells and formats differ only by the deleted folder: every remaining cell
and format is identical, row by row.

New tables, filled by the release: 5 Spaces (the fifth is Digital Media), 1 Space member, 906 "shows in" rows, 3 Space stage
names, 3 task fields attached 11 times to task types, 48 sheet rows (9 videos and their 39 clips),
8 kept exports.

## 3. Every existing row that changed

Row-by-row comparison of the 40 tables that existed before. 30 are identical. The rest:

| Table | Change | Rows | Old value kept in |
|---|---|---|---|
| `tasks.priority` | Medium → Normal | 403 | `before-release-tasks.csv` |
| `tasks.status`, `stage_date`, `updated_at` | Clips at To Do → Ready For Design on the Video board; their stage date becomes the deploy day | 28 | `before-release-tasks.csv` |
| `tasks.due_date` | **No change** (your decision) | 0 | |
| `sheet_columns` | The Video sheet's one custom column now belongs to the Video Space's sheet | 1 | `before-release-sheet-columns.csv` |
| `sheet_folders` | "TSC Calendar": kind and key changed so it is the Digital Media Space's workbook | 1 | |
| `sheet_folders`, `sheets`, `sheet_rows`, `sheet_cols`, `sheet_cells`, `sheet_formats` | **"Marketing Projects" deleted**: 1 folder, 5 sheets, 500 rows, 130 columns, 364 cells, 55 formats | | 2 CSV exports (the two sheets that held anything; values, not formatting), and the backup |
| `projects` | 1 added | +1 | |
| `tombstones` | 18 added | +18 | |

Nothing else was deleted from any table.

After people open the app, two more things happen (measured on a second copy):
- Opening the Content Space sheet gives each theme piece a row: +26 rows, +10 theme records. Adds only.
- The daily scheduler, as on `main` today, removes reminder records older than 30 days (11 rows) and
  sends due reminders.

## 4. Spot-check on the app (36 checks, 35 pass)

- **5 tasks per brand** (21 tasks: four brands have tasks, plus tasks with no brand; one brand has a
  single task): name, stage, due date, brief, number of comments and number of files match the backup.
- **A task with comments and files** (7 comments, 6 files): all 7 comments and all 6 files are shown.
  The one "fail" is the checker: three of the comments are links, which the panel shows as link
  cards, so their text isn't on screen as typed.
- **A video with clips**: its row is on the Video Space sheet with 9 of 9 clips under it.
- **Content and Video sheets** open with no errors.
- **Hours this week**: the Working hours page shows the same totals as the backup (4 people, 63 h).
- **Every stage** shows its own name in the task panel.
- 12 main pages open with no page errors (board, the four Spaces, a brand page, My tasks, Focus,
  notifications, team, task types, capacity).

## 5. What the team will see change on day one

### 5.1 The Design Space board is empty (your decision of 24 Nov)

No linked tasks are created. **31 content tasks** are in the design half with no linked Design or
Video task: 15 at Ready For Design, 3 at D-In Progress, 13 at D-Check. By brand: Forefront 19,
Omnisight 5, The Strategy Community 2, no brand 5. They are listed as an error in
Settings › Diagnostics, "Needs a linked task", and in `needs-linked-task.csv`. Until each is linked
by hand, the Design Space board shows 0 cards. These tasks stay visible, at their stage, on the main
Pipeline board, on their brand page and in the Content Space. Published tasks are not listed.

### 5.2 The two team folders of the old Sheets section (your decision of 24 Nov)

- **"TSC Calendar"** is now the sheet of a new Space, **Digital Media**. Its 8 sheets (2 of them were
  already hidden by the team) are tagged with the brand The Strategy Community: they show on the Space
  and in Digital Media › The Strategy Community, and not in the Space's other brand folders. Cells,
  formats and comments are untouched. The Space is open to everyone, as the folder was. Checked on the
  copy as an admin and as a member with plain user access: both open the Space and read the sheets.
  An old link to the folder leads to the Space.
- **"Marketing Projects"** is deleted (5 sheets, 364 filled cells). The values of the two sheets that
  held anything are kept as CSV in Settings › Diagnostics.

### 5.3 Due dates don't move (your decision of 24 Nov)

Every due date stays as it is, marked "set by hand". For the 9 theme pieces with a planned date,
that date is also written as the publishing date. Nobody gets an overdue notification because of the
release.

### 5.4 "Caption not added" shows on live cards

Caption (and TOV for posts) is a new required field for Post, Reel, Story and Video. 62 live tasks
of those types show the red flag. Only tasks that haven't reached C-Review are stopped from moving
there until it is filled: 11 tasks (2 posts, 9 videos). Tasks already past it are not held back.

### 5.5 Spaces have almost no members

Members are placed by role (Content Creator, Graphic Designer, Video Editor). Production has one
matching role, so Video has 1 member; Content, Design, Planning and Digital Media have none. An admin adds members
in each Space's settings. Until then a hand-off has no default assignee, and the one member with
plain user access can't create a task from inside a Space (the main board still works).

### 5.6 Video sheet

The Video sheet is now the Video Space's sheet. Its custom column moves with it, values untouched.
The clip details are also kept as `clip-details.csv`.

### 5.7 A new theme, "Videos · No brand"

The 9 videos have no brand and no project. One project is created to hold their rows on the Video
sheet. No task's project was changed.

### 5.8 Other

- Priority Medium is called Normal (403 tasks).
- 28 clips move from To Do to Ready For Design on the Video board; their SLA clock starts on the
  deploy day. 11 clips that were further along keep their stage and stay off the Video board.
- 53 live tasks have no project, so, as today, they aren't on the Content sheet.

## 6. Merge conflicts that affect the live app

`main` had 17 commits the branch lacked. 21 files conflicted (50 places). The merged code builds
for production and passes the tests in section 7.

**Where both sides changed the same screen**

| Screen | Kept from `main` | Kept from the branch |
|---|---|---|
| Board columns | The new look (grey body, tinted header, bigger title in the reader's language) | Space stage names, brand grouping, manual order. The second-language line under a title shows only for a renamed Space stage |
| Task cards | Screen-reader structure, focus handling | Several assignees, due labels by Cairo day, a published task is never overdue |
| Task panel | "Moving…" state, clearer messages when the connection drops, focus returns to the card | Hand-off box, required fields, task types, several assignees, start and publishing dates |
| Sheet cells | Clearing a cell can be undone | Clearing a Task-link cell also unlinks the task |
| Content sheet | Removing a pillar asks first | When the sheet has rows, it asks where the rows go |
| Sheet dialogs, toolbar, comments | Accessibility fixes | Row commands, column rename |
| Sheet tabs | | No "Linked" tag or icon (your decision) |

**Where the two sides met with no visible conflict (found by review, fixed)**

1. **Deleted imported tasks would have come back.** `main` fixed the board's delete so the ClickUp
   importer, which runs at every start, doesn't recreate a deleted task. The branch has a second way
   to delete a task (deleting its sheet row). That path now records the same mark.
2. **Arabic digits.** `main` made Arabic show Western digits everywhere. The branch's new due and
   publishing dates still used Arabic-Indic digits. Fixed.
3. **Importer priority.** The importer wrote "Medium" for new tasks; it now writes "Normal".
4. **Card marker duplicated.** After the merge each card carried its id twice, which doubled card
   counts in the tests and would have confused "return to the card" on closing a task. Fixed.

**`main` fixes that have nothing to apply to**

`main` improved the old Sheets home page and the old Video sheet page. Both pages are retired on the
branch, so those fixes don't appear. The same kinds of fix on the pages that remain were kept.

## 7. Tests on the merged code

| Check | Result |
|---|---|
| Typecheck | clean |
| Preflight (conflict markers, boot scripts parse) | clean |
| Production build | passes, 39 routes |
| Real-app suite (the app in a browser, against a database) | 119 of 119 scenarios (one new: a tab tagged with a brand) |
| Sheet lab | 158 of 158 |
| Attachments lab | 60 of 60 |
| Brief editor lab | 55 of 55 |
| Notifications lab | 48 of 48 |
| Spreadsheet lab | 40 of 40 |
| Header lab | 24 of 24 |
| Hours, inbox and Spaces labs | all pass |

Three test scenarios were updated for an intended change from `main`: the "move to next stage"
button is now announced as "Move to Ready For Design" instead of "→ Ready For Design".

## 8. Not covered by this rehearsal — only you can do these

1. **Storage bucket.** The rehearsal had no bucket. 206 attachments live there. No start-up,
   migration or scheduled code deletes from the bucket, but please take a bucket backup or snapshot,
   or confirm one exists.
2. **Environment variables.** Keep a record of the live values before deploying.
3. **A fresh database backup right before the merge.** This rehearsal used the 24 Nov 18:13 UTC
   backup. Anything created after it isn't in these counts. The counts are taken again on the fresh
   backup with `scripts/release/counts.sh`.
4. **A maintenance notice** while the deploy runs.

## 9. Decisions

1. The two team folders (5.2): decided 24 Nov. Built and rehearsed.
2. The due dates (5.3): decided 24 Nov. Built and rehearsed.
3. The Design Space starts empty with 31 hand-offs to link by hand (5.1): your decision of 24 Nov.
4. Step 5 approved on 24 Nov.

## 10. After go-live, 25 Nov 2026: the in-flight design work moves to the Design board

Your decision of 25 Nov (it replaces "link by hand" in 5.1): every content task in Ready For Design,
D-In Progress or D-Check that has no linked task gets its linked Design task. One-time step
`media-tasks-v2`. Rehearsed on the copy as it stands after the release (the state production is in):

| | Before | After |
|---|---|---|
| Tasks | 449 | 480: 31 linked Design tasks added (15 Ready For Design, 3 D-In Progress, 13 D-Check) |
| Existing tasks changed | | 31 content tasks marked as linked; no stage, date, owner, assignee or text changed |
| "Shows in" rows | 906 | 906: each content task's Design row is replaced by its linked task's |
| Followers | | owner and assignee follow each linked task |
| Due reminders | | marked as already sent for each linked task, so nobody is reminded twice |
| Every other table | | identical |

Each linked task starts as a copy of its content task's stage, stage date, due and publishing dates,
priority, owner and assignee. No notifications are sent. A second start changes nothing.

On the copy: the Design board shows 15 / 3 / 13, a linked task opens, "Needs a linked task" in
Settings › Diagnostics lists 0, no page errors. The hand-off and linked-task scenarios pass (15 of 15).

Not included: the 2 tasks at F-Check and 8 at Ready to Publish (design is finished and the Design
board has no column for those stages), published and archived tasks, and clips (already on the Video
board).

## 11. 25 Nov 2026, later: no copies — the task itself goes on the board

Your decision of 25 Nov: a task handed to Design or Video is not copied. The task itself goes on the
Design or Video board and stays in Content, with all its history. This replaces section 10.

- **From now on:** at Ready For Design (and "Put on the board" in the Link task cell) the task joins
  the chosen board's Space. The board's person (or its default) is added to the task's assignees;
  the lead doesn't change. They are notified and follow the task. No second task is made.
- **The 31 copies of this morning:** one-time step `media-merge-v1` folds each copy back into its
  task. Anything added to a copy (comments, files, followers, subtasks, tags, field values, people,
  notifications) moves to the task; the task joins the board; then the copy is deleted.

Rehearsed on a copy at the live state (the 31 copies present), with a comment and a file added to
one copy first:

| | Result |
|---|---|
| Tasks | 480 → 449: the 31 copies are gone; no original task removed |
| The comment and file added to a copy | now on its task |
| The 31 tasks | each on the Design board (15 / 3 / 13), still in Content, same stage and dates |
| Compared with before any copy was made | identical except the 31 tasks' board row and hand-off time |
| A second start | changes nothing |

In the app on that copy: all 31 open from the Design board with all their files and comments;
"Not on the Design or Video board" in Settings › Diagnostics lists 0; no page errors.

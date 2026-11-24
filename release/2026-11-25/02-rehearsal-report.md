# Release rehearsal: comparison report

Rehearsed on 24 Nov 2026 with the production backup taken the same day at 18:13 UTC
(sha256 `cbf4e82c…40df65`). Counts only: task names and other production details are in the local
detail file, not in the repository.

**Status: stopped here. Nothing is merged to `main`, nothing is deployed, nothing is pushed.**

## 1. What was run

1. The backup was restored into a fresh database (`rehearsal`). Its counts equal the backup's.
2. The merged code (feature branch + `main`, commit `3c433d7`) ran exactly
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
| Notifications | 6491 | 6491 | identical (see 5.3) |
| Logged working days | 38 | 38 | identical |
| Old sheets: sheets, rows, columns, cells, formats, merges | 18 / 1610 / 416 / 1338 / 1473 / 3 | same | identical |
| Sheet folders | 4 | 4 | identical |
| Custom sheet columns and their values | 33 / 10 | 33 / 10 | 1 column moved (5.6) |
| Projects | 35 | 36 | +1 (5.7) |
| Themes | 10 | 11 | +1 (5.7) |
| One-time step records | 103 | 120 | +17, the 17 steps of this release |

Fingerprints (a hash of the content, not just a count) are **unchanged** for: task ids and names,
task briefs, owners and assignees, task comments, attachments, sheet cells, sheet formats, custom
column names and values, logged hours, users.

New tables, filled by the release: 4 Spaces, 1 Space member, 906 "shows in" rows, 3 Space stage
names, 3 task fields attached 11 times to task types, 48 sheet rows (9 videos and their 39 clips),
6 kept exports.

## 3. Every existing row that changed

Row-by-row comparison of the 40 tables that existed before. 37 are identical. The other three:

| Table | Change | Rows | Old value kept in |
|---|---|---|---|
| `tasks.priority` | Medium → Normal | 403 | `before-release-tasks.csv` |
| `tasks.status`, `stage_date`, `updated_at` | Clips at To Do → Ready For Design on the Video board; their stage date becomes the deploy day | 28 | `before-release-tasks.csv` |
| `tasks.due_date` | Due date moved 7 days earlier; the old date is now the publishing date | 2 | publishing date, and `before-release-tasks.csv` |
| `sheet_columns` | The Video sheet's one custom column now belongs to the Video Space's sheet | 1 | `before-release-sheet-columns.csv` |
| `projects` | 1 added | +1 | |
| `tombstones` | 17 added | +17 | |

Nothing was deleted from any table.

After people open the app, two more things happen (measured on the second copy):
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

### 5.2 Two team folders of the old Sheets section can't be opened any more — **needs your decision**

The Sheets section is gone in this release. The two workbooks linked to Content and Video open in
their Spaces. **The two team folders have no page: 13 sheets, 1,141 filled cells, edited on 22 and
23 Nov.** Their data stays in the database, untouched, but nobody can open them after the deploy.

### 5.3 Two due dates move; one task becomes overdue — **needs your decision**

For theme pieces, the old planned date becomes the publishing date and the due date becomes
7 days earlier. Two live tasks change: one from 20 Dec to 13 Dec, one from 26 Nov to 19 Nov. The
second is then 5 days overdue, and its two assignees get an "overdue" notification (and email).

### 5.4 "Caption not added" shows on live cards

Caption (and TOV for posts) is a new required field for Post, Reel, Story and Video. 62 live tasks
of those types show the red flag. Only tasks that haven't reached C-Review are stopped from moving
there until it is filled: 11 tasks (2 posts, 9 videos). Tasks already past it are not held back.

### 5.5 Spaces have almost no members

Members are placed by role (Content Creator, Graphic Designer, Video Editor). Production has one
matching role, so Video has 1 member; Content, Design and Planning have none. An admin adds members
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
| Real-app suite (the app in a browser, against a database) | 118 of 118 scenarios |
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

## 9. Decisions needed before step 5

1. The two team folders of sheets (5.2): give them a home in the app before the release, or accept
   that they can't be opened (data kept).
2. The two due dates (5.3): let the rule move them, or keep the old due dates as "set by hand".
3. Confirm the Design Space starts empty with 31 hand-offs to link by hand (5.1).
4. Approval to go on to step 5.

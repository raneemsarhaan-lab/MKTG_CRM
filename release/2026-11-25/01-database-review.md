# Release of 25 Nov 2026 — step 1: what the merge changes in the database

Branch `claude/wonderful-dirac-k1wflu` → `main`. Written before any merge or deploy. Nothing on
production was read or changed for this review; it comes from the code of both branches and from a
dry run on a throw-away database built at `main`'s schema.

## How a deploy touches the database

Production runs on Cranl, deployed from `main`. There are no migration files. When the new
container starts, `scripts/migrate.sh` runs, in this order:

1. **Schema guard** (new in this release, `scripts/schema-guard.sh`): stops the deploy if the schema
   change would drop, rename or retype anything.
2. `prisma db push --accept-data-loss`: makes the database match `prisma/schema.prisma`.
3. `prisma generate`.
4. `tsx prisma/seed.ts`: reference data, then the one-time steps below (each runs once, recorded in
   `tombstones`).
5. `scripts/reset-admin.ts` (does nothing unless two environment variables are set).

After the server is up, `scripts/backfill.sh` runs in the background (files to the bucket, followers,
Sheets folders, ClickUp import, plan import). **None of those scripts changed in this release.**

`main` has 17 commits the branch doesn't have. None of them touches the schema, the seed or the boot
scripts, so the merged schema is the branch's schema.

## A. The schema change (step 2 above)

Generated with `prisma migrate diff` from `main`'s schema to the branch's: 481 lines of SQL.

| Kind of change | Count | Risk |
|---|---|---|
| New tables | 19 | None: `data_exports`, `team_spaces`, `space_stages`, `task_space_stages`, `team_space_members`, `task_spaces`, `saved_views`, `task_fields`, `task_type_fields`, `task_field_values`, `milestones`, `todos`, `tags`, `task_tags`, `task_assignees`, `task_templates`, `repeat_rules`, `content_themes`, `content_rows` |
| New columns on existing tables | 44 on `members`, `brands`, `brand_assets`, `content_types`, `tasks`, `workspace_settings`, `sheet_folders` | None: each is nullable or has a default |
| Changed default | 1: `tasks.priority` default `Medium` → `Normal` | New rows only; existing rows are renamed by a one-time step (B13) |
| New unique indexes on existing tables | 3: `tasks.recurrence_key`, `tasks(content_task_id, media_board)`, `sheet_folders.brand_id` | None: all on new columns, empty for every existing row |
| New foreign keys on existing tables | 4 | `sheet_folders.brand_id → brands ON DELETE CASCADE`: deleting a brand would delete that brand's sheet folder. The other three are `SET NULL` |
| DROP TABLE, DROP COLUMN, TRUNCATE, RENAME, type change, NOT NULL on an existing column | **0** | — |

**Standing risk, now guarded:** `db push --accept-data-loss` drops whatever the schema file doesn't
have, without asking. If production has a column or table that isn't in the schema file (added by
hand, or left by an older version), this deploy would drop it. The guard asks Prisma for the SQL the
push would run against the real database and stops the boot if it contains a drop, rename, type
change, `SET NOT NULL`, truncate or delete. Tested both ways on the dry-run database. It needs
checking once more against the copy of production in step 4.

## B. The one-time steps (step 4 above), in run order

`main` has run two of them (`milestone-backfill`, `assignee-backfill`). These run for the first time:

| # | Step | What it does to existing rows | Verdict |
|---|---|---|---|
| 0 | `before-release-snapshot-v1` (**new, added for this release**) | Reads only. Copies every task's stage, stage date, due date, priority, project, pillar and people, every sheet column's sheet/order/visibility, and which projects are themes, into kept exports (Settings › Diagnostics) | Safe |
| 1 | `spaces-v1` | Creates the 4 Spaces and their members | Adds only |
| 2 | `task-spaces-v1` | Creates "shows in" rows for every task. Throws if the task count changes | Adds only |
| 3 | `simple-to-pipeline-v1` | `UPDATE tasks … WHERE kind='simple'`. The `kind` column is new and defaults to `pipeline`, so on production it matches **0 rows** | No effect expected; confirm in rehearsal |
| 4 | `space-default-roles-v1` | Sets fields on the new Spaces | Adds only |
| 5 | `content-type-boards-v1` | Fills the new `media_boards` column of task types | Adds only |
| 6 | `media-tasks-v1` | **Creates a new linked Design or Video task for every content task at Ready For Design or later — published tasks included.** Sets `auto_linked_at` on the content task. Deletes only "shows in" rows that step 2 created seconds earlier | **Adds tasks. See decision 1** |
| 7 | `due-dates-v1` | **Rewrites dates.** For a piece of a theme with a planned date: the planned date becomes the publishing date, and the due date is recalculated (7 days earlier, off Friday/Saturday). Published pieces keep their due date. Every other task's due date is kept and marked "set by hand" | Old due dates are kept in the publishing date and in the snapshot |
| 8 | `space-stages-v1` | Creates Space stage names from the sheets' stage words | Adds only |
| 9 | `content-follows-media-v1` | **Can change a content task's stage** to follow its linked tasks. Right after step 6 the linked tasks are at the same stage, so **0 changes** are expected (0 in the dry run) | Old stage in the snapshot; confirm 0 in rehearsal |
| 10 | `task-types-v1` | Fills new columns of task types (icon, colour, Arabic name, order) | Adds only |
| 11 | `content-fields-v1` | Creates the Caption, Channels and TOV fields and attaches them to Post, Reel, Story, Video | Adds only |
| 12 | `priority-normal-v1` | **`UPDATE tasks SET priority='Normal' WHERE priority='Medium'`** (and the same on task types) | A rename of one value; old value in the snapshot |
| 13 | `video-stage-names-v1` | Names three Video Space stages | Adds only |
| 14 | `clips-to-video-v1` | **Moves every live clip at To Do to Ready For Design on the Video board** (stage, stage date, entry stage, board) | Old stage in the snapshot |
| 15 | `brand-short-names-v1` | Fills the new `short_name` where empty | Adds only |
| 16 | `sheet-spaces-v1` | Exports clip details to `clip-details.csv`. **Moves the Video sheet's own columns to the Video Space's sheet** (changes `sheet_columns.sheet`, resets where each is shown; values untouched). Creates sheet rows for videos and clips. Creates a "Videos · brand" project for videos with no project, and **marks videos' projects as themes** | Old column placement and theme flags in the snapshot. The `task_clips` records stay |
| — | `team-sheets-removed-v1` | **Was a DELETE** of the old Sheets section's folders | **Removed from this release.** Those folders stay in the database, untouched and out of the app's pages |

Not in the list you gave because they don't exist as rewrites in this release: "status mapping"
(stages keep their ids) and "assignee → lead" (`task_assignees` is new and starts empty; the lead is
still `tasks.assignee_id`).

## C. Code that deletes at startup, during migration, or on a schedule

| Where | What | In this release |
|---|---|---|
| Seed | `team-sheets-removed-v1` | **Removed** (see above) |
| Seed | `media-tasks-v1` deletes "shows in" rows it replaces with a linked task | Only rows created by step 2 in the same run |
| Scheduler, daily | `clearSheetOrphans`: deleted formatting and comment threads whose row, column or task is gone (new on this branch) | **Switched off.** It is new, and it doesn't know the rows of the new sheets |
| Scheduler, daily | Read notifications over 90 days, old reminder and digest keys | Already on `main`; unchanged |
| `scripts/reset-admin.ts` | Deletes one `tombstones` row, only when the two reset variables are set | Already on `main`; unchanged |
| Storage bucket | Objects are deleted only when a person removes an attachment or a brand asset | No startup, migration or scheduled delete |
| Every page load | The Content sheet gives a row to a task of one of its themes (adds rows; moves a row if its task's project changed) | Adds only |

## D. Changes made to the branch for this review (committed locally, not pushed)

1. The seed no longer deletes the old Sheets section's folders.
2. The scheduled orphan clean-up no longer runs.
3. A snapshot of everything the one-time steps rewrite is taken first, inside the database.
4. The schema guard runs before the schema push.
5. `scripts/release/counts.sh`: the counting tool for steps 3, 4 and 6 (counts of every table, the
   breakdowns you listed, and fingerprints of names, briefs, comments, cells and attachments).

## E. Dry run (synthetic data, not production)

A database at `main`'s schema, seeded with `main`'s seed, loaded with 18 tasks shaped like the
cases above (theme pieces at nine stages, a campaign task, an archived piece, two videos with four
clips, comments, a link, custom columns on both sheets, a folder of blank sheets with cells, a format
and an old comment), then the branch's `migrate.sh`:

- Guard passed; schema push added only; all steps completed.
- Tasks 18 → 26: 8 new linked media tasks. Nothing else was created or removed among tasks.
- 16 tasks Medium → Normal; 3 clips To Do → Ready For Design; 9 pieces got publishing dates.
- Unchanged: comments, attachments, followers, custom column values, blank-sheet cells, the format
  and the comment, users, pillars.
- Projects 2 → 3 (one "Videos · brand").

## F. Not database, but it blocks step 5

Merging `main` into the branch conflicts in **21 files** (the sheet, board and workbook screens,
both message files, the stylesheet). The merged code doesn't exist yet. It has to be made and
tested before the rehearsal, because the rehearsal must run exactly what will be deployed.

## G. There is no history table

Stage changes, edits and moves aren't logged in a table of their own, so "history entries" can't be
counted. Notifications and followers are counted instead.

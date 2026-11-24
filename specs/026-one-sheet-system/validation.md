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
| §1 The Brand page's Sheet view shows the brand's rows from every Space | Built, one Space at a time: a strip of every Space with the brand's row count opens that Space's sheet for the brand (plain rows included), on the same page; "All tasks" lists the brand's tasks from every Space together. The Spaces aren't merged into one grid, because each Space's sheet has its own columns, formatting and comments (`026-brand-page-sheet-shows-rows-of-every-space`) |
| §1 No Sheets section in the sidebar | Built. An old Sheets address (`/sheets`, `/sheets/<folder>`, and the link in a sheet-comment notification) leads to the page that owns the sheet: the Space's Sheet view, the brand's page or My tasks, on the same tab and cell. The folders of blank sheets people made in the old Sheets section are removed (user, 24 Nov); whatever a sheet held is kept first as a CSV in Settings › Diagnostics › Kept exports |
| §2 Themes, pillars, rows, child rows, "+ Row" | Built (sheet 2b), now per Space |
| §3 Plain rows; a stage as a label | Built |
| §4 Make task to a chosen Space, or an existing task; the Task cell; unlink | Built |
| §5 Child rows as subtasks | Built |
| §6 Columns: task field or sheet only | Built. "+ Column" asks for a Task field (the sheet's hidden ones and the field library) or a Sheet only column. Every column — task-field ones included — is shown, hidden, moved and renamed in the Fields drawer, per sheet (`026-columns-task-field-or-sheet-only`, pure check `cols-task-fields`) |
| §7 Remove the special Content and Video sheets | Built. The old Video sheet is out of the app; its two files are kept only as the sheet lab's harness for the shared grid (`scripts/sheet-lab/harness/`), which about 110 isolated checks of columns, editing, paste and keyboard use |
| §7 Remove the clip detail columns and fields | Gone from every screen (the task panel never showed them). The `task_clips` records are kept |
| §7 Remove bulk linking; Paste plan only makes plain rows | Built. A pasted plan's Task Link column no longer links or updates tasks (that was the only way to link in bulk), and Paste plan makes plain rows only |
| §8 Convert the Content sheet | Built (its rows were already rows; they now carry their Space) |
| §8 Convert the Video sheet | Built: videos as linked rows, clips as linked child rows; custom columns and values moved. A video with no project sits under "Videos · <brand>" |
| §8 Formatting and comments carry over | Content: yes (same sheet). Video: the workbook is the same, so formatting and comments on videos' and clips' cells in columns that still exist stay; those on the removed clip detail columns have nothing to show on |
| §8 Clip details exported to a CSV and kept | Built: `clip-details.csv`, in Settings › Diagnostics › Kept exports |

## Regression

See the commit message for the final count. Tests that opened the task sheet inside a Space now
open it on the brand's page (the task sheet's home), or in a saved Sheet view of the Space.

## Changes asked for on 24 Nov, after the build

| Asked | Done |
|---|---|
| The sheet's toolbar keeps only "+ Column" and "+ Theme", in every folder | Built, on every Space and Space › Brand folder sheet and the brand page's sheets. Nothing was lost: the columns open from the workbook's **Fields** button; **Paste plan…**, **Only my rows** and **Show archived** are in the workbook's **Data** menu (with a tick when on). Pasting a table onto a theme, pillar or "+ Row" still opens Paste plan |
| No brand filters on a Space page | Built: the brand chips and "Group by brand" are gone (a Space's brand folders in the sidebar do that) |
| Sidebar numbers only for Inbox and My tasks | Built: Spaces, folders and brands show their names alone |
| Simplify the notifications filters | Built: one row — All, Mentions, Comments, Assigned to me, Deadlines — and one list for the dates, in place of twelve kind chips and four date chips |
| Adding a theme asks for a name only; themes aren't shared between Spaces | Built: "+ Theme" is one name field. It never picks an existing project, and the same name on another Space's sheet is a separate theme (`2b-theme-from-project-or-new`). Existing themes, "Videos · brand" included, are left as they are |
| Remove the "Linked" tag | Built: gone from the sheet's title and its tab |
| Home and pinned views carry icons | Built: a home icon and a pin icon before the view's name |
| Remove the blank sheets of the old Sheets section | Built (see §1 above) |

Also finished here: a Space's **Default sheet columns** (spec 024 §5) now apply to its sheet — they
decide which of the sheet's own columns show until someone shows or hides one there.

## To confirm with the user

Answered on 24 Nov: blank sheets of the old Sheets section are removed; Planning's flow is edited in
its settings when needed. Still open:

- Whether a theme's record should also leave the Projects page and the project pickers, and stop
  being the task's project (see the spec's 24 Nov note). Themes are separate by name and by sheet now,
  but each still has a record among the projects.
- A Space other than Content and Video starts with an empty sheet: its existing tasks aren't turned
  into rows. They can be added one at a time with Make task › an existing task.
- The local lab database had leftover test tasks, which were deleted before the final run. No
  real data was involved.

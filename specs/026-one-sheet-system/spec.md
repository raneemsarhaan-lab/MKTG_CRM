# Spec 026: One sheet system

**Asked for**: 24 Nov 2026 (user). **Branch**: `claude/wonderful-dirac-k1wflu`.
The user's text is the specification; this file records it with the decisions made while building.

Replace the linked Content and Video sheets and the Sheets section with one sheet system,
used as the Sheet view of every Space and Space › Brand folder.

## 1. Where sheets live

- No separate Sheets section; it leaves the sidebar.
- A sheet exists only as the Sheet view of a Space (all its rows, every brand) or of a Space › Brand folder (that Space's rows for that brand).
- The Brand page's Sheet view shows the brand's rows from every Space.
- One grid everywhere: columns, formatting, paste, undo, comments.

## 2. Structure

```
▾ Theme              group row, merged across the sheet, collapsible
   ▾ Pillar          sub-group under the theme, collapsible
        Row          plain or linked
          Child row  under a row, one level deeper
```

- A theme is mapped to a project; its owner, frequency and audience come from the project and show in the theme row's tooltip.
- A pillar is a sub-group of its theme. Rows with no pillar sit directly under the theme. A "+ Row" line ends each group.

## 3. Plain rows

- A planning line, not a task: no SLA, approvals or board.
- A Stage column, if added, is a label on a plain row (the Space's stage names) and triggers no stage rules.
- Anyone with access to the Space can edit plain rows.

## 4. Linked rows

- The "Task" column shows "Make task" on plain rows.
- Make task asks for the destination Space (Design, Video, Digital, or any Space made in the tool), then creates a pipeline task there or connects the row to an existing task there.
- Once linked: every column that matches a task field is that field (edit anywhere, updates everywhere); the task takes its brand from the folder and its theme and pillar from the row's groups; moving the row changes the task's theme or pillar; task permissions, required fields and stage rules apply to those cells; the Task cell shows the task's name as a link, its Space and its stage.
- Linking to an existing task: where both have a value, the task's value wins.
- Unlinking keeps the row with its last values as plain text; the task carries on in its Space.

## 5. Child rows

- Any row can have child rows (one level).
- Linking a child row whose parent is linked creates a subtask of the parent's task, in the same Space.
- A child row can't be linked while its parent is plain.

## 6. Columns

- **Task field**: from the field library. Linked rows show and save the task's value; plain rows hold their own until linked (then the task's value wins if it has one).
- **Sheet only**: stays on the row, stays when linked, never touches the task.
- All columns can be shown, hidden, reordered and renamed in the Fields drawer.

## 7. Remove

- The linked Content and Video sheets as special sheets.
- Clip detail columns and fields (#, Source, File name, In, Out, Length, File), fully, including from the task panel.
- Bulk linking. Paste plan stays, and only creates plain rows.

## 8. Convert existing sheets

- Content sheet → the Content Space's Sheet view: themes → theme groups on their projects; pillars → pillar groups; every piece → a linked row.
- Video sheet → the Video Space's Sheet view: each video → a linked row; its clips → linked child rows.
- Custom columns and their values, formatting and comments carry over.
- Before the clip detail columns are removed, their values are exported to a CSV file and kept. Nothing else is deleted.

## 9. Check

- A plain row with typed values, then Make task → the task is in the chosen Space with those values.
- Editing a linked row's Caption shows in the task panel, and the other way round.
- Moving a linked row to another pillar changes the task's pillar.
- Unlinking keeps the row's values as plain text; the task stays in its Space.
- A linked child row is a subtask of the parent's task.
- The Sheets section is gone; every sheet opens from a Space, a Space › Brand folder or a Brand page.

## Decisions made while building

- **A row belongs to one Space's sheet** (`content_rows.space_id`), and a theme entry to one Space's
  sheet (`content_themes.space_id`); the same project can be a theme on several sheets. A task has at
  most one row per sheet, so a video can be a row on the Video sheet and a piece on the Content sheet.
- **The brand of a row** is its theme's project's brand; a Space › Brand folder shows that brand's
  themes. A theme whose project has no brand shows only on the Space's own sheet.
- **Each Space's sheet has its own columns.** The Content Space keeps the column store it always had
  (`content`); every other Space has `rows:<its id>`. The conversion moves the Video sheet's custom
  columns, and each other Space's task-sheet custom columns, to that Space's sheet; their values go
  with them.
- **The Brand page's Sheet view** shows one Space's sheet at a time, narrowed to the brand, with a
  strip of every Space and the number of the brand's rows on each. Each Space's sheet has its own
  columns, formatting and comments, so the Spaces aren't merged into one grid. "All tasks" on the same
  strip is the brand's tasks from every Space together (every linked row), with a Space column. The
  address (`?sheet=<space key>` or `?sheet=tasks`) decides which opens, then the one last opened for
  that brand, then the first Space that has rows for it. A saved Sheet view of a brand stays a task
  sheet (its filters and fields are about tasks).
- **Columns.** A sheet's own columns of a task (Type, Status, Assignee, the links, Date…) and every
  field of the field library are **task fields**; a column the team adds with a kind of its own is
  **sheet only**. A library field shows by itself while a task type in use carries it; any other is
  switched on from "+ Column › Task field" or the Fields drawer. Each sheet keeps its own place, width,
  name and on/off for a field column (`sheet_columns` with the key `f:<field id>`); renaming a column
  on a sheet doesn't rename the field in the library. Removing a task-field column from a sheet hides
  it there; the tasks keep their values. A linked row whose task type doesn't carry the field shows the
  cell as not applicable.
- **Make task** takes the Space's rules (spec 024): the task starts at that Space's "Starts at" stage,
  on its board when it is a board, with its default type, assignee and priority; only people who may
  create there can. The row's date becomes the publishing date. Values in task-field columns go to the
  task when its type has that field; values in sheet-only columns stay with the row's cell.
- **Connecting an existing task**: it must be in the chosen Space; the task's values win and the row's
  fill only what the task lacks. The task joins the row's theme and pillar.
- **Unlink** keeps the row's title, date, task-field values, sheet-only values and its stage as plain
  text. The task keeps its theme and stays in its Space; it is marked so the Content sheet doesn't give
  it a row again (`tasks.sheet_row_off`), and Make task › an existing task clears that mark.
- **A child row** makes a subtask in its parent task's Space, starting where that Space starts; under
  a video it makes a clip, by the clip rule of spec 024.
- **A plain row's stage** is typed as one of the Space's stage names and kept as a label.
- **Paste plan** creates plain rows only, on the sheet it is pasted into. A pasted task link no longer
  links or updates a task. A title that is already a plain row of the theme, or a linked row of this
  sheet, is skipped.
- **The Content sheet still adds a linked row for a new task in one of its themes** (as sheet 2b did),
  so work started on the board appears in the plan. Other Spaces' sheets hold only what is put on them.
- **Conversion** (run once by the seed): rows and themes without a Space go to the Content Space;
  each video the Video sheet listed becomes a linked row on the Video Space's sheet with its clips as
  linked child rows. A video with no project sits under a catch-all theme for its brand,
  "Videos · <brand>", created for this. The clip details are exported first to `clip-details.csv`,
  kept in the database and downloaded from Settings › Diagnostics; the `task_clips` records are not
  deleted either.

## Changed on 24 Nov 2026 (user), after the build

- **A theme is not a project.** "+ Theme" asks for a name and nothing else. It is never picked from
  the projects, and it belongs to one Space's sheet: another Space's sheet may use the same name, and
  nothing links the two. A theme added in a Space › Brand folder or on a brand's page belongs to that
  brand. (This replaces "A theme is mapped to a project" in §2 and "the same project can be a theme on
  several sheets" above, for themes added from now on. Themes that existed before are left as they are,
  including the "Videos · <brand>" ones.)
  *Still true underneath:* each theme keeps a record of its own in the projects table, which holds its
  name, brand and pillars and is what a linked row's task points at as its theme. Separating that
  fully was offered and declined: the user keeps it connected behind the scenes. Themes from several
  Spaces are to be collected and connected in a dashboard, later; nothing is built for that now.
- **No "Linked" tag** on a sheet's title or tab: every sheet is the same kind of sheet.
- **The sheet's toolbar** keeps "+ Column" and "+ Theme" only; **no brand filter or "Group by brand"**
  on a Space page; **the old Sheets section's blank sheets are removed** (kept first as CSV exports).
- **View tabs**: the home view shows a home icon and a pinned view a pin icon before its name.


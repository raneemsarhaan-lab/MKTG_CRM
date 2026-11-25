# Quickstart: validating the Sheet view rebuild

## Prerequisites

- Local Postgres with the lab database (`momentum`) seeded by `scripts/migrate.sh`; dev server on port 3100 (`/tmp/claude-0/dev.sh`).
- For Stage D: a copy restored from a fresh live backup (never the live database).

## Run

```bash
BASE=http://localhost:3100 node scripts/spaces-lab/realapp/run.cjs 027
```

Runs every `027-*` scenario; the full suite (`run.cjs` with no filter) must stay green before each push.

## Expected results per stage

**A — views and tabs**: clicking Sheet, refreshing on it and opening its link each show the workbook within 2 s; the Board's Cards/List toggle never shows the workbook; a view can be renamed, duplicated, deleted (built-ins can't); the page reopens on the last view per Space and folder.

**B — Board tab and linking**: with "Mine" on the Board, the Board tab lists the same task ids; a stage move on the board shows in the tab and the reverse; "+" adds a blank unlinked tab and the Board tab is unchanged; linking a tab with 3 titled rows and 1 untitled shows "create 3", creates 3 tasks in the first stage, leaves 1 plain row; unlink then link again shows "Reconnects 3" and creates 0; "Make task" on one row creates 1 task and a later link creates only the others; in Content › Forefront, created tasks have Brand = Forefront; the Board tab's menu shows "always linked".

**C — structure**: a theme picked from a project shows the project's owner, frequency and audience; a pillar is added to the project; Tab makes a child row (a subtask when linked); dragging a linked row to another pillar changes its task's pillar; deleting a pillar asks where its rows go and deletes none.

**D — columns and conversion**: two people's column layouts in one tab stay separate; the conversion report on the backup copy lists every old tab and its destination, and before/after counts match; after applying, the Content Space's Board tab shows the former Content sheet's rows, columns, values, formatting and comments.

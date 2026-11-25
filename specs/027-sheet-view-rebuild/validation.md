# Validation: Sheet view rebuild (spec 027)

What was checked, where, and the result. Lab database `momentum` (local), dev server on port 3100, the
real-app suite `scripts/spaces-lab/realapp/run.cjs` (Playwright).

## Stage A — views and tabs (US1)

| Check | Scenario | Result |
|---|---|---|
| Sheet opens on click, on refresh and from its link | `027-us1-sheet-opens-on-click-refresh-and-link` | pass |
| Board Cards / List never opens the sheet | `027-us1-board-cards-list-never-opens-the-sheet` | pass |
| View tab menu: Rename, Duplicate, Delete (asks); built-ins can't be deleted | `027-us1-view-tab-menu-rename-duplicate-delete` | pass |
| The page reopens on the last view | `027-us1-page-reopens-on-the-last-view` | pass |

## Stage B — the Board tab (US2)

| Check | Scenario | Result |
|---|---|---|
| Mine on the Board = the same tasks in the Board tab; Everyone shows the rest; "No theme" group | `027-us2-mine-on-board-same-tasks-in-board-tab` | pass |
| A stage move shows in the Board tab | `027-us2-stage-moves-show-in-the-board-tab` | pass |
| The Board tab is first, linked, not draggable; its menu says it is always linked | `027-us2-board-tab-is-always-linked` | pass |
| A Space › Brand folder's Board tab holds that brand's tasks only | `027-us2-folder-board-tab-is-its-brand-only` | pass |
| A task's row in the Board tab is archived, not deleted or unlinked | `2b-delete-row-pillar-theme`, `026-linked-row-and-panel-share-one-caption` | pass |

## Stage B — linked and unlinked tabs (US3)

| Check | Scenario | Result |
|---|---|---|
| "+" adds an unlinked tab; the Board tab stays first | `027-us3-plus-adds-unlinked-tab` | pass |
| Link: "create 3", 1 untitled stays plain, 3 tasks in the first stage on the board; unlink keeps tasks and remembers them; link again "reconnects 3", creates 0, no duplicates | `027-us3-link-unlink-relink-no-duplicates` | pass |
| Make task on one row, then link the tab: only the other row is created | `027-us3-make-task-then-link-no-duplicate` | pass |
| A new row in a linked tab is a task on the board | `027-us3-new-row-in-linked-tab-is-a-task` | pass |
| Add existing task to two tabs; remove from one tab keeps it; Archive the task archives it, the row stays | `027-us3-existing-task-in-two-tabs-remove-and-archive` | pass |
| A Content › Forefront tab makes tasks with Brand = Forefront | `027-us3-folder-tab-makes-its-brand-tasks` | pass |
| A member can't link or delete someone else's tab | `027-us3-only-creator-or-admin-links-a-tab` | pass |

Screens: the tab menu and the Link to board dialog in English and Arabic (RTL), checked by eye.

## Stage C — structure (US4) and Stage D — columns (US5)

| Check | Scenario | Result |
|---|---|---|
| A theme on a tab is the tab's only; + Pillar; Enter on "+ Row" adds the next row | `027-us4-tab-theme-pillar-and-rows` | pass |
| A child row under a task in a linked tab is a subtask of it | `027-us4-child-row-in-linked-tab-is-a-subtask` | pass |
| Moving a linked row to another pillar moves its task | `027-us4-moving-a-linked-row-moves-its-task` | pass |
| Removing a pillar keeps its rows (no pillar, same theme) | `027-us4-removing-a-pillar-keeps-its-rows` | pass |
| Removing a theme in a tab sends its rows to "No theme"; the project stays | `027-us4-removing-a-theme-in-a-tab-keeps-its-rows` | pass |
| Hiding a column in a tab is mine only, and that tab's only | `027-us5-columns-per-tab-and-person` | pass |

Known limit: Tab (indent) on an existing task's row nests the row under its parent but does not make the
task a subtask; a new child row under a task is one.

## Stage D — conversion (US6)

`scripts/release/sheet-convert-report.sh` (read only) lists every tab and where it goes. On the copy of
the live data taken on 24 Nov 2026 it found nothing to move: the Content and Video sheets are already
those Spaces' Board tabs, and every spreadsheet tab is already in its Space's Sheet view (cells,
formatting and comments untouched). It must be run again on a copy of a fresh backup before release.

## Database

Additive schema only (`scripts/schema-guard.sh` passes): `sheets.linked`, `sheets.space_id`,
`content_rows.sheet_id`, `content_rows.last_task_id`, `content_themes.sheet_id`, two new uniques, and
`content_rows.project_id` may be empty. Row counts of `content_rows`, `content_themes` and `sheets`
were the same before and after the push on both lab databases.

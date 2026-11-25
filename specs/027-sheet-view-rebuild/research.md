# Research: Sheet view rebuild

All decisions below resolve the Technical Context; no NEEDS CLARIFICATION remain. Owner-level choices are in spec.md › Clarifications.

## R1. What the Board tab is

- **Decision**: The Board tab is the Space's existing rows sheet (`content_rows` + `content_themes` + pillars, rendered by ContentSheet/ContentGrid). It is extended to show every task on the board: a task with no row is shown under its theme (`tasks.project_id`) and pillar, or in "No theme" last. The Content and Video Spaces' Board tabs are today's `linked_content` / `linked_video` sheets; other Spaces get a `kind 'board'` sheet record in their node workbook.
- **Rationale**: The rows sheet already has themes, pillars, plain rows, child rows, Make task, paste plan, per-person columns and live status. Reusing it keeps every existing row, value, format and comment in place, which makes the Content/Video "conversion" a mapping, not a copy (FR-042, SC-005).
- **Alternatives**: A new task grid for the Board tab (rejected: duplicates the rows feature and loses plain rows); keeping TaskSheet for non-Content Spaces (rejected: two different Board tabs).

## R2. Added tabs

- **Decision**: "+" adds a `sheets` record of `kind 'rows'` with `linked = false`. Its rows are `content_rows` with `sheet_id` set and `space_id` NULL (so the Board tab's unique `(space_id, task_id)` doesn't apply), unique `(sheet_id, task_id)`. Themes are projects in every tab (the owner's prompt, §5), placed on a tab by `content_themes.sheet_id`, so the Board tab's themes, pillars and rows code serves every tab.
- **Rationale**: One row model for every tab, so linking, Make task, child rows and paste behave the same everywhere.
- **Alternatives**: A separate `tab_rows` table (rejected: duplication); blank spreadsheet tabs as the only added tab (rejected: no groups, no child rows).

## R3. Old spreadsheet tabs (`kind 'blank'`)

- **Decision**: They stay spreadsheets (cells, formulas, formatting, comments) and count as unlinked tabs. "Link to board" on one runs the same wizard: rows become a `kind 'rows'` tab's rows (with values and a back-reference), the original spreadsheet tab is kept hidden, never deleted, until the owner approves removing it.
- **Rationale**: FR-044 (formatting and comments carry over) holds by construction for tabs that are not linked; linking is an explicit, previewed step.
- **Alternatives**: Convert every blank tab to rows tabs in the conversion (rejected: loses spreadsheet formatting and formulas).

## R4. Remembering a row's task (no duplicates)

- **Decision**: `content_rows.last_task_id` keeps the task a row was linked to after "Unlink row" or "Unlink from board"; `task_id` is cleared. Linking reconnects rows whose `last_task_id` task still exists (and isn't archived beyond recovery) and creates tasks only for titled rows with neither. The link preview returns `{ create, reconnect, untitled, conflicts }` from a pure function (`src/lib/tab-link.ts`) so the dialog and the server use the same count.
- **Rationale**: SC-004 (never a duplicate) becomes a property of one function that the labs can test.

## R5. Shared Mine/Everyone and filters

- **Decision**: The Board view's Mine/Everyone and filters are kept per page in the person's browser storage (where Mine/Everyone already lived); the Board tab reads the same keys and applies the same predicate (`scope` + `applyBoardFilters`). Server-side prefs are a follow-up if needed across devices.
- **Rationale**: FR-010/SC-002 need one source of truth, not two filters that happen to match.

## R6. Live updates

- **Decision**: Both views read the page's BoardData; edits go through the same server actions and `router.refresh()`; the existing pulse poll refreshes other people's changes. Linked rows render task fields from tasks, never from copies.
- **Rationale**: SC-003 (≤5 s) is met by the current refresh path; no new realtime channel.

## R7. Permissions

- **Decision**: `sheet-tabs.ts` checks: add tab = may use the node (Space member, visible-to-everyone Space, admin, superuser); link/unlink/delete/rename = tab creator, admin or superuser; Board tab = never. Theme add = admin/superuser; pillar add = + theme owner (project owner).
- **Rationale**: Constitution III; FR-025, FR-047.

## R8. Views (Stage A)

- **Decision**: Saved views get `renameView` and `duplicateView` actions; the view tab menu lists Rename, Duplicate, Set as default (the existing "home"), Delete (saved views only), Pin, Hide. The Board's Cards/List toggle maps to the existing card board and the compact list (ListView of the board's tasks in stage groups); the toggle's former "sheet" option is removed from the Board.
- **Rationale**: FR-003 to FR-005 with the smallest change to ViewHost.

## R9. Conversion (Stage D)

- **Decision**: A read-only report script runs on a copy restored from a fresh backup: per tab, its destination and counts (rows, cells, formats, comments, columns, values, tasks). Applying it (a `once()` seed step) sets the Content/Video sheets as Board tabs, moves old team-folder tabs into the matching Space's workbook (folder change only), and lists tabs without a match for the owner. Nothing is deleted.
- **Rationale**: The release rules (backup, counts, dry run, report, approval).

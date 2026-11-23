# Validation: spec 021 (ClickUp parity, the foundation)

Recorded 2026-11-23 on the branch `claude/wonderful-dirac-k1wflu`, against a
local database seeded with the demo data. Each quickstart step maps to the
automated scenario that checks it; the full regression ran green the same
day (see spec 022 T061).

Later specs changed some of what spec 021 built. Those steps are checked
against the current behaviour and marked **changed by 022**.

## Stage A: Spaces and the hand-off

| # | Step | Result | Checked by |
|---|---|---|---|
| 1 | Sidebar: Me, Teams, Brands; a Video Editor sees only Video | Pass | `us1-sidebar-admin`, `us1-sidebar-video-editor` |
| 2 | Starting Shows in | Pass | `us1-space-lists-shows-in`, `us1-shows-in-add-remove` |
| 3 | Hand-off from Advance | Pass, **changed by 022**: the box now links media tasks, one row per board | `us6-advance-opens-box-and-confirms`, `us6-cancel-changes-nothing`, `022-us2-*` |
| 4 | Assign first: no box | **Changed by 022**: assigning a designer doesn't link; the box opens once at Ready For Design, unless already linked | `us6-already-linked-no-box`, `022-us3-designer-assignee-not-on-board` |
| 5 | Every one-task path opens the box | Pass (stage menu, Board, sheet typing) | `us6-stage-menu-opens-box`, `sheet-stage-needs-handoff-opens-box` |
| 6 | Bulk: "2 need a hand-off" | Rule passes (`pure-needs-handoff-matrix`); the bulk message itself not re-checked by hand in this pass | `bulkUpdateTasks` counts `handoff` |
| 7 | Paste plan skips Ready for Design rows | Not re-checked in this pass | — |
| 8 | Users create their own tasks | Pass | `us6-user-creates-own-task-in-space` |
| 9 | Names: Plan, Mine / Everyone | Pass | `us1-renames` |
| 10 | Lab passes | Pass | `npm run lab:spaces` (all pure checks) |

## Stage B: Views, brands, Me

| # | Step | Result | Checked by |
|---|---|---|---|
| 1 | Calendar navigation, ✓ on finished work, drag with Undo | Pass (by publishing or due date since the dates work) | `us2-calendar-navigates-and-drags`, `us2-calendar-no-date-panel` |
| 2 | Campaign filter | Pass | `us2-calendar-navigates-and-drags` |
| 3 | Brand Sheet | Pass | `us2-brand-folders`, `workbook-*` |
| 4 | Space Sheet tab is today's Content sheet | Pass | `us2-space-sheet-is-todays-content-sheet`, `workbook-content-space-is-content-folder` |
| 5 | Assets and Library | Pass | `us1-brand-page`, `us2-brand-folders` |
| 6 | Saved views, personal and shared | Pass | `views-personal-saved-and-reloaded`, `views-shared-filter-and-readonly`, `views-shared-readonly-for-users`, `views-home-pin-hide` |
| 7 | My tasks | Pass | `us2-my-tasks`, `workbook-me-private` |
| 8 | My sheets | Pass | `workbook-me-private`, `sheet-my-notes-private` |
| 9 | Performance on 5,000 tasks (SC-003) | **Not run here**: needs the perf seed and timing on the deployed server | — |

## Stage C: Words, features, simple tasks

| # | Step | Result | Checked by |
|---|---|---|---|
| 1 | Status words | **Replaced by 022 US4 (Space stages)** | `022-us4-*` |
| 2 | Content and Video words | **Replaced by 022 US4**: the Content and Video sheets read their Space's stages | `022-us4-content-sheet-uses-space-names` |
| 3 | Brand features | Pass | `us4-switch-off-hides-for-that-brand-only`, `us4-sla-off-removes-badges`, `us4-defaults-in-settings-and-admins-only`, `us4-users-see-no-switches` |
| 4 | Islam Check per brand | Pass | `us4-islam-check-new-tasks-only` |
| 5 | Simple tasks | **Removed by 022 US1**: every task is a pipeline task | `022-us1-*` |
| 6 | Mixed parent | **Removed by 022 US1** | — |

## Accessibility (T073)

`scripts/spaces-lab/realapp/axe-022.cjs` runs axe (serious and critical) on a
Space's List, Board and Calendar, a brand page, My tasks, the Space stages
panel and the Link task list — in English, Arabic and on a phone. Sign-in
comes from `LAB_EMAIL` / `LAB_PASSWORDS`.

Fixed in this pass: the view tabs were a `tablist` holding the ⋯ menu
buttons (now a toolbar of pressed buttons); both pickers' lists had a
message and no name inside the `listbox`; calendar day numbers and the
Space tag were too faint.

Still open (pre-existing, app-wide; HANDOVER §14):
- **Colour contrast** of secondary text on tinted backgrounds — board card
  details, column subtitles, list row details, calendar weekday names. The
  fix is darker `PIPE.textMuted` / `placeholder` tokens across the app, a
  design decision.
- **Board cards**: the card is one button with buttons inside it
  (`nested-interactive`, `label-content-name-mismatch`).

## Not covered here

- Performance (Stage B step 9): needs the deployment.
- Native Arabic review of the new strings: listed in HANDOVER §14.

# Validation: Task types and fields (spec 023)

Run on the branch `claude/wonderful-dirac-k1wflu`, 23 Nov 2026, against the local
lab database and dev server. Each quickstart step, the check that covers it, and
the result.

## Quickstart steps

| # | Step | Covered by | Result |
|---|---|---|---|
| 1 | Types: Arabic name, icon, colour; SLA and boards kept | `023-types-page-admin-edits`, `023-types-page-user-reads`, `023-panel-type-picker-*` | Pass |
| 2 | Fields: create Caption, attach to Post, required from C-Review; seen in panel and sheets | `023-fields-button-*`, `023-sheet-field-column-type-and-hatched`, `023-panel-caption-tov-channels` | Pass |
| 3 | Required: every move path refused naming the field (only moves that cross the stage) | `023-required-field-blocks-move`, `pure-required-*` | Pass |
| 4 | Make it a task field keeps values | `023-make-it-a-task-field` | Pass |
| 5 | Not applicable: hatched cell refuses typing | `023-sheet-field-column-type-and-hatched` | Pass |
| 6 | Status groups in filters and list grouping | `023-status-groups-and-milestones` | Pass |
| 7 | Milestones on brand and Space calendars; users can't add | `023-status-groups-and-milestones`, `023-milestones-user-cannot-add` | Pass |
| 8 | Priorities: Medium reads Normal; Urgent first and notifies | `023b-priority-normal-urgent-first-notifies` | Pass |
| 9 | Tags: create while tagging, no duplicates, merge | `023b-tags-create-filter-merge` | Pass |
| 10 | Assignees: lead, hours split, second assignee moves a working stage | `023b-assignees-lead-hours-and-moves`, `023b-other-assignee-may-move-working-stage` | Pass |
| 11 | Start date: refused after due; calendar spans; 2 h a day over Sun–Thu | `023c-start-date-panel-refuses-after-due`, `023c-workload-spreads-and-calendar-spans`, `pure-start-dates` | Pass |
| 12 | Templates: save a task with two subtasks; create for 30 Dec; names, fields, people, dates; editing the template leaves the task | `023d-save-as-template-and-create-from-it`, `pure-templates` | Pass |
| 13 | Recurring: weekly Sunday; made once on its creation day; Skip next; short lead refused naming the minimum; standing project counts it; Stop repeating | `023d-repeat-weekly-once-skip-stop`, `pure-recurrence` | Pass |

## Success criteria

| SC | Result |
|---|---|
| SC-001 one value, every sheet | Pass (steps 2, 4) |
| SC-002 required fields on all move paths | Pass (step 3) |
| SC-003 no Medium left; old assignee is lead | Pass (`priority-normal-v1`; step 8, 10) |
| SC-004 template with 2 subtasks, no edits needed | Pass (step 12) |
| SC-005 8 weeks → exactly 8 tasks, on time, no duplicates after a missed day | Pass: `scripts/spaces-lab/recurring-8-weeks.ts` runs the real job on a simulated clock for 14 weeks, skipping every Tuesday and running twice on Thursdays: 8 occurrences, none twice, each on its creation day or the run after it |
| SC-006 first screen under 2 s with 5,000 tasks | **Not run here**: needs the production build on the deployed server with the perf seed (same as spec 021) |

## Regression (T089)

| Check | Result |
|---|---|
| Typecheck | Pass |
| `lab:spaces` (pure checks) | 29/29 |
| `lab:sheet` | 156/156 (its task-fields stub was missing `makeTaskField` since Stage A; added) |
| `lab:spreadsheet` | 40/40 |
| `lab:inbox` | 30/30 |
| `lab:notify` | 48/48 (n8 updated for the new Urgent setting). `n4-scroll` is intermittent: now and then a "something new arrived" refresh adds a fourth page request during the scroll; not related to spec 023 |
| `lab:hours` | 8/8 |
| Every real-app scenario (specs 021–023) | 94/94 |
| `axe-023.cjs` (Task types tabs, My tasks, Workload week, Repeat box, Search, From template box; English, Arabic, phone) | All pass, after fixes: darker grey on Task types and My tasks, no buttons inside the My tasks row button, labels on the Repeat box, search results as a plain region |

## Not built, or built differently

- Design pages for Stages B–D (T041, T063, T071) were not made separately; screenshots were shown after each stage (`design/shots-023cd/`).
- Templates: no "new row from template" in sheets (T077). A repeat rule can be driven by a template on the server (`repeat_rules.template_id`), but the Repeat editor is only on tasks.
- Filters and group-by by a custom field's value: still deferred (T031 note).
- Tags are not a sheet column (they're in the Fields button, list, cards and filters).
- The task panel still has the older grey-text contrast findings (stage chip, Copy ID, empty date placeholders) recorded in HANDOVER §14; the axe run checks only what spec 023 added there.

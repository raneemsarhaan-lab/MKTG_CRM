# Contracts: Screens

Selectors are for the real-app scenarios. Each stage's screens are designed and approved (design gate) before they're built; the layouts below are the outline the design fills in.

## Stage A
- **Settings › Task types** `[data-task-types]`: one row per type `[data-task-type="<label>"]` with icon, colour, names, default priority and tags, SLA and boards links. Users see it read-only.
- **Settings › Fields** `[data-fields]`: the library `[data-field-row]`; "New field" `[data-field-new]`; per field, the types it's attached to with "Required from" `[data-field-required="<label>"]` (a stage menu, or Optional).
- **Task panel**: a Fields section `[data-fields-section]` with one editor per attached field `[data-field="<id>"]`; required ones marked with the stage they're needed by.
- **Cards**: fields with `on_card` as small values under the title.
- **Sheets**: columns `f:<id>`; cells `[data-cell$="|f:<id>"]`; not-applicable cells hatched. Column menu: "Make it a task field" `[data-make-field]` on a custom column (admins, superusers).
- **Refused move**: the sheet's message line, the board's drag error and the panel's stage menu all show "Caption is required before C-Review".
- **Filters / group-by**: Status group (Not started, Active, Done, Closed); each field by kind.
- **Milestones**: calendar day chip `[data-milestone]` with a flag; "Add milestone" `[data-milestone-add]` on a day (admins, superusers).

## Stage B
- **Priority**: menus list Urgent, High, Normal, Low, No priority; Urgent shows a red flag.
- **Tags**: picker `[data-tag-picker]` with search and "Create tag ‘…’" `[data-tag-create]`; chips `[data-tag]` on cards and in the panel; sheet column `tags`; Settings › Tags `[data-tags-settings]` with rename, colour, merge `[data-tag-merge]`, delete.
- **Assignees**: picker `[data-assignees]` with order (lead first, marked "Lead"), hours per person; cards show up to 3 avatars.

## Stage C
- **Start date**: task panel row and sheet column `start`; calendar toggle "Spans" `[data-cal-spans]`.

## Stage D
- **New from template**: "+ Task" menu `[data-new-from-template]`, sheet new row and calendar day; a picker filtered by type.
- **Settings › Templates** `[data-templates]`; "Save as template" in the task panel menu.
- **Repeat**: panel row `[data-repeat]` with the rule editor; ↻ on cards and rows; "Skip next" and "Stop repeating".

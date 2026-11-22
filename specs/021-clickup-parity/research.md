# Research: Brands, Team Spaces and Views (spec 021)

Each decision is checked against the code as it is today, with file references. The inventory behind them came from three read-throughs of the repository on 2026-11-22.

## What exists today (the facts the decisions rest on)

**Stage moves**

- One rule, `allowedStages` (`src/lib/stage-moves.ts:40-46`), decides moves:
  - someone who holds a stage may move a task to any stage on its path;
  - admins and superusers override.
- It is used by:
  - `moveTask` (`src/actions/tasks.ts:39`);
  - `setTaskStage` (:86), which serves the stage menu, Board drag, the Inbox and sheet cells;
  - `bulkUpdateTasks` (:745).
- **Board drag already moves across columns** (`KanbanBoard.tsx:308-351`). HANDOVER §7 is stale on this.
- `addPlan` (`src/actions/content.ts:196-232`) sets stages directly, bypassing `allowedStages`.

**Visibility and permissions**

- `loadBoardData` (`src/lib/board-data.ts:14`) loads every task for every tier. Filtering is client-side (`KanbanBoard.tsx:268-275`).
- `requireTaskCreator` (`src/lib/authz.ts:52`) refuses `user` access. `createTasksForRows` (`src/actions/sheet-links.ts:336`) does too.
- `createSubtask`, `addClips` and `addPiece` are open to users under their own checks.

**Stages and statuses**

- `Task.status` is a foreign key to `stages` (`schema.prisma:279,329`).
- `tasksByStage` drops statuses that aren't stages (`KanbanBoard.tsx:284`).
- Many places read `STAGE_META[status]` unguarded (TaskModal :629, :1957, `home-metrics.ts`, sheets).

**Sheets**

- The linked sheets are singletons. `SheetFolder.linked_key` and `Sheet.linked_key` are `@unique`.
- Columns are keyed by kind (`SheetColumn.sheet` is 'content' or 'video'), and so are row heights.
- The Content sheet's rows are pieces in themes (`content/rows.ts:22`). The Video sheet's rows are top-level Video tasks plus their clips (`sheet/rows.ts:20-38`).
- Neither sheet filters by brand.

**Status words (spec 019)**

- Blank sheets keep them in `sheet.task_map.words`. Linked sheets keep them in `sheet.view.words` (`sheets.ts:949`).
- Matching is in `sheet-links.ts:98-137`.
- Built-in names are `content.stage.*` (Planned, Writing, Content Review…) and `sheet.stage.*` (Script, Editing, Final Cut…).

**Roles**

- Seeded roles: Marketing Manager, Managing Director, Brand Director, Digital Marketing Specialist, Content Creator, Graphic Designer, Video Editor (`prisma/seed.ts:149-155`).
- Role regexes already steer sheet defaults (`sheet/columns.ts:29-41`) and the Board's upstream toggle (`stage-meta.ts:174`).

**Brands and projects**

- Brand assets are URL links managed only in Settings, and are admin-only (`settings.ts:104`).
- Projects (including themes) are the only campaign concept; there is no campaign field (`schema.prisma:259`).

**Pages and names**

- No calendar exists anywhere.
- The `/overview` page is Working Hours. The old My Day components are not mounted.
- The nav is Overview, Board, Sheets, Team and Settings (`src/lib/nav.tsx:23-31`). `/projects` and `/capacity` are hidden.
- The Board toggle is labelled "My tasks / Team tasks" (`messages/en.json:949-951`).

**Sheet folders and tooling**

- Pins are `Member.sheet_pins`. Every folder is visible to everyone, and anyone can rename or delete team folders (`sheets.ts:93-159`).
- Testing is labs only (`scripts/*-lab`), plus `typecheck`. There is no unit test framework.

---

## R1. Where simple tasks keep their status

- **Decision**: add `tasks.kind` ('pipeline' | 'simple', default 'pipeline') and `tasks.simple_status` ('s-todo' | 's-doing' | 's-done', null for pipeline tasks). A simple task keeps `status = 'todo'` only to satisfy the foreign key. Every pipeline reader filters on `kind = 'pipeline'`.
- **Rationale**: `status` is a foreign key to `stages`, and many places assume any status is a pipeline stage:
  - the Board buckets;
  - SLA (`alert-status.ts`);
  - review queues and Inbox;
  - `STAGE_META` lookups;
  - the Content and Video sheets.
  A separate column keeps all of them correct, provided they skip simple tasks. That is one filter in `loadBoardData` consumers, rather than a change to every reader.
- **Alternatives considered**:
  - Three new `stages` rows. Rejected: every pipeline reader would treat them as stages, and the constitution's stage table would grow.
  - A separate SimpleTask table. Rejected: comments, attachments, followers, notifications, subtasks and the task panel would all need to be duplicated.

## R2. How Shows in is stored

- **Decision**: a join table, `task_spaces(task_id, space_id, added_via, added_by, added_at)`, with a composite primary key. `added_via` records why the Space was added: 'created', 'assignee', 'handoff', 'manual' or 'migration'.
- **Rationale**:
  - Membership is many-to-many.
  - Removing a Space is one delete.
  - "Why is this here?" can be shown in the task panel.
  - It loads as one flat array beside the tasks.
- **Alternatives considered**: a `String[]` column on tasks. Rejected: no foreign key, no record of why, and harder to index by Space.

## R3. Space membership from roles

- **Decision**: `team_space_members(space_id, member_id)`, filled once by `once('spaces-v1')` from job roles:

  | Role | Spaces |
  |---|---|
  | Video Editor | Video |
  | Graphic Designer | Design |
  | Content Creator | Content, Planning |
  | Digital Marketing Specialist | Content, Planning |

  Admins edit it afterwards. Later role changes don't move anyone (clarification: "start from roles, editable"). Admins see every Space regardless of membership.
- **Rationale**: it matches the clarification, and the roles already exist in the seed. It avoids a role regex at run time; `columns.ts` does use regexes today, but those only set defaults.
- **Alternatives considered**: deriving membership from roles on every read. Rejected: the user chose editable membership.

## R4. The hand-off rule lives in the move core

- **Decision**: one pure function, `needsHandoff(task, target, taskSpaces, spaces)`. It is true when all of these hold:
  - `task.kind === 'pipeline'`;
  - the current stage is before `r-design`;
  - the target is `r-design` or later;
  - the task shows in no Space with `is_production = true`.

  `setTaskStage` and `moveTask` call it after `allowedStages` and return `{ success: false, error: 'needs_handoff', defaults }`, where `defaults` holds the pre-ticked Spaces and their candidate assignees. Clients on one-task paths open `HandoffDialog`. The dialog calls `handOff(taskId, { spaceIds, assigneeId, target })`, which in one transaction:
  1. re-checks `allowedStages`;
  2. adds the Spaces;
  3. sets the assignee, then notifies and follows, as `updateTask` does today;
  4. moves the stage;
  5. returns `shouldCelebrate` exactly as `setTaskStage` would.

  `bulkUpdateTasks` and `addPlan` call the same function and count refusals (FR-030a).
- **Rationale**: every path already goes through these actions (inventory above). Putting the rule there means no path can skip it, and the UI only reacts to an error code.
- **Covered paths**: Advance, the stage menu, Board drag, Inbox, and Content, Video and team sheet cells (each a single `setTaskStage` call). Fill and paste in sheets send one call per cell, so each needing task opens the box one at a time. To avoid a run of boxes, fill and paste count them as refused and say "Open the task to hand it off", the same as bulk.
- **Alternatives considered**: a client-only check. Rejected: bulk, paste and Inbox would slip past, and ground rule 9 requires a server check.

## R5. Status words: one matcher, two stores

- **Decision**:
  - The Content and Video Spaces use their sheets' existing `sheet.view.words`. Their Sheet tab *is* that sheet (clarification), so there is one list, not two.
  - The Design, Planning and future Spaces use `team_spaces.words`, shaped like `SheetTaskMap.words.stage` (`types/index.ts:651`), plus three simple statuses.
  - `space-words.ts` wraps `matchStage` (`sheet-links.ts:133`) so matching rules stay identical.
  - Boards never use words (FR-013a).
  - Prefill: Content words come from `content.stage.*` and Video words from `sheet.stage.*`. These are already the sheets' built-in names, so nothing changes for those teams on day one.
- **Rationale**: no change to spec 019 storage, and no duplicated matching.
- **Alternatives considered**: moving the sheets' words into `team_spaces`. Rejected: it rewrites `useLinkedView` and `applyLinkedFormats` for no visible gain.

## R6. A brand's Sheet

- **Decision** (clarification: brand filter, shared columns):
  - The brand's Sheet Folder renders today's Content and Video sheets with a `brandId` filter applied to their row builders. `buildContentRows` and `sheetVideos` gain an optional brand predicate.
  - Columns, words, formats and row heights stay keyed by kind, as today.
  - The brand's own blank tabs live in one `SheetFolder` with `kind = 'brand'` and `brand_id` set (unique). It is created lazily on first open.
- **Rationale**: the `linked_key @unique` constraints and kind-keyed columns stay untouched. The change is a filter on two pure row builders.
- **Alternatives considered**: separate linked sheets per brand. Rejected by the user (large storage change).

## R7. Views and "My notes"

- **Decision**: `saved_views(id, node, type, name, config Json, owner_id?, position, created_by)`.
  - `node` is a string key: 'everything', 'me', 'space:<id>', 'brand:<id>' or 'brand:<id>:<folder>'.
  - A null `owner_id` means the view is shared; otherwise it is personal.
  - `config` holds filters, grouping, sort, visible fields and order.
  - A node with no saved views shows its default tabs: List, Board, Sheet, Calendar and Workload for Spaces and brands; Files and Gallery for Assets and Library.
  - **My notes** on My tasks is a regular column stored the same way as the linked sheets' team columns (`SheetColumn` and `SheetValue`). The sheet key is `me:<memberId>`, so values are per member and per task, and only that member's My tasks loads them.
- **Rationale**: it reuses the column and value machinery the Content sheet already uses for its own columns (spec 010).
- **Alternatives considered**: a notes field on the task. Rejected: other people would see it.

## R8. Board, List and Calendar for a Space or brand

- **Decision**:
  - `BoardView` renders the existing `KanbanColumn` and `TaskCard` over a filtered task list, with the same `moveTo` handler. A `taskFilter` prop is extracted from `KanbanBoard`; `/board` keeps the unfiltered list.
  - Simple tasks get three dashed columns after the pipeline.
  - `CalendarView` is new, with pure grid maths in `src/lib/calendar.ts`. Dragging a task calls `updateTask({ due_date })`. Month or week is stored as `momentum.calendar.mode`.
  - `ListView` groups by stage, or by brand in a Space.
- **Rationale**: the Board stays one implementation (FR-013a), and only Calendar is new.
- **Alternatives considered**: a new board component. Rejected: two Boards would drift.

## R9. Constitution 3.0.0 (Stage 0) — draft points

1. **Tech stack**: Next.js 16 App Router, Prisma 5 (pinned) with PostgreSQL on Cranl, a custom HMAC session (`src/lib/session.ts`), next-intl, @dnd-kit, Zustand without persist. No Supabase. Authorization lives in server actions (no RLS).
2. **§II**: the 11 stages and owners as in `stage-meta.ts`. C-Check is optional per task, now set from a per-brand default. A second workflow, **simple tasks** (To Do, In progress, Done), with no SLA, owners or terminal stage. Rename "nine-stage" to "with C-Check".
3. **§III**: the tiers stay. Users may create tasks they own. Admin-only: Settings, members, Spaces, brand features. Superusers may edit Space words.
4. **§V**: a simple task moved to Done celebrates for its assignee.
5. **§VI**: "Supabase" wording removed. State follows the server-component and server-action pattern already in use.
6. Version 3.0.0 (MAJOR: §II redefined), with a sync report as before.

## R10. Users creating their own tasks

- **Decision**: add `requireTaskCreatorFor(ownerId)` in `authz.ts`. Admins and superusers may create for anyone. Users may create only with `task_owner_id = self` and an assignee of themselves or nobody.
- It is used by `createTask`, `createTasks` and `createTasksForRows`. The column "+" (`KanbanBoard.tsx:1182`) and `canCreate` (`sheet-links.ts:327`) open up to match.
- The hand-off can still set someone else as assignee, because `handOff` is checked by `allowedStages`, not by the creator rule.
- **Rationale**: it is the narrowest change that satisfies the clarification.

## R11. Brand feature switches and the Islam Check default

- **Decision**:
  - `brands.features` holds overrides only. A missing key means the workspace default from `workspace_settings.brand_feature_defaults`, which means on.
  - `featureOn(brand, key, defaults)` is pure.
  - `brands.nine_stage_default` (nullable) overrides `workspace_settings.nine_stage_default` at task creation. `createTask`, `addVideo` and `createTasks` read the brand first.
- **Rationale**: no rows to migrate, and an untouched brand behaves exactly as today.

## R12. Names, nav and the sidebar

- **Decision**:
  - The nav items stay. "Team" is relabelled **Plan** (its address stays `/team`), and the Board toggle reads **Mine / Everyone** (message changes only).
  - Under the nav, the sidebar adds **Me** (My tasks, then pinned folders, which move from under Sheets), **Teams** (the Spaces the member belongs to, or all of them for admins) and **Brands** (each with its four Folders).
  - **Everything** is the existing `/board`.
- **Rationale**: no addresses change (FR-012, FR-012a), and pinned folders gain a clearer home.

# Contract: server actions (022)

Every action checks its own permission (constitution §III). Results are `{ success: true, … } | { success: false, error }`.

## src/actions/media.ts (new)

### `listUnlinkedMedia(query)`
- Who: any member. Returns the unlinked media tasks (Design and Video, not dropped), searched by name, for the Link task list.

### `linkFromCalendar(spaceId, day, name, target)`
- Who: any member who may create tasks. Makes the content task (`name`, publishing date `day`, in that Space) and calls `linkToMedia` with `target`.

### `linkToMedia(contentTaskId, target: { mediaTaskId } | { create: { boards: ('design'|'video')[], people?: Record<board, memberId | null> } })`
- Who: any member who may act on the content task, or a member of the board's Space.
- Refuses: `not_content_task` (it is a media task), `past_d_check` (content task at F-Check or later, R11), `already_linked` (per board, skipped not failed).
- Does: with `mediaTaskId`, links that unlinked media task to the content task (refused `already_linked` if it is linked, or if the content task already has a task on that board). With `create`, one linked media task per new board, at Ready For Design (its SLA clock starts when the content task reaches Ready For Design, R10); assignee = given person, else the board Space's default assignee.
- Returns: `{ created: { board, taskId }[] }`.

### `createMediaTask(board, input: { name, brand_id, publish_date?, due_date?, assignee_id? })`
- Who: members of the board's Space, superusers, admins.
- Does: an unlinked media task, `status = 'r-design'`, `entry_stage = 'r-design'`, shown on that board.

### `unlinkMedia(mediaTaskId)`
- Who: any signed-in member (R14, user 2026-11-23).
- Does: clears `content_task_id`; if the content task was waiting (R2), it is released at its current stage.

## src/actions/tasks.ts (changed)

### `moveTask(taskId, to)`
- Content task entering Ready For Design with `auto_linked_at` null: returns `{ handoff: { boards: [...], suggested: Record<board, memberId> } }` so the box can ask; the confirm call is `linkToMedia` with the chosen people, which also sets `auto_linked_at`.
- Content task with linked media tasks before D-Check passed: moves past D-Check are refused (`waiting_on_media`).
- Linked media task passing D-Check: if it is the last, the content task moves to F-Check in the same call.
- Linked media task after D-Check: refused (`follows_content`).

### `createTask(input)`
- Always a pipeline task (no kind). Assignee defaults to the Space's default assignee role (R9) when not given.

### `updateTask(taskId, { assignee_id })`
- Applies the "Shows in" removal rule (data-model, task_spaces).

## src/actions/space-stages.ts (new)

### `saveSpaceStages(spaceId, stages: { id?, stage_id, name, position, aliases }[])`
- Who: admins and superusers.
- Validates as in data-model; refuses with `{ error: 'invalid', problems: [...] }`.
- Never changes any task's original stage.

### `moveSubStage(taskId, spaceId, spaceStageId)`
- Who: anyone with access to the Space (FR-009).
- Refuses `other_stage` when the Space stage maps to a different original stage than the task's current stage (that is a normal move).
- Writes `task_space_stages` only.

## src/actions/spaces.ts (changed)

### `updateSpace(id, { default_assignee_role })`
- Who: admins. Applies to new tasks only.

## src/actions/settings.ts (changed)

### `setContentTypeBoards(label, boards)`
- Who: admins.

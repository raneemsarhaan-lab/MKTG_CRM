# Contract: Server actions (spec 009)

All in `src/actions/content.ts` (new), except the drop changes in `src/actions/tasks.ts`. Results never throw. Error codes are spec 008's plus:
- `not_a_theme`;
- `may_not_add`;
- `may_not_edit_theme`;
- `bad_frequency`;
- `bad_audience`;
- `duplicate_pillar`.

Each write revalidates `/board`, `/overview` and `/projects`.

## `addPlan(rows, opts)`

```ts
type PlanRowInput = {
  /** A matched task in another theme moves here only when this is true (spec edge case). */
  move?: boolean
  theme: string; owner?: string; frequency?: string; audience?: string; pillar?: string
  title: string; type?: string; status?: string
  working_doc?: string; design?: string; task_link?: string; post?: string; published?: string
}
addPlan(rows: PlanRowInput[], opts: { useSheetTitleStatus: boolean }): Promise<{
  success: boolean; error?: string
  created?: string[]; updated?: string[]; skipped?: string[]
  themesCreated?: string[]; pillarsCreated?: string[]
  problems?: { row: number; code: string }[]
}>
```

- 1–300 rows.
- Runs in one transaction under `pg_advisory_xact_lock(hashtext('content-plan'))`.
- Re-reads every value with the shared `parse-plan` readers (status, type, frequency, audience, Task Link, links).
- Rows with problems the server can detect (missing task, `may_not_add`, new theme without admin rights) are skipped and listed. Links that aren't web addresses are dropped, never stored.
- **A matched task** (Task Link) gets:
  - `project_id` and `pillar_id`;
  - `content_type_label` if the row has a type;
  - its empty `post_url`, `published_url` and role links;
  - with `useSheetTitleStatus`: `name`, and `status` with `stage_date` today if the stage changed. Archived sets `dropped_at`.
- **A new task** is created with:
  - the row's title;
  - the mapped stage (Archived: To Do, with `dropped_at`);
  - the type;
  - `task_owner_id` = the matched owner, or the caller;
  - `assignee_id` null;
  - the theme's brand, project and pillar, and the links.

## `addPiece(themeId, { title, pillarId? })`

Requires `mayAddPiece`. Creates a task in To Do, owned by the caller, with the theme's brand and project and the pillar; content type Post.

## `updatePiece(taskId, patch)`

```ts
type PiecePatch = { pillar_id?: string | null; due_date?: string | null; post_url?: string | null; published_url?: string | null }
```

Requires `canAct`. The pillar must belong to the task's theme. The due date is a `YYYY-MM-DD` string or null. (Title, type and assignee go through `updateTask`. Pieces aren't clips, so their published link goes through `updatePiece`, not `updateClip`.)

## `setPieceLink(taskId, role, url)`

`role` is `working_doc` or `design`. Requires `mayAttachTo`. Replaces this role's link attachment, or removes it when `url` is empty. Returns the row.

## Themes and pillars

- `addTheme(name)`: admin or superuser. Matches an existing project by name (ignoring case and spaces) and sets `is_theme`; otherwise creates a standing project.
- `saveTheme(id, { name?, owner_id?, frequency_count?, frequency_period?, audience? })`: admin, superuser or the theme owner.
- `savePillar(themeId, { id?, name })`: creates or renames. Names are unique per theme, ignoring case.
- `removePillar(id)`: the pillar's pieces keep their theme and lose the pillar.

## Archive

`dropTask(taskId)` and `restoreTask(taskId)` follow spec 008's `dropClip` and `restoreClip`, for a clip of a video **or** a piece of a theme. `dropClip` and `restoreClip` remain as aliases.

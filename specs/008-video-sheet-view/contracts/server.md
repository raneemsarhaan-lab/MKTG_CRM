# Contract: Server actions

**Feature**: spec 008 · All actions are in `src/actions/tasks.ts` unless noted. Each returns a result object and never throws to the client.

Error codes are shared with the existing actions:
- `not_authenticated`, `not_found`, `not_authorized`;
- `stage_not_in_pipeline`, `terminal`;
- new: `not_a_video`, `dropped`, `bad_link`, `bad_times`.

After a write, each action revalidates `/board` and `/overview`, as the existing actions do. `/capacity` is revalidated too when an assignee or a dropped flag changes.

---

## `addClips(videoId, rows)`: new

```ts
type ClipRowInput = {
  title: string
  file_name?: string | null   // re-parsed on the server
  link?: string | null        // Drive or other web link
}
addClips(videoId: string, rows: ClipRowInput[]): Promise<{
  success: boolean
  created?: { id: string; name: string; clip: ClipDetails; link_attachment_id: string | null }[]
  skipped?: string[]          // file names already under this video
  error?: string
}>
```

- **Who**: any signed-in member (FR-030). This is the only creation path open to `user`-level members, and it only creates clip subtasks (FR-036).
- **Checks**:
  - the video exists, is `content_type_label === 'Video'`, has no `parent_task_id`, and has no `dropped_at` (else `not_a_video`);
  - 1–200 rows;
  - links are `http(s)` (else the link is ignored and the row kept, with `bad_link` in its result).
- **Creates**: the task, its `TaskClip` and an optional link attachment for each row, in one transaction, with the defaults in research R2.
- **Duplicates**: a duplicate `(video_id, file_name)` row is skipped and its file name returned in `skipped` (edge case "two people paste").
- **Times**: for a row with a `file_name` matching `FILE_RE`, `clip_no`, `source`, `in_ms` and `out_ms` come from the name. A row whose name doesn't match stores the name as given, with blank details.

## `updateClip(taskId, patch)`: new

```ts
type ClipPatch = {
  clip_no?: number | null
  source?: string | null
  file_name?: string | null
  in_ms?: number | null
  out_ms?: number | null
  published_url?: string | null   // on Task
}
updateClip(taskId: string, patch: ClipPatch): Promise<{ success: boolean; error?: string; clip?: ClipDetails }>
```

- **Who**: `canAct` (owner, assignee, admin, superuser).
- **Writes**: it upserts the `TaskClip` row (`video_id` = the task's `parent_task_id`), so subtasks made before this feature can gain details.
- **Checks**: `0 ≤ in < out ≤ 24 h` after the patch (else `bad_times`); `published_url` must be `http(s)` or empty (else `bad_link`); a file name clash under the video returns `duplicate_file_name`.
- Title, assignee and type are **not** here; they use the existing `updateTask`.

## `dropClip(taskId)` / `restoreClip(taskId)`: new

```ts
dropClip(taskId: string): Promise<{ success: boolean; error?: string }>
restoreClip(taskId: string): Promise<{ success: boolean; error?: string; stage_date?: string }>
```

- **Who**: `canAct`. The task must have a `TaskClip` row (else `not_a_clip`).
- **Drop**: sets `dropped_at = now()`. It never changes status, attachments or comments (FR-063).
- **Restore**: clears `dropped_at` and sets `stage_date = subtractBusinessDays(today, businessDaysBetween(stage_date, dropped_at))` (FR-061, research R14). It returns the new stage date for the optimistic update.
- Both are idempotent: dropping a dropped clip, or restoring a live one, succeeds with no change.

## `addLinkAttachment(taskId, url)`: new

```ts
addLinkAttachment(taskId: string, url: string): Promise<{
  success: boolean; error?: string
  row?: { id: string; filename: string; url: string; content_type: 'text/uri-list'; uploaded_by: string | null; uploaded_at: string }
}>
```

- **Who**: `mayAttachTo` (the same as uploads, FR-046).
- `url` is trimmed, must be `http:` or `https:` and ≤ 2,000 characters (else `bad_link`).
- **Duplicates**: if the task already has a link row with the same URL, that row is returned and nothing is added.
- `filename` is `Google Drive` for `drive.google.com` and `docs.google.com`, otherwise the host name.

## `setTaskStage(taskId, stageId)` / `moveTask(taskId)`: changed internally

- The contract is unchanged. Both now decide with `allowedStages(task, member)` from `src/lib/stage-moves.ts`, so the sheet's menu and the server agree by construction (SC-003).
- New: a task with `dropped_at` is refused with `dropped`.
- `shouldCelebrate` is unchanged: true only when the member holds the stage being left and the move goes forward (§V).

## `src/lib/stage-moves.ts`: new, pure, shared by server and client

```ts
export function holdsStage(task: { status: StageId; task_owner_id: string; assignee_id: string | null },
                           member: { id: string; role: string }): boolean
export function allowedStages(task: { status: StageId; nine_stage: boolean; task_owner_id: string; assignee_id: string | null; dropped_at?: string | Date | null },
                              member: { id: string; role: string; access: AccessLevel }): StageId[]
// → [] when dropped, or when the member neither holds the current stage nor is admin/superuser;
//   otherwise every stage on the task's path except the current one, in path order.
```

## Upload route `POST /api/attachments/[ref]`: unchanged

The Files cell uses it through `makeUploader` (`src/lib/attachment-upload.ts`, moved out of `TaskModal`). The limits, checks and no-compression rule are those of spec 007's `contracts/server.md`.

## Queries that must leave dropped clips out (research R6)

| Location | Change |
|---|---|
| `src/app/(app)/board/page.tsx` | Loads all, plus `clip`, `content_type` on attachments, and `dropped_at` on subtasks. `KanbanBoard` splits out `liveTasks`. |
| `src/app/(app)/overview/page.tsx` (both `findMany`) | `where: { dropped_at: null }` |
| `src/app/(app)/capacity/page.tsx` | `where: { dropped_at: null }` |
| `src/actions/projects.ts:672`, `:703` | `dropped_at: null` |
| `src/actions/members.ts:184–187` | `dropped_at: null` |

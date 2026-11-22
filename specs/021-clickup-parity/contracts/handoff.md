# Contract: the hand-off (US6, FR-028–FR-033, FR-030a)

## The rule (pure, `src/lib/spaces.ts`)

```ts
needsHandoff(
  task: { kind: TaskKind; status: StageId; nine_stage: boolean },
  target: StageId,
  shownIn: string[],          // space ids
  spaces: { id: string; is_production: boolean; archived_at: string | null }[],
): boolean
```

The function returns true only when **all** of these hold:

1. `task.kind === 'pipeline'`;
2. the task's current stage is before `r-design` on its path;
3. the target is `r-design` or any later stage on the path;
4. the task shows in no Space with `is_production` and no `archived_at`.

```ts
handoffDefaults(task, spaces, members): { spaceIds: string[]; candidates: Record<spaceId, memberId[]> }
```

- It pre-ticks the Video Space for `content_type_label` Video or Reel, and the Design Space for anything else.
- Candidates are the members of each production Space.

## Server behaviour

### `setTaskStage(taskId, target)` and `moveTask(taskId)`

These are existing actions. A new check runs after `allowedStages` passes:

```ts
if (needsHandoff(...)) return { success: false, error: 'needs_handoff', target, defaults }
```

Nothing is written. Every other result is unchanged.

### `handOff(taskId, { target, spaceIds, assigneeId })` (new, `src/actions/task-spaces.ts`)

Runs as one transaction:

1. Load the task. Refuse with `not_authorized` unless `allowedStages(task, member)` includes `target`. This is the same check as a move.
2. Refuse with `invalid` if:
   - `spaceIds` is empty;
   - any id is not a live production Space;
   - `assigneeId` is not a member of one of `spaceIds`.
3. Upsert a `task_spaces` row for each Space, with `added_via = 'handoff'`.
4. If the assignee changed, set `assignee_id`, follow with `clearMute`, and notify 'assigned'. This is the code path `updateTask` uses (`tasks.ts:269-283`).
5. Then:
   - add the assignee's other Spaces (FR-029);
   - move the stage, set `stage_date`, and send the moved-to-stage notifications;
   - compute `shouldCelebrate`. All three are exactly as `setTaskStage` does them.
6. Return `{ success: true, shouldCelebrate, spaces }`.

### `bulkUpdateTasks(ids, { status })`

- Each task that `needsHandoff` is skipped. The result gains `handoff: number`, beside today's `refused` count.
- The UI message reads: "*n* need a hand-off. Open the task to hand it off."

### `addPlan(...)`

These rows are skipped and counted under `handoff`, the same way:
- matched rows whose pasted stage would need a hand-off;
- new rows pasted at `r-design` or later.

### Assigning a task

`updateTask` and bulk assignment add the assignee's Spaces (FR-029):
- `added_via = 'assignee'`;
- Spaces whose `default_kind` is 'simple' are skipped for pipeline tasks.

## Client behaviour

| Path | On `needs_handoff` |
|---|---|
| TaskModal **Advance** | Opens `HandoffDialog` for this task. |
| TaskModal **stage menu** | Opens `HandoffDialog` with the chosen target. |
| **Board drag** across columns | The card returns to its column, then `HandoffDialog` opens with the dropped column as the target. |
| **Inbox** move | Opens `HandoffDialog`. |
| **Sheet status cell** (typed, one cell) | Opens `HandoffDialog` and reverts the cell until it is confirmed. |
| **Sheet fill or paste** (several cells) | Counts as refused, with the same message as bulk. No run of boxes. |
| **Bulk bar**, **Paste plan** | The message names the count. |

## `HandoffDialog`

- **Title**: "Where should this task show?"
- **Shows**:
  - the task name;
  - the Spaces it already shows in, as read-only chips;
  - one checkbox per production Space, with its members listed;
  - "Assign to", a select of the members of the ticked Spaces.
- **Confirm** ("Move to {target stage}") is disabled until at least one Space is ticked and an assignee is chosen. It calls `handOff`, then plays the celebration if `shouldCelebrate`.
- **Cancel** closes the dialog and changes nothing.
- **Phones**: a bottom sheet. **Arabic**: mirrored. Focus is trapped in the dialog, and Esc cancels.
- **Strings** live in the `handoff` namespace (English and Arabic).

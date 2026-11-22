# Contract: server actions (new and changed)

Every action checks its own permission first (HANDOVER ground rule 9).

Each action returns `{ success: true, ... }` or `{ success: false, error }`. `error` is one of:

| Code | Meaning |
|---|---|
| `not_authenticated` | No signed-in member. |
| `not_authorized` | The member may not do this. |
| `invalid` | The input is wrong. |
| `not_found` | The target doesn't exist. |
| `needs_handoff` | The move needs the hand-off box. |
| `clash` | A status word is already used for another stage. |

## New: `src/actions/spaces.ts`

| Action | Who | Does |
|---|---|---|
| `createSpace({ name, color, is_production, default_kind })` | admin | Adds a Space at the end of the sidebar. |
| `updateSpace(id, patch)` | admin | Renames and changes colour, `is_production`, `default_kind` and `sort_order`. |
| `setSpaceMembers(id, memberIds)` | admin | Replaces the member list. |
| `archiveSpace(id)` / `restoreSpace(id)` | admin | Sets or clears `archived_at`. |
| `deleteSpace(id, confirmName)` | admin | Only works on an archived Space, and `confirmName` must equal its name. Its `task_spaces` rows go with it; tasks are untouched. |
| `setSpaceWords(id, words)` | admin, superuser | For 'content' and 'video', writes the linked sheet's `view.words` (research R5); otherwise writes `team_spaces.words`. Rejects with `clash` when a word is used for two stages. |

## New: `src/actions/task-spaces.ts`

| Action | Who | Does |
|---|---|---|
| `addTaskSpace(taskId, spaceId)` | `canAct` on the task | Adds a row with `added_via = 'manual'`. |
| `removeTaskSpace(taskId, spaceId)` | `canAct` on the task | Deletes the row. Nothing else changes (FR-032). |
| `handOff(taskId, { target, spaceIds, assigneeId })` | `allowedStages` includes `target` | See [handoff.md](./handoff.md). |

## New: `src/actions/views.ts`

| Action | Who | Does |
|---|---|---|
| `saveView({ id?, node, type, name, config, personal })` | Shared: admin, superuser or the creator. Personal: the owner. | Creates or updates a view. |
| `deleteView(id)` | as above | |
| `reorderViews(node, ids)` | as above | |

## New: `src/actions/brands.ts`

| Action | Who | Does |
|---|---|---|
| `setBrandFeatures(brandId, features)` | admin | Stores overrides (FR-019–FR-021). |
| `setBrandFeatureDefaults(features)` | admin | Sets `workspace_settings.brand_feature_defaults`. |
| `setBrandNineStage(brandId, value \| null)` | admin | Sets the brand's Islam Check default for new tasks. |
| `ensureBrandSheetFolder(brandId)` | any member | Creates the brand's blank-tab folder on first open; idempotent. |

`addBrandAsset` and `removeBrandAsset` (`settings.ts`) are reused unchanged, admin-only. The Assets Folder shows the add form to admins only.

## Changed: `src/actions/tasks.ts`

| Action | Change |
|---|---|
| `createTask(input)` | **Permission**: `requireTaskCreatorFor(input.owner)` (research R10). **New inputs**: `kind` (defaults to the Space's `default_kind`, else 'pipeline'), `spaceId?` (adds a 'created' row; without it, the creator's Space or the chosen one, FR-028). `nine_stage` comes from the brand first (research R11). |
| `createTasks(rows)` | Same permission and defaults per row. |
| `moveTask`, `setTaskStage` | Return `needs_handoff` (handoff.md). Refuse simple tasks with `invalid`. |
| `setSimpleStatus(taskId, status)` | **New.** `canAct`. Only for `kind = 'simple'`. Returns `shouldCelebrate` when moving to 's-done' and the member is the assignee. |
| `updateTask(id, patch)` | An assignee change adds the assignee's Spaces (FR-029). `kind` stays immutable, like `nine_stage`. |
| `bulkUpdateTasks(ids, patch)` | Gains a `handoff` count. An assignee patch adds Spaces. Simple tasks are skipped for status patches. |

## Changed: `src/actions/content.ts`

`addPlan` skips the rows that need a hand-off and returns them as `handoff: number` (FR-030a).

## Changed: `src/actions/sheet-links.ts`

- `createTasksForRows` uses `requireTaskCreatorFor(self)` for users. `linkChoices.canCreate` becomes true for users.
- Created tasks take the brand from the row's brand cell when it names a brand, or the brand folder's brand when the sheet is a brand tab.

## Loaders (server components)

| Loader | Returns |
|---|---|
| `loadBoardData()` (changed) | Today's fields, plus `spaces`, `spaceMembers`, `taskSpaces` (flat arrays), and `kind` and `simple_status` on each task. |
| `loadMyTasks(memberId)` (new) | The same shapes, restricted to My tasks (data-model.md). Also returns the member's `me:<id>` columns and values. |
| `loadViews(node, memberId)` (new) | The shared views plus the member's personal ones. |
| `loadBrand(brandId)` (new) | The brand, its features merged with the defaults, its assets, campaigns (projects) and folder id. |

'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember, requireTaskCreator } from '@/lib/authz'
import { nextStageId, NINE_STAGE, EIGHT_STAGE } from '@/lib/stage-meta'
import { STAGE_META } from '@/lib/stage-meta'
import type { StageId, MoveTaskResult } from '@/types/index'

// ─── moveTask ───────────────────────────────────────────────────────────────

export async function moveTask(taskId: string): Promise<MoveTaskResult> {
  const member = await getSessionMember()
  if (!member) return { success: false, shouldCelebrate: false, error: 'not_authenticated' }

  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) return { success: false, shouldCelebrate: false, error: 'not_found' }

  const nextStage = nextStageId(task.status as StageId, task.nine_stage)
  if (!nextStage) return { success: false, shouldCelebrate: false, error: 'terminal' }

  // Own-stage check: working stage → task owner; review stage → role match.
  // Mirrors `canAdvance` in TaskModal — the client hides the button, this
  // enforces it. Admin and superuser may advance any stage as an override.
  const stageMeta = STAGE_META[task.status as StageId]
  const isOwnStage = !stageMeta.owner_role
    ? task.task_owner_id === member.id
    : stageMeta.owner_role === member.role

  const canAdvance = isOwnStage || member.access === 'admin' || member.access === 'superuser'
  if (!canAdvance) return { success: false, shouldCelebrate: false, error: 'not_authorized' }

  // An override advance is not the overrider's win — no celebration.
  const shouldCelebrate = isOwnStage

  await prisma.task.update({
    where: { id: taskId },
    data:  { status: nextStage, stage_date: new Date(), updated_at: new Date() },
  })

  revalidatePath('/board')
  revalidatePath('/overview')
  return { success: true, shouldCelebrate }
}

// ─── setTaskStage ───────────────────────────────────────────────────────────

/**
 * Move a task to a specific stage — what a board drag means.
 *
 * `moveTask` only knows "forward one"; a drag can land anywhere, including
 * backwards, which is how a rejected review is expressed. Same authorisation
 * as moveTask: whoever owns the stage the task is leaving, or an admin /
 * superuser override. The check is on the *current* stage, not the target —
 * the right to hand work on belongs to the person holding it.
 *
 * The target must exist in this task's own path. An 8-stage task cannot be
 * dragged into c-check; that column simply rejects the drop.
 */
export async function setTaskStage(
  taskId: string,
  stageId: StageId,
): Promise<MoveTaskResult> {
  const member = await getSessionMember()
  if (!member) return { success: false, shouldCelebrate: false, error: 'not_authenticated' }

  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) return { success: false, shouldCelebrate: false, error: 'not_found' }

  const path = task.nine_stage ? NINE_STAGE : EIGHT_STAGE
  const fromIdx = path.indexOf(task.status as StageId)
  const toIdx   = path.indexOf(stageId)
  if (toIdx === -1) return { success: false, shouldCelebrate: false, error: 'stage_not_in_pipeline' }
  if (toIdx === fromIdx) return { success: true, shouldCelebrate: false }

  const stageMeta = STAGE_META[task.status as StageId]
  const isOwnStage = !stageMeta.owner_role
    ? task.task_owner_id === member.id
    : stageMeta.owner_role === member.role

  const allowed = isOwnStage || member.access === 'admin' || member.access === 'superuser'
  if (!allowed) return { success: false, shouldCelebrate: false, error: 'not_authorized' }

  await prisma.task.update({
    where: { id: taskId },
    data:  { status: stageId, stage_date: new Date(), updated_at: new Date() },
  })

  revalidatePath('/board')
  revalidatePath('/overview')

  // Only progress is a win, and only for the person whose stage it was —
  // pulling a task back or overriding someone else's stage celebrates nothing.
  return { success: true, shouldCelebrate: isOwnStage && toIdx > fromIdx }
}

// ─── addComment ─────────────────────────────────────────────────────────────

export async function addComment(
  taskId: string,
  body: string,
): Promise<{ success: boolean; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  await prisma.taskComment.create({
    data: { task_id: taskId, author_id: member.id, body: body.trim() },
  })

  revalidatePath('/board')
  return { success: true }
}

// ─── updateTask ─────────────────────────────────────────────────────────────

/**
 * Edit a task's attributes in place (wireframe 1d: attribute rows are inline
 * editors, no separate edit mode).
 *
 * Every field a user sets at intake can be corrected afterwards. Three things
 * are deliberately absent from the patch type and cannot be changed here:
 *
 *  - `status` — stage changes go through moveTask, which is where the
 *    permission check and the Published-is-terminal rule live (ground rule 7).
 *  - `nine_stage` — immutable after creation by design; flipping it would
 *    silently move work backwards or skip a required approval (HANDOVER §8).
 *  - `stage_date` — the SLA clock. It is set when a task enters a stage.
 *
 * SLA itself is not a task field at all; it is the stage × content-type matrix
 * in Settings, so it is out of reach here by construction. Note that changing
 * `content_type_label` does change which SLA row applies to this task.
 *
 * Authorised like moveTask: the task's owner, or an admin/superuser.
 */
export interface TaskPatch {
  name?:               string
  description?:        string
  brand_id?:           string
  content_type_label?: string
  platform?:           string
  campaign?:           string
  task_owner_id?:      string
  due_date?:           string   // ISO yyyy-mm-dd
  hours_estimate?:     number
  priority?:           'Low' | 'Medium' | 'High'
  cover_image_url?:    string
}

export async function updateTask(
  taskId: string,
  patch: TaskPatch,
): Promise<{ success: boolean; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) return { success: false, error: 'not_found' }

  const allowed =
    task.task_owner_id === member.id ||
    member.access === 'admin' ||
    member.access === 'superuser'
  if (!allowed) return { success: false, error: 'not_authorized' }

  // Build the update explicitly — never spread the caller's object into
  // Prisma, or an extra key like `status` would ride along.
  const data: Record<string, unknown> = { updated_at: new Date() }

  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return { success: false, error: 'Task name cannot be empty' }
    data.name = name
  }
  if (patch.description !== undefined)        data.description        = patch.description.trim() || null
  if (patch.brand_id !== undefined)           data.brand_id           = patch.brand_id || null
  if (patch.content_type_label !== undefined) data.content_type_label = patch.content_type_label || null
  if (patch.platform !== undefined)           data.platform           = patch.platform || null
  if (patch.campaign !== undefined)           data.campaign           = patch.campaign.trim() || null
  if (patch.task_owner_id !== undefined)      data.task_owner_id      = patch.task_owner_id
  if (patch.cover_image_url !== undefined)    data.cover_image_url    = patch.cover_image_url.trim() || null
  if (patch.priority !== undefined)           data.priority           = patch.priority

  if (patch.due_date !== undefined) {
    const d = new Date(patch.due_date)
    if (Number.isNaN(d.getTime())) return { success: false, error: 'Invalid due date' }
    data.due_date = d
  }
  if (patch.hours_estimate !== undefined) {
    const h = Number(patch.hours_estimate)
    if (!Number.isFinite(h) || h < 0 || h > 999) return { success: false, error: 'Invalid estimate' }
    data.hours_estimate = h
  }

  await prisma.task.update({ where: { id: taskId }, data })

  revalidatePath('/board')
  revalidatePath('/overview')
  revalidatePath('/capacity')
  return { success: true }
}

// ─── createSubtask ──────────────────────────────────────────────────────────

/**
 * Create a child of an existing task — the Insert ▸ New subtask action.
 *
 * A subtask is an ordinary task. It gets its own stage, SLA clock and owner,
 * and appears on the board like anything else; the only difference is that it
 * knows its parent, which the card and the panel show. Nothing in the pipeline
 * treats it specially, so no stage logic had to learn about it.
 *
 * It inherits the parent's brand, content type and owner, because a subtask
 * raised from a brief is almost always the same work broken down.
 */
export async function createSubtask(
  parentId: string,
  name: string,
): Promise<{ success: boolean; id?: string; name?: string; error?: string }> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }

  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: 'Subtask name cannot be empty' }

  const parent = await prisma.task.findUnique({ where: { id: parentId } })
  if (!parent) return { success: false, error: 'not_found' }

  // Same rule as editing the parent: its owner, or an admin/superuser.
  const allowed =
    parent.task_owner_id === member.id ||
    member.access === 'admin' ||
    member.access === 'superuser'
  if (!allowed) return { success: false, error: 'not_authorized' }

  const task = await prisma.task.create({
    data: {
      name:               trimmed,
      parent_task_id:     parent.id,
      brand_id:           parent.brand_id,
      content_type_label: parent.content_type_label,
      platform:           parent.platform,
      campaign:           parent.campaign,
      task_owner_id:      parent.task_owner_id,
      initiator_role:     member.role,
      nine_stage:         parent.nine_stage,
      status:             'todo',
      stage_date:         new Date(),
      due_date:           parent.due_date,
      hours_estimate:     0,
      priority:           parent.priority,
      created_by:         member.id,
    },
  })

  revalidatePath('/board')
  revalidatePath('/overview')
  return { success: true, id: task.id, name: task.name }
}

// ─── bulk operations ────────────────────────────────────────────────────────

export interface BulkResult {
  success: boolean
  changed:  number
  refused:  number
  error?:   string
}

/**
 * Apply one patch to many tasks — the bulk action bar.
 *
 * Every task is authorised individually against the same rule as updateTask,
 * and the result reports how many were refused rather than failing the whole
 * batch. Selecting forty tasks and finding one belongs to someone else should
 * change thirty-nine, not zero.
 *
 * `status` moves are handled here too, unlike updateTask, because a bulk
 * "move to stage" is a real need. It carries setTaskStage's rule — the stage
 * being left decides — and resets the SLA clock exactly as a drag does.
 */
export async function bulkUpdateTasks(
  taskIds: string[],
  patch: TaskPatch & { status?: StageId },
): Promise<BulkResult> {
  const member = await getSessionMember()
  if (!member) return { success: false, changed: 0, refused: 0, error: 'not_authenticated' }
  if (taskIds.length === 0) return { success: true, changed: 0, refused: 0 }

  const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } } })
  const isAdmin = member.access === 'admin' || member.access === 'superuser'

  let changed = 0, refused = 0

  for (const task of tasks) {
    const data: Record<string, unknown> = { updated_at: new Date() }

    if (patch.status !== undefined) {
      const path = task.nine_stage ? NINE_STAGE : EIGHT_STAGE
      if (!path.includes(patch.status)) { refused++; continue }

      const stageMeta = STAGE_META[task.status as StageId]
      const ownsStage = !stageMeta.owner_role
        ? task.task_owner_id === member.id
        : stageMeta.owner_role === member.role
      if (!ownsStage && !isAdmin) { refused++; continue }

      if (patch.status !== task.status) {
        data.status = patch.status
        data.stage_date = new Date()
      }
    }

    if (patch.status === undefined || Object.keys(patch).length > 1) {
      if (task.task_owner_id !== member.id && !isAdmin) { refused++; continue }
    }

    if (patch.task_owner_id !== undefined)      data.task_owner_id      = patch.task_owner_id
    if (patch.brand_id !== undefined)           data.brand_id           = patch.brand_id || null
    if (patch.content_type_label !== undefined) data.content_type_label = patch.content_type_label || null
    if (patch.platform !== undefined)           data.platform           = patch.platform || null
    if (patch.campaign !== undefined)           data.campaign           = patch.campaign.trim() || null
    if (patch.priority !== undefined)           data.priority           = patch.priority
    if (patch.due_date !== undefined) {
      const d = new Date(patch.due_date)
      if (Number.isNaN(d.getTime())) { refused++; continue }
      data.due_date = d
    }

    if (Object.keys(data).length === 1) continue   // nothing but updated_at
    await prisma.task.update({ where: { id: task.id }, data })
    changed++
  }

  revalidatePath('/board')
  revalidatePath('/overview')
  revalidatePath('/capacity')
  return { success: true, changed, refused }
}

/**
 * Delete tasks outright.
 *
 * Same authorisation as editing — owner, admin or superuser — because a task
 * you may rewrite entirely you may also remove. Comments and attachments go
 * with it by cascade; subtasks are kept and simply lose their parent, which is
 * why the relation is onDelete: SetNull rather than Cascade.
 */
export async function bulkDeleteTasks(taskIds: string[]): Promise<BulkResult> {
  const member = await getSessionMember()
  if (!member) return { success: false, changed: 0, refused: 0, error: 'not_authenticated' }
  if (taskIds.length === 0) return { success: true, changed: 0, refused: 0 }

  const isAdmin = member.access === 'admin' || member.access === 'superuser'
  const tasks   = await prisma.task.findMany({ where: { id: { in: taskIds } } })

  const allowed = tasks.filter(t => isAdmin || t.task_owner_id === member.id).map(t => t.id)
  const refused = tasks.length - allowed.length

  if (allowed.length) await prisma.task.deleteMany({ where: { id: { in: allowed } } })

  revalidatePath('/board')
  revalidatePath('/overview')
  revalidatePath('/capacity')
  return { success: true, changed: allowed.length, refused }
}

// ─── createTask ─────────────────────────────────────────────────────────────

interface CreateTaskInput {
  name:               string
  description?:       string
  brand_id:           string
  content_type_label: string
  task_owner_id:      string
  due_date:           string
  platform?:          string
  campaign?:          string
  hours_estimate?:    number
  priority?:          'Low' | 'Medium' | 'High'
  cover_image_url?:   string
}

export async function createTask(
  input: CreateTaskInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const auth = await requireTaskCreator()
  if (auth.error) return { success: false, error: auth.error }
  const member = auth.member

  // Fetch workspace default for nine_stage
  const ws = await prisma.workspaceSettings.findUnique({ where: { id: 1 } })
  const nineStage = ws?.nine_stage_default ?? false

  const task = await prisma.task.create({
    data: {
      name:               input.name,
      description:        input.description?.trim() || null,
      brand_id:           input.brand_id || null,
      content_type_label: input.content_type_label || null,
      platform:           input.platform   ?? null,
      campaign:           input.campaign   ?? null,
      task_owner_id:      input.task_owner_id,
      initiator_role:     member.role,
      nine_stage:         nineStage,
      status:             'todo',
      stage_date:         new Date(),
      due_date:           new Date(input.due_date),
      hours_estimate:     input.hours_estimate ?? 0,
      priority:           input.priority ?? 'Medium',
      cover_image_url:    input.cover_image_url ?? null,
      created_by:         member.id,
    },
  })

  revalidatePath('/board')
  return { success: true, id: task.id }
}

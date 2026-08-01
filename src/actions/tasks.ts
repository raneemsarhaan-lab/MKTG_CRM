'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember, requireTaskCreator } from '@/lib/authz'
import { nextStageId } from '@/lib/stage-meta'
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
